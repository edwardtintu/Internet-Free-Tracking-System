# TARP - Tracking and Rescue Platform (LoRa-Based Emergency Tracker)

A comprehensive, internet-free tracking system using LoRa technology for emergency and rescue operations. The system enables real-time GPS tracking of individuals in remote areas where cellular networks are unavailable, making it ideal for search and rescue missions, outdoor expeditions, and emergency personnel monitoring.

## 🚀 Project Overview

TARP (Tracking and Rescue Platform) is an end-to-end LoRa-based tracking solution featuring:
- Real-time GPS tracking with interactive map visualization
- Live telemetry monitoring (RSSI, battery, altitude, speed)
- Dual-mode operation (simulated for development, hardware for deployment)
- Secure web-based dashboard with authentication
- ESP8266-based transmitter and receiver units
- SQLite database for data persistence

## 🏗️ System Architecture

```
[GPS Device] → [LoRa Transmitter (ESP8266)] → [LoRa Receiver (ESP8266)] → [Backend Server] → [Web Dashboard]
     ↓                    ↓                           ↓                        ↓                 ↓
GPS Reading        LoRa Packet              WiFi Upload           Data Storage      Live Tracking
```

### Components:
- **Transmitter Unit**: ESP8266 with GPS module and LoRa radio, worn by tracked individual
- **Receiver Unit**: ESP8266 with LoRa radio and WiFi, acts as gateway to backend
- **Backend Server**: Flask-based server with SQLite database
- **Frontend Dashboard**: Interactive web interface with maps and charts

## 📋 Features

- **Real-time GPS Tracking**: Live location updates on interactive map
- **Telemetry Monitoring**: Battery voltage, signal strength (RSSI), altitude, speed
- **Dual Operation Modes**: Simulated mode for development/testing, hardware mode for deployment
- **Authentication System**: Secure login with role-based access
- **Data Visualization**: Charts for signal strength and battery trends
- **Distance Measurement**: Real-time distance calculation from base station
- **Historical Data**: SQLite storage for tracking history and analytics
- **Cross-platform**: Runs on Windows, macOS, and Linux

## 🛠️ Hardware Requirements

### Transmitter Unit (Field Device)
- 1x ESP8266 NodeMCU
- 1x LoRa SX1278 module (433MHz)
- 1x GPS NEO-6M module
- 1x 3.7V LiPo battery (for extended operation)
- Breadboard and jumper wires

### Receiver Unit (Base Station)
- 1x ESP8266 NodeMCU
- 1x LoRa SX1278 module (433MHz)
- WiFi network access
- Breadboard and jumper wires

### Software Requirements
- Python 3.8+
- Arduino IDE with ESP8266 board support
- Compatible browser (Chrome/Firefox recommended)

## 🔧 Wiring Diagrams

### Transmitter (ESP8266 + GPS + LoRa)
```
GPS NEO-6M:
  VCC → 3.3V
  GND → GND
  TX → D1 (GPIO5)
  RX → D2 (GPIO4)

LoRa SX1278:
  VCC → 3.3V
  GND → GND
  SCK → D5 (GPIO14)
  MISO → D6 (GPIO12)
  MOSI → D7 (GPIO13)
  NSS → D8 (GPIO15)
  RST → D0 (GPIO16)
  DIO0 → D2 (GPIO4)

Battery (Optional):
  Battery → A0 (with voltage divider)
```

### Receiver (ESP8266 + LoRa + WiFi)
```
LoRa SX1278:
  VCC → 3.3V
  GND → GND
  SCK → D5 (GPIO14)
  MISO → D6 (GPIO12)
  MOSI → D7 (GPIO13)
  NSS → D8 (GPIO15)
  RST → D0 (GPIO16)
  DIO0 → D2 (GPIO4)
```

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/TARP.git
cd TARP
```

### 2. Backend Setup
```bash
cd backend
pip install -r requirements.txt
python create_admin.py  # Creates admin user
python main.py          # Starts the server
```

### 3. Hardware Setup
1. Install required Arduino libraries:
   - LoRa by Sandeep Mistry
   - TinyGPS++

2. Update WiFi credentials in `receiver_wifi_fixed.ino`:
   ```cpp
   const char* ssid = "YOUR_WIFI_SSID";
   const char* password = "YOUR_WIFI_PASSWORD";
   ```

3. Update server IP in `receiver_wifi_fixed.ino`:
   ```cpp
   const char* serverUrl = "http://YOUR_COMPUTER_IP:5000/api/upload";
   ```

4. Upload firmware:
   - Upload `transmitter_fixed.ino` to transmitter ESP8266
   - Upload `receiver_wifi_fixed.ino` to receiver ESP8266

### 4. Access the Dashboard
Open your browser and navigate to:
```
http://YOUR_COMPUTER_IP:5000
```

Default credentials:
- Username: `admin`
- Password: `admin`

## 📊 API Endpoints

- `POST /api/login` - Authenticate user
- `POST /api/logout` - Logout user
- `POST /api/set_data_source` - Switch between simulated/hardware mode
- `POST /api/upload` - Receive data from LoRa receiver
- `GET /data` - Get latest tracking data
- `GET /history?n=100` - Get historical data points
- `GET /receiver_status` - Get receiver status

## 🔧 Configuration Options

### Environment Variables
- `ALLOWED_ORIGINS`: Comma-separated list of allowed origins for CORS
- `SERIAL_ENABLED`: Enable/disable serial communication mode
- `SERIAL_PORT`: Serial port for direct connection (if not using WiFi)

### LoRa Parameters
The system uses these LoRa settings for reliable communication:
- Frequency: 433 MHz
- Spreading Factor: 7 (balance of speed and range)
- Bandwidth: 125 kHz
- Coding Rate: 4/5
- Sync Word: 0x12 (critical for matching transmitter/receiver)
- CRC: Enabled

## 🐛 Troubleshooting

### Common Issues

1. **Garbled LoRa Data**: Ensure both transmitter and receiver have identical LoRa parameters
2. **WiFi Connection Failures**: Verify SSID/password and ensure 2.4GHz network
3. **No GPS Fix**: Allow 1-5 minutes for initial GPS acquisition; ensure clear sky view
4. **HTTP Upload Errors**: Check server IP address and ensure backend is running

### Debugging Steps
1. Check serial output on both ESP8266 units
2. Verify all wiring connections
3. Confirm LoRa parameters match between units
4. Test backend connectivity independently

For detailed troubleshooting, refer to `TROUBLESHOOTING.md`.

## 🛡️ Security Considerations

- Change default admin credentials immediately
- Restrict `ALLOWED_ORIGINS` in production environments
- Use HTTPS in production deployments
- Secure WiFi credentials in receiver code
- Consider adding API key authentication for data upload endpoint

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, open an issue first to discuss what you would like to change.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🙏 Acknowledgments

- Uses LoRa technology for long-range, low-power communication
- Built with ESP8266 microcontrollers for cost-effective deployment
- Leverages Leaflet.js for interactive mapping
- Powered by Chart.js for data visualization
- Inspired by emergency and rescue communication needs

## 📞 Support

For support, please check the `TROUBLESHOOTING.md` file or open an issue in the repository.

---
*Project maintained by Edward | Last updated: February 2026*