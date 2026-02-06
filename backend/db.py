import sqlite3
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash

DB_PATH = "lost_person_db.sqlite"

def init_db():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS packets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        altitude REAL,
        speed REAL,
        satellites INTEGER,
        battery REAL,
        rssi INTEGER
    );
    """)
    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    """)
    # Receiver status table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS receiver_status (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        latitude REAL,
        longitude REAL,
        signal_strength INTEGER,
        is_online INTEGER DEFAULT 1
    );
    """)
    conn.commit()
    conn.close()

def save_packet(data: dict):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO packets (timestamp, latitude, longitude, altitude, speed, satellites, battery, rssi)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    """, (
        data.get("timestamp", datetime.utcnow().isoformat()),
        data.get("latitude"),
        data.get("longitude"),
        data.get("altitude"),
        data.get("speed"),
        data.get("satellites"),
        data.get("battery"),
        data.get("rssi")
    ))
    conn.commit()
    conn.close()

def get_latest(n=100):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT timestamp, latitude, longitude, altitude, speed, satellites, battery, rssi FROM packets ORDER BY id DESC LIMIT ?", (n,))
    rows = cursor.fetchall()
    conn.close()
    return [
        {
            "timestamp": r[0],
            "latitude": r[1],
            "longitude": r[2],
            "altitude": r[3],
            "speed": r[4],
            "satellites": r[5],
            "battery": r[6],
            "rssi": r[7]
        } for r in rows
    ]

# ---------- user helpers ----------
def create_user(username: str, password: str, role: str = "user"):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    password_hash = generate_password_hash(password)
    try:
        cursor.execute("INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                       (username, password_hash, role))
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    finally:
        conn.close()

def verify_user(username: str, password: str):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, password_hash, role FROM users WHERE username = ?", (username,))
    row = cursor.fetchone()
    conn.close()
    if not row:
        return None
    uid, password_hash, role = row
    if check_password_hash(password_hash, password):
        return {"id": uid, "username": username, "role": role}
    return None

def get_user_by_id(uid):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT id, username, role FROM users WHERE id = ?", (uid,))
    r = cursor.fetchone()
    conn.close()
    if r:
        return {"id": r[0], "username": r[1], "role": r[2]}
    return None

# ---------- receiver status helpers ----------
def save_receiver_status(data: dict):
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("""
        INSERT INTO receiver_status (timestamp, latitude, longitude, signal_strength, is_online)
        VALUES (?, ?, ?, ?, ?)
    """, (
        data.get("timestamp", datetime.utcnow().isoformat()),
        data.get("latitude"),
        data.get("longitude"),
        data.get("signal_strength", 0),
        data.get("is_online", 1)
    ))
    conn.commit()
    conn.close()

def get_last_receiver_status():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT timestamp, latitude, longitude, signal_strength, is_online FROM receiver_status ORDER BY id DESC LIMIT 1")
    row = cursor.fetchone()
    conn.close()
    if row:
        return {
            "timestamp": row[0],
            "latitude": row[1],
            "longitude": row[2],
            "signal_strength": row[3],
            "is_online": row[4]
        }
    return None
