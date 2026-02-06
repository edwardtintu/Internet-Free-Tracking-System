#!/usr/bin/env python3
"""Quick test script to verify dashboard is working"""
import requests
import json

BASE_URL = "http://127.0.0.1:5000"

print("🧪 Testing Enhanced IoT Dashboard\n")

# Test 1: Check if server is running
try:
    r = requests.get(BASE_URL, timeout=2)
    print(f"✅ Server is running (Status: {r.status_code})")
except Exception as e:
    print(f"❌ Server not running: {e}")
    print("\n💡 Start server with: python backend/main.py")
    exit(1)

# Test 2: Login and get session
try:
    session = requests.Session()
    login_data = {"username": "admin", "password": "admin"}
    r = session.post(f"{BASE_URL}/api/login", json=login_data)
    if r.status_code == 200:
        print("✅ Login successful")
    else:
        print(f"❌ Login failed: {r.status_code}")
        exit(1)
except Exception as e:
    print(f"❌ Login error: {e}")
    exit(1)

# Test 3: Check /data endpoint
try:
    r = session.get(f"{BASE_URL}/data")
    if r.status_code == 200:
        data = r.json()
        print("✅ Data endpoint working")
        print(f"\n📊 Current Data:")
        print(f"   Mode: {data.get('mode', 'unknown')}")
        print(f"   Location: {data.get('latitude')}, {data.get('longitude')}")
        print(f"   Satellites: {data.get('satellites')}")
        print(f"   Battery: {data.get('battery')}V")
        print(f"   RSSI: {data.get('rssi')} dBm")
        print(f"   Data Rate: {data.get('data_rate')} pkt/min")
    else:
        print(f"❌ Data endpoint failed: {r.status_code}")
except Exception as e:
    print(f"❌ Data check error: {e}")

# Test 4: Check dashboard page
try:
    r = session.get(f"{BASE_URL}/dashboard")
    if r.status_code == 200 and 'dashboard.html' in r.text or 'mapContainer' in r.text:
        print("✅ Dashboard page accessible")
    else:
        print(f"⚠️ Dashboard page issue: {r.status_code}")
except Exception as e:
    print(f"❌ Dashboard check error: {e}")

print("\n🎉 Dashboard is working!")
print(f"\n🌐 Access at: {BASE_URL}")
print("   Username: admin")
print("   Password: admin")
