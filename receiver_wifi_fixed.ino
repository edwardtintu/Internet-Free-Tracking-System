#include <SPI.h>
#include <LoRa.h>
#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

// ----------------------------------------
// WiFi credentials
// ----------------------------------------
const char* ssid = "bsnl wifi";          // Replace with your WiFi SSID
const char* password = "admin299785";       // Replace with your WiFi password

// Backend server URL (change IP to your computer's IP if needed)
const char* serverUrl = "http://192.168.1.3:5000/api/upload";

// ----------------------------------------
// LoRa pins (same as transmitter)
// ----------------------------------------
#define LORA_SS   D8
#define LORA_RST  D0
#define LORA_DIO0 D2

#define LORA_FREQ 433E6

WiFiClient wifiClient;

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("📡 LoRa Receiver + WiFi Uploader starting...");

  // Connect to WiFi with better timeout handling
  Serial.print("🔌 Connecting to WiFi: ");
  Serial.print(ssid);
  Serial.print(" ... ");
  WiFi.begin(ssid, password);

  int timeout = 0;
  while (WiFi.status() != WL_CONNECTED && timeout < 30) {
    delay(500);
    Serial.print(".");
    timeout++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.print("✅ WiFi connected. IP=");
    Serial.println(WiFi.localIP());
    Serial.print("📡 Server URL: ");
    Serial.println(serverUrl);  // Debug line to verify URL
  } else {
    Serial.println();
    Serial.println("❌ WiFi connection failed!");
    Serial.print("SSID: ");
    Serial.println(ssid);
    Serial.print("Password: ");
    Serial.println(password);
  }

  // Initialize LoRa
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println("❌ LoRa init failed! Check wiring.");
    while (1);
  }

  // *** CRITICAL: Configure SAME parameters as transmitter ***
  LoRa.setSpreadingFactor(7);      // Must match transmitter
  LoRa.setSignalBandwidth(125E3);  // Must match transmitter
  LoRa.setCodingRate4(5);          // Must match transmitter
  LoRa.setPreambleLength(8);       // Must match transmitter
  LoRa.setSyncWord(0x12);          // Must match transmitter (CRITICAL!)
  LoRa.enableCrc();                // Enable CRC checking

  Serial.println("✅ LoRa Receiver Ready.");
  Serial.println("Freq: 433MHz, SF7, BW125, CR4/5, SyncWord=0x12");
}

void loop() {
  int packetSize = LoRa.parsePacket();
  
  if (packetSize) {
    Serial.println("📥 Packet Received!");

    String received = "";
    while (LoRa.available()) {
      received += (char)LoRa.read();
    }

    int rssi = LoRa.packetRssi();
    
    Serial.print("📥 Raw: ");
    Serial.println(received);

    // Parse Key:Value pairs with better error handling
    float lat = 0, lon = 0, alt = 0, spd = 0, bat = 0;
    int sats = 0;
    int i;

    // Parse LAT
    if ((i = received.indexOf("LAT:")) != -1) {
      int endPos = received.indexOf(',', i);
      if (endPos == -1) endPos = received.length(); // If no comma after LAT, use end of string
      lat = received.substring(i + 4, endPos).toFloat();
    }

    // Parse LON
    if ((i = received.indexOf("LON:")) != -1) {
      int endPos = received.indexOf(',', i);
      if (endPos == -1) endPos = received.length();
      lon = received.substring(i + 4, endPos).toFloat();
    }

    // Parse ALT
    if ((i = received.indexOf("ALT:")) != -1) {
      int endPos = received.indexOf(',', i);
      if (endPos == -1) endPos = received.length();
      alt = received.substring(i + 4, endPos).toFloat();
    }

    // Parse SPD
    if ((i = received.indexOf("SPD:")) != -1) {
      int endPos = received.indexOf(',', i);
      if (endPos == -1) endPos = received.length();
      spd = received.substring(i + 4, endPos).toFloat();
    }

    // Parse SAT
    if ((i = received.indexOf("SAT:")) != -1) {
      int endPos = received.indexOf(',', i);
      if (endPos == -1) endPos = received.length();
      sats = received.substring(i + 4, endPos).toInt();
    }

    // Parse BAT (no comma after BAT, so use end of string)
    if ((i = received.indexOf("BAT:")) != -1) {
      bat = received.substring(i + 4).toFloat();
    }

    Serial.println("Parsed: lat=" + String(lat, 6) + 
                   " lon=" + String(lon, 6) + 
                   " alt=" + String(alt, 1) + 
                   " spd=" + String(spd, 2) + 
                   " sats=" + String(sats) + 
                   " bat=" + String(bat, 2) + 
                   " rssi=" + String(rssi));

    // Upload to server if WiFi is connected
    if (WiFi.status() == WL_CONNECTED && lat != 0 && lon != 0) {
      HTTPClient http;

      // Set timeout for HTTP requests
      http.setTimeout(10000);  // 10 second timeout

      http.begin(wifiClient, serverUrl);
      http.addHeader("Content-Type", "application/json");

      // Build JSON payload
      String jsonPayload = "{";
      jsonPayload += "\"latitude\":" + String(lat, 6) + ",";
      jsonPayload += "\"longitude\":" + String(lon, 6) + ",";
      jsonPayload += "\"altitude\":" + String(alt, 1) + ",";
      jsonPayload += "\"speed\":" + String(spd, 2) + ",";
      jsonPayload += "\"satellites\":" + String(sats) + ",";
      jsonPayload += "\"battery\":" + String(bat, 2) + ",";
      jsonPayload += "\"rssi\":" + String(rssi);
      jsonPayload += "}";

      Serial.print("📤 Uploading to server: ");
      Serial.print(serverUrl);
      Serial.print(" with data: ");
      Serial.println(jsonPayload);

      int httpCode = http.POST(jsonPayload);

      if (httpCode > 0) {
        Serial.print("✅ HTTP Response: ");
        Serial.println(httpCode);

        if (httpCode == HTTP_CODE_OK) {
          String response = http.getString();
          Serial.println("Server response: " + response);
        } else {
          // Print error response if not HTTP OK
          String response = http.getString();
          Serial.println("Server error response: " + response);
        }
      } else {
        Serial.print("❌ POST failed, error: ");
        Serial.println(http.errorToString(httpCode));
        Serial.print("URL attempted: ");
        Serial.println(serverUrl);
      }

      http.end();
    } else if (lat == 0 && lon == 0) {
      Serial.println("⚠️ Invalid coordinates, skipping upload");
    } else {
      Serial.println("❌ WiFi not connected, data not uploaded");
    }

    Serial.println("-------------------------");
  }
}
