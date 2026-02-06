from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
import threading, time, json
from datetime import datetime
import random
import math
import os

# local modules
from db import init_db, save_packet, get_latest, create_user, verify_user, get_user_by_id, save_receiver_status, get_last_receiver_status
from flask_login import LoginManager, UserMixin, login_user, logout_user, login_required, current_user

# Config
SERIAL_ENABLED = False
SERIAL_PORT = "COM5"
SERIAL_BAUD = 115200

app = Flask(__name__, static_folder='../frontend', static_url_path='/')
# Set a strong secret key for sessions
app.secret_key = os.urandom(24)

# Configure CORS with security in mind
# For development: allow localhost and local network
# For production: set ALLOWED_ORIGINS environment variable
allowed_origins = os.getenv('ALLOWED_ORIGINS', 'http://localhost:5000,http://127.0.0.1:5000,http://192.168.1.3:5000')
CORS(app, 
     supports_credentials=True, 
     origins=allowed_origins.split(','),
     allow_headers=['Content-Type'],
     methods=['GET', 'POST'])

# --------------------------- LOGIN MANAGER --------------------------
login_manager = LoginManager()
login_manager.init_app(app)
login_manager.login_view = "/login"

class User(UserMixin):
    def __init__(self, id, username, role):
        self.id = id
        self.username = username
        self.role = role

@login_manager.user_loader
def load_user(user_id):
    u = get_user_by_id(int(user_id))
    if u:
        return User(u["id"], u["username"], u["role"])
    return None

# --------------------------- AUTH ROUTES ----------------------------
@app.route('/login')
def login_page():
    return send_from_directory(app.static_folder, 'login.html')

@app.route('/api/login', methods=['POST'])
def api_login():
    payload = request.json or {}
    username = payload.get("username")
    password = payload.get("password")

    if not username or not password:
        return jsonify({"success": False, "message": "Missing credentials"}), 400

    user = verify_user(username, password)
    if user:
        uobj = User(user["id"], username, user["role"])
        login_user(uobj)
        return jsonify({"success": True})
    return jsonify({"success": False, "message": "Invalid username/password"}), 401

@app.route('/api/logout', methods=['POST'])
@login_required
def api_logout():
    logout_user()
    return jsonify({"success": True})

@app.route('/api/set_data_source', methods=['POST'])
@login_required
def set_data_source():
    """Set preferred data source: simulated or hardware"""
    global preferred_data_source, latest, latest_hardware, latest_simulated
    
    try:
        data = request.get_json(force=True)
    except:
        return jsonify({"success": False, "message": "Invalid JSON"}), 400
    
    source = data.get("source", "simulated")
    
    if source not in ["simulated", "hardware"]:
        return jsonify({"success": False, "message": "Invalid source"}), 400
    
    preferred_data_source = source
    
    # Immediately update latest with the preferred source
    if source == "hardware" and latest_hardware:
        latest = latest_hardware
    elif source == "simulated":
        latest = latest_simulated.copy()
    
    return jsonify({"success": True, "source": source})

# --------------------------- DATA UPLOAD ENDPOINT -------------------
@app.route('/api/upload', methods=['POST'])
def api_upload():
    """Endpoint for hardware transmitter (GPS tracker) to upload data"""
    try:
        data = request.get_json(force=True)
    except:
        return jsonify({"success": False, "message": "Invalid JSON"}), 400

    # minimal validation
    if not data or "latitude" not in data or "longitude" not in data:
        return jsonify({"success": False, "message": "missing lat/lon"}), 400

    # Mark hardware as connected
    global last_hardware_update, latest, latest_hardware
    last_hardware_update = datetime.utcnow()
    
    # build canonical packet (backend timestamp preferred)
    # Only the fields sent by the Arduino receiver should be required
    packet = {
        "timestamp": datetime.utcnow().isoformat(),
        "latitude": float(data.get("latitude")),
        "longitude": float(data.get("longitude")),
        "altitude": float(data.get("altitude", 0.0)),
        "speed": float(data.get("speed", 0.0)),
        "satellites": int(data.get("satellites", 0)),
        "battery": float(data.get("battery", 0.0)),
        "rssi": int(data.get("rssi", 0)),
        # These fields are not sent by the Arduino receiver, so we set defaults
        "temperature": float(data.get("temperature", 0.0)),
        "humidity": float(data.get("humidity", 0.0)),
        "mode": "live",
        "data_rate": 15,  # packets per minute
        "packet_loss": int(data.get("packet_loss", 0)),
        "latency": int(data.get("latency", 0))
    }

    # Store as hardware data
    latest_hardware = packet
    
    # Update global latest if hardware is preferred
    if preferred_data_source == "hardware":
        latest = packet
    
    try:
        save_packet(packet)
    except Exception as e:
        print("DB save error:", e)
        return jsonify({"success": False, "message": "Database error"}), 500

    # Log received data for debugging
    print(f"Received packet: LAT={packet['latitude']}, LON={packet['longitude']}, "
          f"ALT={packet['altitude']}, SPD={packet['speed']}, SAT={packet['satellites']}, "
          f"BAT={packet['battery']}, RSSI={packet['rssi']}")

    return jsonify({"success": True})

# --------------------------- GLOBAL LATEST PACKET -------------------
latest = {
    "timestamp": datetime.utcnow().isoformat(),
    "latitude": 12.9692,   # VIT Vellore SJT default
    "longitude": 79.1559,  # VIT Vellore SJT default
    "altitude": 310.0,
    "speed": 0.5,
    "satellites": 6,
    "rssi": -65,
    "battery": 3.78,
    "mode": "simulated",  # "simulated" or "live"
    "data_rate": 15,
    "packet_loss": 0,
    "latency": 25,
    "temperature": 0.0,    # Not sent by Arduino but included for schema consistency
    "humidity": 0.0        # Not sent by Arduino but included for schema consistency
}

last_hardware_update = None
HARDWARE_TIMEOUT = 10  # seconds

# Data source preference (per-session or global)
preferred_data_source = "simulated"  # "simulated" or "hardware"

# Storage for latest hardware and simulated data
latest_hardware = None
latest_simulated = latest.copy()

# Hardware receiver (base station) location - separate from transmitter
hardware_receiver_location = None

init_db()

# --------------------------- SIM GENERATOR ---------------------------
def sim_generator():
    global latest, latest_simulated, last_hardware_update, preferred_data_source
    
    # Start near VIT Vellore SJT with slight offset
    lat = 12.9692 + random.uniform(-0.002, 0.002)  # Within VIT campus
    lon = 79.1559 + random.uniform(-0.002, 0.002)
    battery = 3.9
    packet_count = 0
    
    # Simulate movement parameters
    direction = random.uniform(0, 360)  # Random initial direction
    movement_speed = 0.00001  # Approximate walking speed in degrees

    while True:
        # Always generate simulated data with realistic movement within VIT campus
        # Simulate walking around campus
        direction += random.uniform(-30, 30)  # Change direction slightly
        lat += movement_speed * math.cos(math.radians(direction))
        lon += movement_speed * math.sin(math.radians(direction))
        
        # Keep within VIT campus bounds (approx 0.01 degrees ~1km)
        lat = max(12.96, min(12.98, lat))
        lon = max(79.15, min(79.17, lon))
        
        battery = max(3.2, battery - random.uniform(0.0001, 0.0003))
        packet_count += 1

        data = {
            "timestamp": datetime.utcnow().isoformat(),
            "latitude": round(lat, 6),
            "longitude": round(lon, 6),
            "altitude": round(310 + random.uniform(-5, 5), 1),
            "speed": round(random.uniform(0.5, 2.5), 2),  # Walking/slow movement
            "satellites": random.randint(5, 9),
            "battery": round(battery, 3),
            "rssi": random.randint(-75, -45),
            "mode": "simulated",
            "data_rate": packet_count % 30,  # packets in last 60s
            "packet_loss": random.randint(0, 3),
            "latency": random.randint(15, 60),
            # Additional sensor data (not sent by Arduino but included for schema consistency)
            "temperature": round(random.uniform(25, 35), 1),  # Vellore climate
            "humidity": round(random.uniform(40, 75), 1)  # Typical humidity
        }

        # Store simulated data
        latest_simulated = data
        
        # Update global latest only if simulated is preferred
        if preferred_data_source == "simulated":
            latest = data
            save_packet(data)
        
        time.sleep(2.5)  # Match the Arduino transmitter interval of 2.5 seconds

# --------------------------- PROTECTED API ---------------------------
@app.route('/data')
@login_required
def get_data():
    # Return data based on the preferred source
    if preferred_data_source == "hardware" and latest_hardware:
        return jsonify(latest_hardware)
    else:
        return jsonify(latest)

@app.route('/data/latest_hardware')
@login_required
def get_latest_hardware():
    """Return only the latest hardware data, or empty if none available"""
    if latest_hardware:
        return jsonify(latest_hardware)
    else:
        return jsonify({}), 204  # No Content

@app.route('/history')
@login_required
def history():
    n = int(request.args.get('n', 100))
    rows = get_latest(n)
    return jsonify(rows)

@app.route('/receiver_status')
@login_required
def receiver_status():
    status = get_last_receiver_status()
    if not status:
        # Return a safe default (offline at SJT) instead of 404 so the UI can render
        status = {
            "timestamp": datetime.utcnow().isoformat(),
            "latitude": 12.9692,   # VIT Vellore SJT fallback
            "longitude": 79.1559,  # VIT Vellore SJT fallback
            "signal_strength": 0,
            "is_online": 0
        }
    return jsonify(status)

@app.route('/api/base_station_location')
@login_required
def base_station_location():
    """Get base station (receiver) location based on current mode"""
    global hardware_receiver_location, preferred_data_source
    
    if preferred_data_source == "hardware" and hardware_receiver_location:
        # Return actual hardware receiver location
        return jsonify(hardware_receiver_location)
    else:
        # Return fixed VIT SJT location for simulated mode
        return jsonify({
            "timestamp": datetime.utcnow().isoformat(),
            "latitude": 12.9692,   # VIT Vellore SJT (fixed for simulation)
            "longitude": 79.1559,  # VIT Vellore SJT (fixed for simulation)
            "signal_strength": -65,
            "is_online": 1
        })

@app.route('/api/receiver_heartbeat', methods=['POST'])
def receiver_heartbeat():
    """Endpoint for hardware receiver (base station) to report its location and status"""
    try:
        data = request.get_json(force=True)
    except:
        return jsonify({"success": False, "message": "Invalid JSON"}), 400

    receiver_data = {
        "timestamp": datetime.utcnow().isoformat(),
        "latitude": float(data.get("latitude", 0)),
        "longitude": float(data.get("longitude", 0)),
        "signal_strength": int(data.get("signal_strength", 0)),
        "is_online": 1
    }

    # Store receiver data globally for hardware mode
    global hardware_receiver_location
    hardware_receiver_location = receiver_data

    try:
        save_receiver_status(receiver_data)
    except Exception as e:
        print("Receiver status save error:", e)
        return jsonify({"success": False, "message": "Database error"}), 500

    return jsonify({"success": True})

# --------------------------- FRONTEND / STATIC ----------------------
@app.route('/')
@login_required
def index():
    return send_from_directory(app.static_folder, 'dashboard_enhanced.html')

@app.route('/dashboard')
@login_required
def dashboard():
    return send_from_directory(app.static_folder, 'dashboard_enhanced.html')

@app.route('/old')
@login_required
def old_dashboard():
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/<path:path>')
def static_proxy(path):
    # Allow login.html without needing authentication
    if path == "login.html":
        return send_from_directory(app.static_folder, path)

    return send_from_directory(app.static_folder, path)

# -------------------------------------------------------------------
if __name__ == "__main__":
    t = threading.Thread(target=sim_generator, daemon=True)
    t.start()
    app.run(host="0.0.0.0", port=5000, debug=True)
