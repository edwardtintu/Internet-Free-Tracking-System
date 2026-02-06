const API_BASE = ""; // use same-origin so cookies/sessions work and cross-device access is correct
let map, marker, polyline, pulseCircle, heatLayer, receiverMarker;
let rssiData = [], labels = [];
const pathHistory = [];
const MAX_HISTORY = 20;
let autoFocus = true;
let heatPoints = [];
let batteryData = [], batteryLabels = [];

// Fallback: VIT Vellore SJT location (adjust if needed)
const SJT = { lat: 12.9692, lon: 79.1559 };

// Map configuration - Google Maps API key loaded from backend
// Falls back to OpenStreetMap if no key is provided
const GOOGLE_MAPS_API_KEY = ''; // Will be populated by backend template - DO NOT COMMIT REAL KEY HERE
const USE_GOOGLE_MAPS = GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY.length > 0;

// Receiver tracking
const RECEIVER_TIMEOUT = 15000; // 15 seconds

function rssiToBars(rssi) {
  if (rssi > -50) return "📶📶📶📶 Excellent";
  if (rssi > -65) return "📶📶📶 Good";
  if (rssi > -80) return "📶📶 Fair";
  return "📶 Poor";
}

function batteryIcon(voltage) {
  const percent = ((voltage - 3.2) / (4.2 - 3.2)) * 100;
  if (percent >= 80) return "🔋";
  if (percent >= 50) return "🔋";
  if (percent >= 20) return "🪫";
  return "⚠️🪫";
}

function gpsFixStatus(sat) {
  if (sat >= 4) return "✅ Fixed";
  if (sat >= 2) return "🟡 Weak";
  return "🔴 Searching...";
}

function toggleRescueMode(enable) {
  document.getElementById("rescueMode").classList.toggle("hidden", !enable);
}

function initMap() {
  // Initialize main map
  map = L.map('map').setView([12.863796, 78.787860], 15);
  
  // Add tile layer - Google Maps or OpenStreetMap (with safe fallback)
  try {
    if (USE_GOOGLE_MAPS && typeof L.gridLayer.googleMutant !== 'undefined' && window.google) {
      // Google Maps (Hybrid)
      L.gridLayer.googleMutant({
        type: 'hybrid',
        maxZoom: 22
      }).addTo(map);
      addLog('Using Google Maps');
    } else {
      throw new Error('Google Maps not available');
    }
  } catch (e) {
    // OpenStreetMap (default)
    L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
    addLog('Using OpenStreetMap (fallback)');
  }
  
  // Add main marker
  marker = L.marker([12.863796, 78.787860]).addTo(map);
  
  // Add path polyline
  polyline = L.polyline([], { color: '#2196F3', weight: 3, opacity: 0.8 }).addTo(map);
  
  // Add pulse circle
  pulseCircle = L.circleMarker([12.863796, 78.787860], {
    radius: 20,
    color: "#00e676",
    weight: 2,
    fillColor: "#00e676",
    fillOpacity: 0.15,
    className: "pulse"
  }).addTo(map);

  // Receiver marker (shown when GPS is waiting)
  receiverMarker = L.circleMarker([SJT.lat, SJT.lon], {
    radius: 8,
    color: '#7C4DFF',
    weight: 3,
    fillColor: '#B39DDB',
    fillOpacity: 0.9
  }).bindTooltip('Receiver (SJT)').addTo(map);
  map.removeLayer(receiverMarker);
  
  // Initialize heatmap layer
  heatLayer = L.heatLayer([], { 
    radius: 25,
    blur: 15,
    maxZoom: 17,
    gradient: {
      0.1: 'blue',
      0.4: 'cyan',
      0.7: 'lime',
      1.0: 'red'
    }
  }).addTo(map);
}
let minimap = L.map('minimap', {
  zoomControl:false,
  attributionControl:false
}).setView([12.863796, 78.787860], 13);

L.tileLayer('https://{s}.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png', {
  maxZoom: 22,
  tileSize: 512,
  zoomOffset: -1
}).addTo(minimap);

let miniMarker = L.circleMarker([12.863796, 78.787860], {
  radius:5,
  color:'#00e676',
  fill:true,
  fillOpacity:1
}).addTo(minimap);

function addLog(msg) {
  const el = document.getElementById("logs");
  el.innerHTML = `${new Date().toLocaleTimeString()} - ${msg}<br>` + el.innerHTML;
}

function updateUI(data) {
  // Determine if GPS is waiting/invalid
  const invalidCoords = !data || data.latitude == null || data.longitude == null || (Math.abs(data.latitude) < 0.0001 && Math.abs(data.longitude) < 0.0001);
  const waitingGPS = (data && typeof data.satellites === 'number' ? data.satellites < 1 : true) || invalidCoords;

  // Apply fallback to SJT if waiting for GPS
  const latitude = waitingGPS ? SJT.lat : data.latitude;
  const longitude = waitingGPS ? SJT.lon : data.longitude;

  // UI numbers
  document.getElementById("lat").innerText = latitude ?? "--";
  document.getElementById("lon").innerText = longitude ?? "--";
  document.getElementById("alt").innerText = data.altitude ?? "--";
  document.getElementById("spd").innerText = data.speed ?? "--";
  document.getElementById("batteryBadge").innerText = `BAT: ${data.battery ?? "--"} V`;
  document.getElementById("lastSeen").innerText = "Last: " + new Date(data.timestamp).toLocaleTimeString();
  document.getElementById("signalIcon").innerText = rssiToBars(data.rssi);
  document.getElementById("batteryStatus").innerText = batteryIcon(data.battery) + " " + data.battery + "V";
  document.getElementById("gpsStatus").innerText = waitingGPS ? "🔴 Waiting (SJT fallback)" : gpsFixStatus(data.satellites);

  // Show receiver at SJT when GPS waiting
  if (waitingGPS) {
    if (!map.hasLayer(receiverMarker)) map.addLayer(receiverMarker);
    receiverMarker.setLatLng([SJT.lat, SJT.lon]);
    addLog("Using SJT fallback location due to GPS waiting");
  } else {
    if (map.hasLayer(receiverMarker)) map.removeLayer(receiverMarker);
  }

  // Check rescue mode conditions
  if (data.battery < 3.3 || data.satellites < 1 || data.rssi < -90) {
    toggleRescueMode(true);
  } else {
    toggleRescueMode(false);
  }

  // Emergency beacon
  if (data.battery < 3.3 || data.satellites < 2) {
    document.getElementById("beacon").classList.remove("hidden");
  } else {
    document.getElementById("beacon").classList.add("hidden");
  }

  // map update
  const latlng = [latitude, longitude];
  marker.setLatLng(latlng);
  pulseCircle.setLatLng(latlng);
  
  // update path history
  pathHistory.push(latlng);
  if (pathHistory.length > MAX_HISTORY) pathHistory.shift();
  polyline.setLatLngs(pathHistory);
  
  // heatmap update
  heatPoints.push([data.latitude, data.longitude, 0.8]);
  if (heatPoints.length > 200) heatPoints.shift();
  heatLayer.setLatLngs(heatPoints);
  
  // auto-focus map update
  if (autoFocus) {
    map.panTo(latlng);
  }
  
  // mini-map update
  miniMarker.setLatLng(latlng);
  minimap.setView(latlng);

  // logs
  addLog(`Packet: RSSI=${data.rssi}, BAT=${data.battery}V`);

  // rssi chart
  rssiData.push(data.rssi);
  labels.push('');
  if (rssiData.length > 30) {
    rssiData.shift();
    labels.shift();
  }
  rssiChart.data.labels = labels;
  rssiChart.data.datasets[0].data = rssiData;
  rssiChart.update();
  
  // battery chart update
  batteryData.push(data.battery);
  batteryLabels.push('');
  if (batteryData.length > 30) {
    batteryData.shift();
    batteryLabels.shift();
  }
  batteryChart.update();

  // battery alert color
  const badge = document.getElementById("batteryBadge");
  const v = data.battery || 0;
  if (v < 3.4) {
    badge.style.background = "#fff0f0";
    badge.style.color = "#d32f2f";
    badge.style.border = "1px solid #ffcdd2";
    addLog("⚠️ Battery low!");
  } else if (v < 3.6) {
    badge.style.background = "#fff8e1";
    badge.style.color = "#f57c00";
    badge.style.border = "1px solid #ffe082";
  } else {
    badge.style.background = "#e8f5e9";
    badge.style.color = "#2e7d32";
    badge.style.border = "1px solid #a5d6a7";
  }
}

// init
try {
  initMap();
} catch(e) {
  console.error('Map init error:', e);
  addLog('Map initialization failed: ' + e.message);
}

const ctx = document.getElementById('rssiChart').getContext('2d');
const rssiChart = new Chart(ctx, {
  type: 'line',
  data: {
    labels: labels,
    datasets: [{
      label: 'RSSI (dBm)',
      data: rssiData,
      borderColor: '#00e676',
      tension: 0.3,
      fill: true,
      backgroundColor: 'rgba(0,230,118,0.08)'
    }]
  },
  options: {
    responsive: true,
    scales: { y: { suggestedMin: -120, suggestedMax: 0 } }
  }
});

// Battery chart
const bctx = document.getElementById('batteryChart').getContext('2d');
const batteryChart = new Chart(bctx, {
  type: 'line',
  data: {
    labels: batteryLabels,
    datasets: [{
      label: 'Battery (V)',
      data: batteryData,
      borderColor: '#ffea00',
      backgroundColor: 'rgba(255,234,0,0.1)',
      tension: 0.3,
      fill: true
    }]
  },
  options: {
    responsive: true,
    scales: { y: { suggestedMin: 3.0, suggestedMax: 4.2 }}
  }
});

// Auto-focus button handler

// Auto-focus button handler
try {
  document.getElementById("lockBtn").onclick = () => {
    autoFocus = !autoFocus;
    const btn = document.getElementById("lockBtn");
    if (!autoFocus) {
      btn.innerText = "🔒 Auto-Focus OFF";
      btn.classList.add("off");
    } else {
      btn.innerText = "🔓 Auto-Focus ON";
      btn.classList.remove("off");
    }
  };
} catch(e) {
  console.error('Lock button error:', e);
}

// fetch loop
async function fetchLoop() {
  try {
    const res = await fetch(API_BASE + "/data", { credentials: 'same-origin' });
    const data = await res.json();
    updateUI(data);
  } catch (e) {
    addLog("Error fetching data: " + e);
  } finally {
    setTimeout(fetchLoop, 2000);
  }
}

// Load recent history to seed the map path and heatmap
async function loadHistory() {
  try {
    const res = await fetch(API_BASE + "/history?n=100", { credentials: 'same-origin' });
    const rows = await res.json();
    // rows are newest-first; reverse to chronological
    const hist = rows.slice().reverse();
    hist.forEach(r => {
      const latlng = [r.latitude, r.longitude];
      pathHistory.push(latlng);
      if (pathHistory.length > MAX_HISTORY) pathHistory.shift();
      heatPoints.push([r.latitude, r.longitude, 0.6]);
      if (heatPoints.length > 200) heatPoints.shift();
    });
    if (pathHistory.length) {
      polyline.setLatLngs(pathHistory);
      marker.setLatLng(pathHistory[pathHistory.length - 1]);
      pulseCircle.setLatLng(pathHistory[pathHistory.length - 1]);
      heatLayer.setLatLngs(heatPoints);
    }
  } catch (e) {
    addLog("Error loading history: " + e);
  }
}

// Logout handler
try {
  document.getElementById('logoutBtn').onclick = async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.href = '/login';
  };
} catch(e) {
  console.error('Logout button error:', e);
}

// Check receiver status
async function checkReceiverStatus() {
  try {
    const res = await fetch(API_BASE + "/receiver_status", { credentials: 'same-origin' });
    if (res.ok) {
      const data = await res.json();
      lastReceiverSeen = new Date(data.timestamp);
      const now = new Date();
      const timeDiff = now - lastReceiverSeen;
      
      // Update receiver UI
      const isOnline = timeDiff < RECEIVER_TIMEOUT;
      document.getElementById('receiverOnline').innerHTML = isOnline ? '✅ Online' : '❌ Offline';
      document.getElementById('receiverLocation').innerText = `${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}`;
      document.getElementById('receiverLastSeen').innerText = new Date(data.timestamp).toLocaleTimeString();
      document.getElementById('receiverSignal').innerText = data.signal_strength ? `${data.signal_strength} dBm` : '--';
    }
  } catch (e) {
    document.getElementById('receiverOnline').innerHTML = '⚠️ Unknown';
  }
}

}

// Check receiver status every 5 seconds
setInterval(checkReceiverStatus, 5000);
checkReceiverStatus();

// Start by preloading history, then begin polling loop
loadHistory().finally(fetchLoop);
