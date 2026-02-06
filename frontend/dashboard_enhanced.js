// Configuration
const VIT_SJT = [12.9692, 79.1559]; // Default: VIT Vellore, SJT Building [lat, lng]
const API_BASE = '';
const UPDATE_INTERVAL = 2000; // 2 seconds

// State
let map;
let baseStationMarker;
let receiverMarker;
let transmissionLine;
let autoTracking = true;
let currentMode = 'simulated';
let hardwareMode = false;
let baseStationLocation = VIT_SJT; // Dynamic base station location
let rssiChart, batteryChart;
let dataHistory = {
  rssi: [],
  battery: [],
  timestamps: []
};
let locationHistory = [];

// ======================== HAVERSINE DISTANCE CALCULATION ========================
/**
 * Calculate distance between two points using Haversine formula
 * @param {number} lat1 - Latitude of point 1
 * @param {number} lon1 - Longitude of point 1
 * @param {number} lat2 - Latitude of point 2
 * @param {number} lon2 - Longitude of point 2
 * @returns {number} Distance in meters
 */
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

  return R * c; // Distance in meters
}

/**
 * Format distance for display
 * @param {number} meters - Distance in meters
 * @returns {string} Formatted distance string
 */
function formatDistance(meters) {
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  } else {
    return `${(meters / 1000).toFixed(2)} km`;
  }
}

// ======================== THEME MANAGEMENT ========================
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    addLog(`🎨 Theme switched to ${newTheme} mode`);
    showToast(`Switched to ${newTheme} mode`, 'success');
  });
}

// ======================== HARDWARE TOGGLE ========================
function initHardwareToggle() {
  const toggle = document.getElementById('hardwareToggle');
  const savedMode = localStorage.getItem('hardwareMode') === 'true';
  
  hardwareMode = savedMode;
  toggle.checked = savedMode;
  updateToggleLabels(savedMode);
  
  toggle.addEventListener('change', async (e) => {
    hardwareMode = e.target.checked;
    localStorage.setItem('hardwareMode', hardwareMode);
    updateToggleLabels(hardwareMode);
    
    // Send preference to backend
    try {
      const source = hardwareMode ? 'hardware' : 'simulated';
      await fetch(API_BASE + '/api/set_data_source', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: source })
      });
      
      addLog(`📡 Switched to ${hardwareMode ? 'HARDWARE' : 'SIMULATED'} mode`);
      showToast(`Now using ${hardwareMode ? 'Hardware' : 'Simulated'} data`, 'success');
      
      // Clear data history for fresh start
      dataHistory = { rssi: [], battery: [], timestamps: [] };
      locationHistory = [];
      
      // Refresh page for clean state
      setTimeout(() => window.location.reload(), 800);
      
    } catch (error) {
      console.error('Error setting hardware mode:', error);
      addLog('⚠️ Failed to switch mode');
      showToast('Failed to switch mode', 'error');
      // Revert toggle
      toggle.checked = !hardwareMode;
      hardwareMode = !hardwareMode;
    }
  });
}

function updateToggleLabels(isHardware) {
  const labels = document.querySelectorAll('.toggle-label');
  if (isHardware) {
    labels[0].classList.remove('active');
    labels[1].classList.add('active');
  } else {
    labels[0].classList.add('active');
    labels[1].classList.remove('active');
  }
}

// ======================== MAP INITIALIZATION ========================
function initMap() {
  // Create map centered on VIT Vellore
  map = L.map('mapContainer').setView(VIT_SJT, 16);

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  // Create custom icon for base station (fixed)
  const baseStationIcon = L.divIcon({
    html: '<div style="font-size:32px">📡</div>',
    className: 'custom-marker',
    iconSize: [40, 40],
    iconAnchor: [20, 40]
  });

  // Create custom icon for receiver (moving)
  const receiverIcon = L.divIcon({
    html: '<div style="font-size:32px">🎯</div>',
    className: 'custom-marker',
    iconSize: [40, 40],
    iconAnchor: [20, 40]
  });

  // Create base station marker (dynamic location based on mode)
  baseStationMarker = L.marker(baseStationLocation, { icon: baseStationIcon })
    .addTo(map)
    .bindPopup('<strong>📡 Base Station</strong><br>VIT Vellore, SJT Building<br>12.9692°N, 79.1559°E');

  // Create receiver marker (will move based on data - this is the transmitter/GPS tracker)
  receiverMarker = L.marker(baseStationLocation, { icon: receiverIcon })
    .addTo(map)
    .bindPopup('<strong>🎯 Receiver/Transmitter</strong><br>Awaiting GPS data...');

  // Create transmission line polyline
  transmissionLine = L.polyline([baseStationLocation, baseStationLocation], {
    color: '#00e5ff',
    weight: 3,
    opacity: 0.7,
    dashArray: '10, 10'
  }).addTo(map);

  addLog('🗺️ Map initialized with OpenStreetMap');

  // Fix layout sizing issues
  setTimeout(() => { map.invalidateSize(); }, 200);
  window.addEventListener('resize', () => { map.invalidateSize(); });

  // Map control buttons
  document.getElementById('centerMap').addEventListener('click', () => {
    if (locationHistory.length > 0) {
      const lastPos = locationHistory[locationHistory.length - 1];
      // Center between base station and last receiver position
      const bounds = L.latLngBounds([baseStationLocation, lastPos]);
      map.fitBounds(bounds, { padding: [50, 50] });
    } else {
      map.setView(baseStationLocation, 16);
    }
    addLog('📍 Map centered');
  });

  document.getElementById('toggleTracking').addEventListener('click', function() {
    autoTracking = !autoTracking;
    this.style.background = autoTracking ? 'var(--accent)' : 'var(--danger)';
    addLog(`🎯 Auto-tracking ${autoTracking ? 'enabled' : 'disabled'}`);
    showToast(`Auto-tracking ${autoTracking ? 'ON' : 'OFF'}`, autoTracking ? 'success' : 'warning');
  });
}

// ======================== CHARTS INITIALIZATION ========================
function initCharts() {
  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false }
    },
    scales: {
      y: {
        grid: { color: 'rgba(255,255,255,0.1)' },
        ticks: { color: '#a0aec0' }
      },
      x: {
        grid: { display: false },
        ticks: { color: '#a0aec0', display: false }
      }
    },
    animation: {
      duration: 500,
      easing: 'easeInOutQuart'
    }
  };

  // RSSI Chart
  rssiChart = new Chart(document.getElementById('rssiChart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'RSSI (dBm)',
        data: [],
        borderColor: '#00e5ff',
        backgroundColor: 'rgba(0, 229, 255, 0.15)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#00e5ff',
        borderWidth: 2
      }]
    },
    options: {
      ...chartOptions,
      scales: {
        ...chartOptions.scales,
        y: {
          ...chartOptions.scales.y,
          min: -100,
          max: -20
        }
      }
    }
  });

  // Battery Chart
  batteryChart = new Chart(document.getElementById('batteryChart'), {
    type: 'line',
    data: {
      labels: [],
      datasets: [{
        label: 'Battery (V)',
        data: [],
        borderColor: '#00ff88',
        backgroundColor: 'rgba(0, 255, 136, 0.15)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointBackgroundColor: '#00ff88',
        borderWidth: 2
      }]
    },
    options: {
      ...chartOptions,
      scales: {
        ...chartOptions.scales,
        y: {
          ...chartOptions.scales.y,
          min: 3.0,
          max: 4.2
        }
      }
    }
  });
}

// ======================== UPDATE DASHBOARD ========================
function updateDashboard(data) {
  // Determine mode based on data
  const mode = data.mode || 'simulated';
  
  // Update mode banner
  updateModeBanner(mode);
  
  // Update receiver location
  if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
    const receiverLatLng = [data.latitude, data.longitude];
    
    // Update receiver marker
    receiverMarker.setLatLng(receiverLatLng);
    receiverMarker.setPopupContent(
      `<strong>🎯 Receiver</strong><br>
       Lat: ${data.latitude.toFixed(6)}<br>
       Lon: ${data.longitude.toFixed(6)}<br>
       ${data.satellites || 0} satellites`
    );
    
    // Update receiver card
    document.getElementById('receiverLocation').textContent = 
      mode === 'live' ? 'Live Hardware Position' : 'Simulated Position';
    document.getElementById('receiverCoords').textContent = 
      `${data.latitude.toFixed(6)}°N, ${data.longitude.toFixed(6)}°E`;
    
    // Update transmission line between base station and receiver
    transmissionLine.setLatLngs([baseStationLocation, receiverLatLng]);
    
    // Calculate and display distance using dynamic base station location
    const distance = calculateDistance(
      baseStationLocation[0], baseStationLocation[1], 
      data.latitude, data.longitude
    );
    document.getElementById('distanceValue').textContent = formatDistance(distance);
    
    // Update location history
    locationHistory.push(receiverLatLng);
    if (locationHistory.length > 100) locationHistory.shift();
    
    // Auto-tracking
    if (autoTracking) {
      // Center between base station and receiver
      const bounds = L.latLngBounds([baseStationLocation, receiverLatLng]);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }
  
  // Update metrics
  document.getElementById('dataRate').textContent = data.data_rate || 0;
  document.getElementById('latency').textContent = data.latency || 0;
  document.getElementById('packetLoss').textContent = data.packet_loss || 0;
  document.getElementById('signalStrength').textContent = data.rssi || '--';
  
  // Update sensor data (temperature, humidity)
  document.getElementById('temperature').textContent = data.temperature || '--';
  document.getElementById('humidity').textContent = data.humidity || '--';
  
  // Update telemetry
  document.getElementById('satellites').textContent = `${data.satellites || 0} sats`;
  document.getElementById('altitude').textContent = `${(data.altitude || 0).toFixed(1)} m`;
  document.getElementById('speed').textContent = `${(data.speed || 0).toFixed(2)} km/h`;
  document.getElementById('battery').textContent = `${(data.battery || 0).toFixed(2)} V`;
  document.getElementById('latValue').textContent = (data.latitude || 0).toFixed(6);
  document.getElementById('lonValue').textContent = (data.longitude || 0).toFixed(6);
  
  // Update charts
  const now = new Date().toLocaleTimeString();
  dataHistory.timestamps.push(now);
  dataHistory.rssi.push(data.rssi || -75);
  dataHistory.battery.push(data.battery || 3.7);
  
  // Keep last 30 data points
  if (dataHistory.timestamps.length > 30) {
    dataHistory.timestamps.shift();
    dataHistory.rssi.shift();
    dataHistory.battery.shift();
  }
  
  rssiChart.data.labels = dataHistory.timestamps;
  rssiChart.data.datasets[0].data = dataHistory.rssi;
  rssiChart.update('none');
  
  batteryChart.data.labels = dataHistory.timestamps;
  batteryChart.data.datasets[0].data = dataHistory.battery;
  batteryChart.update('none');
  
  // Update connection status
  updateConnectionStatus(mode);
}

function updateModeBanner(mode) {
  if (mode !== currentMode) {
    currentMode = mode;
    const banner = document.getElementById('modeBanner');
    const modeIcon = banner.querySelector('.mode-icon');
    const modeText = document.getElementById('modeText');
    const modeSubtitle = document.getElementById('modeSubtitle');
    
    if (mode === 'live') {
      banner.classList.add('live');
      modeIcon.textContent = '🚀';
      modeText.textContent = 'Live Hardware Mode';
      modeSubtitle.textContent = 'Receiving real-time data from hardware';
      showToast('✅ Hardware connected! Receiving live data', 'success');
      addLog('🚀 Switched to LIVE HARDWARE mode');
    } else {
      banner.classList.remove('live');
      modeIcon.textContent = '🔄';
      modeText.textContent = 'Simulated Mode';
      modeSubtitle.textContent = 'Running offline simulation';
      addLog('🔄 Running in SIMULATION mode');
    }
  }
}

function updateConnectionStatus(mode) {
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  
  if (mode === 'live') {
    statusDot.className = 'status-dot';
    statusText.textContent = 'Hardware Connected';
  } else {
    statusDot.className = 'status-dot simulated';
    statusText.textContent = 'Simulated Data';
  }
}

// ======================== FETCH DATA ========================
async function fetchBaseStationLocation() {
  try {
    const response = await fetch(API_BASE + '/api/base_station_location', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Failed to fetch base station location');
    
    const data = await response.json();
    
    if (data.latitude && data.longitude) {
      baseStationLocation = [data.latitude, data.longitude];
      
      // Update base station marker
      if (baseStationMarker) {
        baseStationMarker.setLatLng(baseStationLocation);
        baseStationMarker.setPopupContent(
          `<strong>📡 Base Station</strong><br>
           ${hardwareMode ? 'Hardware Location' : 'VIT Vellore, SJT'}<br>
           ${data.latitude.toFixed(6)}°N, ${data.longitude.toFixed(6)}°E`
        );
      }
      
      // Update base station card
      document.getElementById('baseCoords').textContent = 
        `${data.latitude.toFixed(6)}°N, ${data.longitude.toFixed(6)}°E`;
      
      if (hardwareMode) {
        addLog(`📡 Base station updated: ${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}`);
      }
    }
  } catch (error) {
    console.error('Error fetching base station location:', error);
    // Keep using default VIT_SJT location
  }
}

async function fetchData() {
  try {
    let data;
    
    // Choose endpoint based on mode
    if (hardwareMode) {
      // In hardware mode, fetch only hardware data
      const response = await fetch(API_BASE + '/data/latest_hardware', { credentials: 'same-origin' });
      
      if (response.status === 204) {
        // No hardware data available, show a message but don't update dashboard
        console.log('No hardware data available yet');
        // Still update base station location to ensure correct position is shown
        await fetchBaseStationLocation();
        return;
      } else if (!response.ok) {
        throw new Error('Network response was not ok for hardware data');
      }
      
      data = await response.json();
      data.mode = 'live'; // Mark as live hardware data
      // Show hardware connection status
      updateConnectionStatus('live');
    } else {
      // In simulated mode, fetch general data
      const response = await fetch(API_BASE + '/data', { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Network response was not ok for simulated data');
      
      data = await response.json();
      data.mode = 'simulated'; // Mark as simulated data
      // Show simulated connection status
      updateConnectionStatus('simulated');
    }
    
    // Update base station location if in hardware mode
    if (hardwareMode) {
      await fetchBaseStationLocation();
    }
    
    updateDashboard(data);
  } catch (error) {
    console.error('Error fetching data:', error);
    addLog('⚠️ Connection error: ' + error.message);
    
    const statusDot = document.querySelector('.status-dot');
    const statusText = document.querySelector('.status-text');
    statusDot.className = 'status-dot offline';
    statusText.textContent = 'Connection Lost';
  }
}

// ======================== LOGGING ========================
function addLog(message) {
  const logs = document.getElementById('logs');
  const timestamp = new Date().toLocaleTimeString();
  const entry = `<div>[${timestamp}] ${message}</div>`;
  logs.innerHTML = entry + logs.innerHTML;
  
  // Keep last 50 log entries
  const entries = logs.children;
  if (entries.length > 50) {
    logs.removeChild(entries[entries.length - 1]);
  }
}

// ======================== TOAST NOTIFICATIONS ========================
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const icon = toast.querySelector('.toast-icon');
  const msg = toast.querySelector('.toast-message');
  
  const icons = {
    success: '✅',
    error: '❌',
    warning: '⚠️',
    info: 'ℹ️'
  };
  
  icon.textContent = icons[type] || icons.info;
  msg.textContent = message;
  
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 4000);
}

// ======================== LOGOUT ========================
document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.href = '/login';
  } catch (error) {
    addLog('⚠️ Logout error');
  }
});

// ======================== INITIALIZATION ========================
async function init() {
  addLog('🚀 Enhanced IoT Dashboard initializing...');
  
  // Initialize components
  initTheme();
  initHardwareToggle();
  initMap();
  initCharts();
  
  // Log initial mode
  const currentSource = hardwareMode ? 'HARDWARE' : 'SIMULATED';
  addLog(`📊 Current mode: ${currentSource}`);
  
  if (hardwareMode) {
    addLog(`📡 Waiting for hardware base station location...`);
    addLog(`💉 All data from real hardware devices`);
    // Fetch initial base station location
    await fetchBaseStationLocation();
  } else {
    addLog(`📡 Base Station: VIT Vellore, SJT Building (Fixed)`);
    addLog(`📍 Coordinates: ${VIT_SJT[0]}°N, ${VIT_SJT[1]}°E`);
    addLog(`🔄 Using simulated data for testing`);
  }
  
  // Start data polling
  setInterval(fetchData, UPDATE_INTERVAL);
  fetchData(); // Initial fetch
  
  addLog('✅ Dashboard ready');
  showToast(`Dashboard initialized in ${currentSource} mode`, 'success');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
