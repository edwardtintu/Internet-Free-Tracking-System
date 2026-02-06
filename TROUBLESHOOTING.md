# TARP Project - Troubleshooting Guide

## Problem: Corrupted LoRa Data (Garbled Serial Output)

### Root Cause
The garbled data you saw (`������)@k���!`) indicates **LoRa configuration mismatch** between transmitter and receiver.

### Solution Applied

#### 1. **Sync Word Mismatch** (Most Critical)
- **Problem**: Transmitter and receiver had different or missing sync words
- **Fix**: Both devices now use `LoRa.setSyncWord(0x12)`
- **Impact**: Sync word is like a "channel ID" - if they don't match, data is corrupted

#### 2. **Missing LoRa Parameters**
- **Problem**: Original code didn't explicitly set spreading factor, bandwidth, coding rate
- **Fix**: Both devices now configured with:
  ```cpp
  LoRa.setSpreadingFactor(7);      // SF7 for faster transmission
  LoRa.setSignalBandwidth(125E3);  // 125 kHz bandwidth
  LoRa.setCodingRate4(5);          // CR 4/5
  LoRa.setPreambleLength(8);       // 8 symbols
  LoRa.setSyncWord(0x12);          // MUST MATCH!
  LoRa.enableCrc();                // CRC error checking
  ```

#### 3. **WiFi Upload Error (-1)**
- **Problem**: HTTP POST failing with error code -1
- **Possible causes**:
  - Backend server not running
  - Wrong IP address in receiver code
  - Firewall blocking port 5000
- **Fix**: Receiver now has better error handling and validation

## How to Fix Your Setup

### Step 1: Upload Fixed Firmware

#### Transmitter (GPS + LoRa TX)
1. Open `transmitter_fixed.ino` in Arduino IDE
2. Install required libraries:
   - TinyGPS++
   - LoRa by Sandeep Mistry
3. Select board: **NodeMCU 1.0 (ESP-12E Module)**
4. Upload to transmitter ESP8266

#### Receiver (LoRa RX + WiFi)
1. Open `receiver_wifi_fixed.ino` in Arduino IDE
2. **IMPORTANT**: Update WiFi credentials (lines 10-11):
   ```cpp
   const char* ssid = "your_wifi_name";
   const char* password = "your_wifi_password";
   ```
3. Update server IP address (line 14) to your computer's IP:
   ```cpp
   const char* serverUrl = "http://YOUR_COMPUTER_IP:5000/api/upload";
   ```
4. Install required libraries:
   - LoRa by Sandeep Mistry
   - ESP8266WiFi (built-in)
   - ESP8266HTTPClient (built-in)
5. Select board: **NodeMCU 1.0 (ESP-12E Module)**
6. Upload to receiver ESP8266

### Step 2: Start Backend Server

```bash
cd backend
pip install -r requirements.txt
python create_admin.py
python main.py
```

### Step 3: Test the System

1. **Check Transmitter Serial Monitor** (115200 baud):
   - Should see: `✅ LoRa transmitter ready`
   - Should see: `📤 Sending: LAT:xx.xxxxxx,LON:yy.yyyyyy...`

2. **Check Receiver Serial Monitor** (115200 baud):
   - Should see: `✅ WiFi connected. IP=...`
   - Should see: `✅ LoRa Receiver Ready`
   - Should see: `📥 Packet Received!`
   - Should see: `📥 Raw: LAT:...` (clean text, not garbled!)
   - Should see: `✅ HTTP Response: 200`

3. **Check Backend Console**:
   - Should see POST requests to `/api/upload`

4. **Open Dashboard**:
   - Go to `http://YOUR_COMPUTER_IP:5000`
   - Login with credentials from `create_admin.py`
   - Should see live GPS tracking

## Common Issues

### Issue 1: Still Getting Garbled Data
**Solution**:
- Make sure BOTH devices have been uploaded with the FIXED code
- Power cycle both devices after upload
- Check that LoRa modules are properly wired
- Verify both use same frequency (433MHz)

### Issue 2: WiFi Connection Failed
**Solution**:
- Double-check SSID and password (case-sensitive!)
- Make sure 2.4GHz WiFi is enabled (ESP8266 doesn't support 5GHz)
- Check WiFi signal strength near receiver

### Issue 3: HTTP POST Error -1
**Solution**:
- Find your computer's IP: `ipconfig` (Windows) or `ifconfig` (Mac/Linux)
- Update `serverUrl` in receiver code to match
- Ensure backend server is running (`python main.py`)
- Disable Windows Firewall or allow port 5000
- Test backend: `curl http://YOUR_IP:5000/data` from another device

### Issue 4: "Invalid coordinates, skipping upload"
**Solution**:
- GPS needs clear sky view to get fix
- Can take 1-5 minutes for first fix (cold start)
- Check GPS module wiring and antenna

### Issue 5: Parser Returns lat=0.000000
**Solution**:
- Check that transmitter is actually sending data
- Verify comma separators in packet format
- Ensure LoRa is receiving clean data (no garbled text)

## LoRa Configuration Reference

| Parameter | Value | Why? |
|-----------|-------|------|
| Frequency | 433 MHz | Legal in most regions, good range |
| Spreading Factor | 7 | Balance of speed vs range |
| Bandwidth | 125 kHz | Standard LoRa bandwidth |
| Coding Rate | 4/5 | Error correction |
| Sync Word | 0x12 | Must match on both devices! |
| Preamble | 8 symbols | Standard length |
| CRC | Enabled | Detect corrupted packets |

### Adjusting for Better Range
If you need more range but slower updates:
```cpp
LoRa.setSpreadingFactor(10);  // SF10 instead of SF7
```

If you need faster updates but shorter range:
```cpp
LoRa.setSpreadingFactor(6);   // SF6 (minimum)
```

## Pin Wiring Reference

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
```

### Receiver (ESP8266 + LoRa)
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

## Testing Without GPS
If you want to test LoRa communication without waiting for GPS fix:

In `transmitter_fixed.ino`, replace the GPS check with:
```cpp
// Test mode - send fake GPS data
float lat = 12.863796;
float lon = 78.787860;
float alt = 300.0;
int sats = 5;
float spd = 2.5;
float battery = 3.75;

// ... rest of transmission code
```

## Success Indicators

✅ **Transmitter working**: Clean serial output with GPS coordinates  
✅ **LoRa working**: Receiver shows clean text (not garbled)  
✅ **WiFi working**: Receiver shows "✅ WiFi connected"  
✅ **Backend working**: HTTP 200 responses  
✅ **Full system**: Dashboard updates with live location  

## Getting Help

If issues persist:
1. Post serial monitor output from BOTH devices
2. Include backend server console output
3. Verify all wiring with photos
4. Check Arduino IDE board selection
