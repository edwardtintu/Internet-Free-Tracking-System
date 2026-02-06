#include <SoftwareSerial.h>
#include <TinyGPS++.h>
#include <SPI.h>
#include <LoRa.h>

// ----------------------------------------
// GPS: NEO-6M
// GPS TX → ESP8266 D1 (GPIO5)
// ----------------------------------------
SoftwareSerial gpsSerial(5, 4); 
// RX = D1 (GPIO5), TX = D2 (GPIO4)

TinyGPSPlus gps;

// ----------------------------------------
// LoRa SX1278 wiring
// ----------------------------------------
// SCK  → D5 (GPIO14)
// MISO → D6 (GPIO12)
// MOSI → D7 (GPIO13)
// NSS  → D8 (GPIO15)
// RST  → D0 (GPIO16)
// DIO0 → D2 (GPIO4)

#define LORA_SS   D8
#define LORA_RST  D0
#define LORA_DIO0 D2

// Frequency for SX1278 (433 MHz band)
#define LORA_FREQ 433E6

// Battery voltage pin (optional - connect to A0 via voltage divider)
#define BATTERY_PIN A0

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("🚀 Transmitter Starting...");

  // GPS start
  gpsSerial.begin(9600);
  Serial.println("📡 GPS Started...");

  // LoRa start
  LoRa.setPins(LORA_SS, LORA_RST, LORA_DIO0);

  if (!LoRa.begin(LORA_FREQ)) {
    Serial.println("❌ LoRa init failed. Check wiring!");
    while (1);
  }

  // *** CRITICAL: Configure LoRa parameters for reliable transmission ***
  LoRa.setSpreadingFactor(7);      // SF7 (faster, shorter range) to SF12 (slower, longer range)
  LoRa.setSignalBandwidth(125E3);  // 125 kHz bandwidth
  LoRa.setCodingRate4(5);          // CR 4/5
  LoRa.setPreambleLength(8);       // 8 symbol preamble
  LoRa.setSyncWord(0x12);          // Sync word (0x12 default, must match receiver)
  LoRa.enableCrc();                // Enable CRC checking
  LoRa.setTxPower(20);             // Max TX power (20 dBm)

  Serial.println("✅ LoRa transmitter ready.");
  Serial.println("Freq: 433MHz, SF7, BW125, CR4/5");
}

float readBatteryVoltage() {
  // Read battery voltage from A0 (0-1V = 0-4.2V battery with voltage divider)
  // If no battery sensor, return simulated value
  int raw = analogRead(BATTERY_PIN);
  float voltage = (raw / 1023.0) * 4.2; // Adjust based on your voltage divider
  
  // If reading is too low, return simulated value
  if (voltage < 2.5) {
    return 3.72; // Simulated
  }
  return voltage;
}

void loop() {
  // READ GPS DATA
  while (gpsSerial.available()) {
    gps.encode(gpsSerial.read());
  }

  if (gps.location.isUpdated()) {
    
    float lat = gps.location.lat();
    float lon = gps.location.lng();
    float alt = gps.altitude.meters();
    int sats = gps.satellites.value();
    float spd = gps.speed.kmph();
    float battery = readBatteryVoltage();

    // -------------------------
    // TRANSMIT VIA LORA
    // -------------------------
    String packet = 
      "LAT:" + String(lat, 6) +
      ",LON:" + String(lon, 6) +
      ",ALT:" + String(alt, 1) +
      ",SPD:" + String(spd, 2) +
      ",SAT:" + String(sats) +
      ",BAT:" + String(battery, 2);

    Serial.print("📤 Sending: ");
    Serial.println(packet);

    LoRa.beginPacket();
    LoRa.print(packet);
    LoRa.endPacket();

    Serial.println("✅ Packet sent");

  } else {
    Serial.println("⏳ Waiting for GPS fix...");
  }

  delay(2500);
}
