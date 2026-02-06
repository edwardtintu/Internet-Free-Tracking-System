#!/usr/bin/env python3
"""
Script to log data received by the backend from the Arduino receiver.
This will create a file with timestamped entries of all GPS data received.
"""
import sqlite3
import json
from datetime import datetime
import time
import os

DB_PATH = "lost_person_db.sqlite"
LOG_FILE = "received_gps_data.log"

def get_latest_packets(limit=1000):
    """Get the most recent packets from the database"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT timestamp, latitude, longitude, altitude, speed, satellites, battery, rssi FROM packets ORDER BY id DESC LIMIT ?", (limit,))
    rows = cursor.fetchall()
    conn.close()
    return rows

def log_packets_to_file(packets, append=True):
    """Log packets to a text file"""
    mode = 'a' if append else 'w'
    with open(LOG_FILE, mode) as f:
        for packet in packets:
            timestamp, lat, lon, alt, spd, sats, bat, rssi = packet
            log_entry = f"[{timestamp}] LAT:{lat}, LON:{lon}, ALT:{alt}, SPD:{spd}, SAT:{sats}, BAT:{bat}, RSSI:{rssi}\n"
            f.write(log_entry)

def main():
    print("Starting GPS data logger...")
    print(f"Logging to: {LOG_FILE}")
    
    # Create or clear the log file
    if os.path.exists(LOG_FILE):
        os.remove(LOG_FILE)
    
    # Record initial data
    initial_packets = get_latest_packets(1000)
    if initial_packets:
        log_packets_to_file(initial_packets, append=False)
        print(f"Logged {len(initial_packets)} existing packets to {LOG_FILE}")
    else:
        print("No existing packets found in database")
    
    # Continuously monitor for new packets
    last_id = 0
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT MAX(id) FROM packets")
    result = cursor.fetchone()
    if result[0]:
        last_id = result[0]
    conn.close()
    
    print(f"Starting monitoring from packet ID: {last_id}")
    
    while True:
        try:
            time.sleep(2)  # Check every 2 seconds
            
            # Get new packets since last check
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute("SELECT id, timestamp, latitude, longitude, altitude, speed, satellites, battery, rssi FROM packets WHERE id > ? ORDER BY id", (last_id,))
            new_packets = cursor.fetchall()
            conn.close()
            
            if new_packets:
                # Update last_id to the highest ID processed
                last_id = max([p[0] for p in new_packets])
                
                # Extract just the data (without ID) for logging
                packet_data = [p[1:] for p in new_packets]  # Skip the ID column
                
                log_packets_to_file(packet_data, append=True)
                print(f"Logged {len(new_packets)} new packets. Last ID: {last_id}")
                
                # Print the most recent packet to console
                if new_packets:
                    _, timestamp, lat, lon, alt, spd, sats, bat, rssi = new_packets[-1]
                    print(f"  Latest: [{timestamp}] LAT:{lat}, LON:{lon}, ALT:{alt}, SPD:{spd}, SAT:{sats}, BAT:{bat}, RSSI:{rssi}")
        
        except KeyboardInterrupt:
            print("\nStopping GPS data logger...")
            break
        except Exception as e:
            print(f"Error in logger: {e}")
            time.sleep(5)  # Wait before retrying

if __name__ == "__main__":
    main()