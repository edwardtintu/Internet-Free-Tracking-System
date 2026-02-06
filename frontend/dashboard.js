// Configuration
const VIT_SJT = [12.9692, 79.1559]; // [lat, lng] for Leaflet
const API_BASE = '';
const UPDATE_INTERVAL = 2000; // 2 seconds

// State
let map;
let transmitterMarker;
let receiverMarker;
let pathPolyline;
let autoTracking = true;
let currentMode = 'simulated';
let preferredDataSource = 'simulated'; // User's preferred data source
let firstFixCentered = false;
let rssiChart, batteryChart;
let dataHistory = {
  rssi: [],
  battery: [],
  timestamps: []
};
let locationHistory = [];

// Theme Management
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  
  document.getElementById('themeToggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme');
    const newTheme = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    addLog(`Theme switched to ${newTheme} mode`);
  });
}

// Data Source Toggle Management
function initDataSourceToggle() {
  const savedSource = localStorage.getItem('dataSource') || 'simulated';
  preferredDataSource = savedSource;
  
  // Send saved preference to backend on load
  fetch(API_BASE + '/api/set_data_source', {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source: savedSource })
  }).catch(e => console.error('Error setting initial data source:', e));
  
  // Update button states
  document.querySelectorAll('.source-btn').forEach(btn => {
    if (btn.dataset.source === savedSource) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  // Add click handlers
  document.querySelectorAll('.source-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const source = btn.dataset.source;
      
      // Don't refresh if already on the selected source
      if (source === preferredDataSource) {
        return;
      }
      
      preferredDataSource = source;
      localStorage.setItem('dataSource', source);
      
      // Update UI
      document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      
      // Send preference to backend
      try {
        await fetch(API_BASE + '/api/set_data_source', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source: source })
        });
        
        addLog(`📡 Switching to ${source === 'hardware' ? 'HARDWARE' : 'SIMULATED'} data source...`);
        showToast(`Switching to ${source === 'hardware' ? 'Hardware' : 'Simulated'} mode...`, 'info');
        
        // Refresh the page to reset all data and charts
        setTimeout(() => {
          window.location.reload();
        }, 500);
        
      } catch (error) {
        console.error('Error setting data source:', error);
        addLog('⚠️ Failed to change data source');
        showToast('Failed to switch data source', 'error');
      }
    });
  });
}

// Initialize Leaflet Map with OpenStreetMap
function initMap() {
  // Create map
  map = L.map('mapContainer').setView(VIT_SJT, 15);

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);

  // Create custom icon for transmitter
  const transmitterIcon = L.divIcon({
    html: '<div style="font-size:30px">📡</div>',
    className: 'custom-marker',
    iconSize: [40, 40],
    iconAnchor: [20, 40]
  });

  // Create custom icon for receiver
  const receiverIcon = L.divIcon({
    html: '<div style="font-size:30px">🖥️</div>',
    className: 'custom-marker',
    iconSize: [40, 40],
    iconAnchor: [20, 40]
  });

  // Create transmitter marker
  transmitterMarker = L.marker(VIT_SJT, { icon: transmitterIcon })
    .addTo(map)
    .bindPopup('<strong>Transmitter</strong><br>Awaiting GPS signal...');

  // Create receiver marker
  receiverMarker = L.marker(VIT_SJT, { icon: receiverIcon })
    .addTo(map)
    .bindPopup('<strong>Base Station</strong><br>VIT Vellore, SJT');

  // Create path polyline
  pathPolyline = L.polyline([], {
    color: '#00e5ff',
    weight: 3,
    opacity: 0.7
  }).addTo(map);

  addLog('Map initialized with OpenStreetMap');

  // Fix layout sizing issues when the page loads
  setTimeout(() => { try { map.invalidateSize(); } catch(e){} }, 200);
  window.addEventListener('resize', () => { try { map.invalidateSize(); } catch(e){} });

  // Map control buttons
  document.getElementById('centerMap').addEventListener('click', () => {
    const last = locationHistory[locationHistory.length - 1] || VIT_SJT;
    map.setView(last, 15);
    addLog('Map centered');
  });

  document.getElementById('toggleTracking').addEventListener('click', function() {
    autoTracking = !autoTracking;
    this.style.background = autoTracking ? 'var(--accent)' : 'var(--danger)';
    addLog(`Auto-tracking ${autoTracking ? 'enabled' : 'disabled'}`);
  });
}

// Initialize Charts
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
        ticks: { color: '#a0aec0' }
      }
    },
    animation: {
      duration: 750,
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
        backgroundColor: 'rgba(0, 229, 255, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
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
        backgroundColor: 'rgba(0, 255, 136, 0.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
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

// Update UI with new data
function updateDashboard(data) {
  // Update connection mode based on data.mode AND current preference
  const mode = data.mode || 'simulated';
  const banner = document.getElementById('modeBanner');
  const modeText = document.getElementById('modeText');
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  
  // Update UI based on current mode
  if (mode !== currentMode) {
    currentMode = mode;
    
    if (mode === 'live') {
      banner.classList.add('live');
      modeText.textContent = '🚀 Live Hardware Mode';
      statusDot.className = 'status-dot';
      statusText.textContent = 'Hardware Connected';
      showToast('✅ Hardware connected! Receiving live data', 'success');
      addLog('🚀 Receiving LIVE HARDWARE data');
    } else {
      banner.classList.remove('live');
      modeText.textContent = '🔄 Simulated Data Mode';
      statusDot.className = 'status-dot simulated';
      statusText.textContent = 'Simulated Data';
      addLog('🔄 Receiving simulated data');
    }
  }

  // Update transmitter location
  if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
    const latLng = [data.latitude, data.longitude];

    if (transmitterMarker) {
      transmitterMarker.setLatLng(latLng);
      transmitterMarker.setPopupContent(
        `<strong>Transmitter</strong><br>
         Lat: ${data.latitude.toFixed(6)}<br>
         Lon: ${data.longitude.toFixed(6)}<br>
         ${data.satellites || 0} satellites`
      );
    }

    document.getElementById('txLocation').textContent = 
      `${data.latitude.toFixed(6)}, ${data.longitude.toFixed(6)}`;

    // Update path
    locationHistory.push(latLng);
    if (locationHistory.length > 200) locationHistory.shift();
    if (pathPolyline) pathPolyline.setLatLngs(locationHistory);

    // Center once on first valid fix
    if (!firstFixCentered) {
      map.setView(latLng, 16);
      firstFixCentered = true;
      addLog('Centered map to first transmitter fix');
    }

    // Auto-tracking
    if (autoTracking) {
      map.panTo(latLng);
    }
  } else {
    addLog('Waiting for valid transmitter coordinates...');
  }

  // Update metrics
  document.getElementById('dataRate').textContent = data.data_rate || 0;
  document.getElementById('latency').textContent = data.latency || 0;
  document.getElementById('packetLoss').textContent = data.packet_loss || 0;
  document.getElementById('signalStrength').textContent = data.rssi || '--';

  // Update telemetry
  document.getElementById('satellites').textContent = `${data.satellites || 0} sats`;
  document.getElementById('altitude').textContent = `${(data.altitude || 0).toFixed(1)} m`;
  document.getElementById('speed').textContent = `${(data.speed || 0).toFixed(2)} km/h`;
  document.getElementById('battery').textContent = `${(data.battery || 0).toFixed(2)} V`;

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
  rssiChart.update('none'); // No animation for smooth updates

  batteryChart.data.labels = dataHistory.timestamps;
  batteryChart.data.datasets[0].data = dataHistory.battery;
  batteryChart.update('none');

  // Signal strength color coding
  const signalEl = document.getElementById('signalStrength');
  const rssi = data.rssi || 0;
  if (rssi > -50) signalEl.style.color = '#00ff88';
  else if (rssi > -70) signalEl.style.color = '#ffaa00';
  else signalEl.style.color = '#ff3366';
}

// Fetch data from backend
async function fetchData() {
  try {
    const response = await fetch(API_BASE + '/data', { credentials: 'same-origin' });
    if (!response.ok) throw new Error('Network response was not ok');
    
    const data = await response.json();
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

// Add log entry
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

// Show toast notification
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

// Logout handler
document.getElementById('logoutBtn').addEventListener('click', async () => {
  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
    window.location.href = '/login';
  } catch (error) {
    addLog('⚠️ Logout error');
  }
});

// Initialize everything
async function init() {
  addLog('🚀 Dashboard initializing...');
  
  // Initialize theme first
  initTheme();
  
  // Initialize data source toggle (this will set the backend preference)
  initDataSourceToggle();
  
  // Log current data source mode
  const currentSource = localStorage.getItem('dataSource') || 'simulated';
  addLog(`📊 Current mode: ${currentSource.toUpperCase()}`);
  
  // Clear data history to ensure fresh start
  dataHistory = {
    rssi: [],
    battery: [],
    timestamps: []
  };
  locationHistory = [];
  firstFixCentered = false;
  
  initMap();
  initCharts();
  
  // Start data polling
  setInterval(fetchData, UPDATE_INTERVAL);
  fetchData(); // Initial fetch
  
  addLog(`✅ Dashboard ready - ${currentSource.toUpperCase()} mode`);
  showToast(`Dashboard initialized in ${currentSource === 'hardware' ? 'Hardware' : 'Simulated'} mode`, 'success');
}

// Start when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
