/* ============================================================
   TSCRIC-LoRa Dashboard — app.js FINAL v2.2
   Firebase Realtime Database | Plot Area m² + Bigha | Crop Config
   Login System | Weather Location Picker | BME280 Support
   GitHub Pages deployment ready
============================================================ */

// ============================================================
// DASHBOARD LOGIN — Password Protection
// ============================================================
const DASHBOARD_PASSWORD = "Aman";  // Dashboard password

function doLogin() {
  const passEl = document.getElementById('loginPass');
  const errEl  = document.getElementById('loginError');
  if (!passEl) return;

  const pass = passEl.value.trim();  // trim spaces auto

  if (pass === DASHBOARD_PASSWORD) {
    // Hide login, show dashboard
    var loginScr = document.getElementById('loginScreen');
    var mainHdr  = document.getElementById('mainHeader');
    var mainCnt  = document.getElementById('mainContent');

    if (loginScr) loginScr.style.display = 'none';
    if (mainHdr)  mainHdr.style.display  = 'block';
    if (mainCnt)  mainCnt.style.display  = 'block';
    if (errEl)    errEl.style.display    = 'none';

    sessionStorage.setItem('tscric_auth', '1');
    initFirebase();

  } else {
    if (errEl) errEl.style.display = 'block';
    passEl.value = '';
    passEl.focus();
  }
}

function doLogout() {
  sessionStorage.removeItem('tscric_auth');
  var loginScr = document.getElementById('loginScreen');
  var mainHdr  = document.getElementById('mainHeader');
  var mainCnt  = document.getElementById('mainContent');
  if (loginScr) loginScr.style.display = 'flex';
  if (mainHdr)  mainHdr.style.display  = 'none';
  if (mainCnt)  mainCnt.style.display  = 'none';
  var passEl = document.getElementById('loginPass');
  if (passEl) passEl.value = '';
}

// ============================================================
// FIREBASE CONFIGURATION
// ============================================================
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyDtWF8l4QCBdwmojwClGfd32AVNuf8alAk",
  authDomain: "ai-irrigation-system-1e112.firebaseapp.com",
  databaseURL: "https://ai-irrigation-system-1e112-default-rtdb.firebaseio.com",
  projectId: "ai-irrigation-system-1e112",
  storageBucket: "ai-irrigation-system-1e112.firebasestorage.app",
  messagingSenderId: "1052849462072",
  appId: "1:1052849462072:web:a1062de83ec2f869a8ffcd"
};

// ============================================================
// CONSTANTS
// ============================================================
const BIGHA_TO_M2 = 1333.33;
const MAX_HISTORY = 50;

// Crop database
const CROP_DATA = [
  { name: "Wheat",     delta: 450  },
  { name: "Rice",      delta: 1200 },
  { name: "Maize",     delta: 550  },
  { name: "Cotton",    delta: 750  },
  { name: "Soybean",   delta: 500  },
  { name: "Chickpea",  delta: 350  },
  { name: "Mustard",   delta: 380  },
  { name: "Sugarcane", delta: 1800 }
];

// Weather location database (lat/lon for ETo calculation reference)
const WEATHER_LOCATIONS = {
  // Madhya Pradesh
  bhopal:       { label: "Bhopal",       lat: 23.26, lon: 77.41, alt: 527  },
  indore:       { label: "Indore",       lat: 22.72, lon: 75.86, alt: 553  },
  jabalpur:     { label: "Jabalpur",     lat: 23.18, lon: 79.94, alt: 412  },
  gwalior:      { label: "Gwalior",      lat: 26.22, lon: 78.18, alt: 197  },
  ujjain:       { label: "Ujjain",       lat: 23.18, lon: 75.78, alt: 491  },
  sagar:        { label: "Sagar",        lat: 23.84, lon: 78.74, alt: 523  },
  rewa:         { label: "Rewa",         lat: 24.53, lon: 81.30, alt: 327  },
  satna:        { label: "Satna",        lat: 24.60, lon: 80.83, alt: 318  },
  chhindwara:   { label: "Chhindwara",   lat: 22.06, lon: 78.93, alt: 682  },
  vidisha:      { label: "Vidisha",      lat: 23.52, lon: 77.81, alt: 430  },
  hoshangabad:  { label: "Hoshangabad",  lat: 22.75, lon: 77.72, alt: 310  },
  narsinghpur:  { label: "Narsinghpur",  lat: 22.95, lon: 79.19, alt: 363  },
  // Other cities
  delhi:        { label: "New Delhi",    lat: 28.61, lon: 77.20, alt: 216  },
  mumbai:       { label: "Mumbai",       lat: 19.08, lon: 72.88, alt: 14   },
  pune:         { label: "Pune",         lat: 18.52, lon: 73.86, alt: 560  },
  nagpur:       { label: "Nagpur",       lat: 21.15, lon: 79.09, alt: 310  },
  lucknow:      { label: "Lucknow",      lat: 26.85, lon: 80.95, alt: 111  },
  patna:        { label: "Patna",        lat: 25.60, lon: 85.12, alt: 55   },
  jaipur:       { label: "Jaipur",       lat: 26.91, lon: 75.79, alt: 431  },
  chandigarh:   { label: "Chandigarh",   lat: 30.73, lon: 76.78, alt: 321  },
  hyderabad:    { label: "Hyderabad",    lat: 17.38, lon: 78.47, alt: 536  },
  bangalore:    { label: "Bengaluru",    lat: 12.97, lon: 77.59, alt: 920  },
  ahmedabad:    { label: "Ahmedabad",    lat: 23.03, lon: 72.58, alt: 55   },
  kolkata:      { label: "Kolkata",      lat: 22.57, lon: 88.36, alt: 9    },
  amritsar:     { label: "Amritsar",     lat: 31.63, lon: 74.87, alt: 234  },
  varanasi:     { label: "Varanasi",     lat: 25.32, lon: 83.00, alt: 80   },
  agra:         { label: "Agra",         lat: 27.18, lon: 78.01, alt: 169  }
};

// ============================================================
// STATE
// ============================================================
let firebaseApp  = null;
let firebaseDB   = null;
let irrigHistory = [];
let lastData     = null;
let isConnected  = false;
let selectedWeatherLocation = 'bhopal';

let localConfig = {
  plotArea_m2: 6.0,
  plotArea_bigha: 6.0 / BIGHA_TO_M2,
  crop: 0,
  weatherLocation: 'bhopal'
};

let updatingM2 = false;
let updatingBigha = false;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Check if already logged in this session
  if (sessionStorage.getItem('tscric_auth') === '1') {
    var loginScr = document.getElementById('loginScreen');
    var mainHdr  = document.getElementById('mainHeader');
    var mainCnt  = document.getElementById('mainContent');
    if (loginScr) loginScr.style.display = 'none';
    if (mainHdr)  mainHdr.style.display  = 'block';
    if (mainCnt)  mainCnt.style.display  = 'block';
    loadHistory();
    updatePreviewCard(0, 6.0);
    initFirebase();
  } else {
    // Show login, focus password field
    setTimeout(() => {
      const el = document.getElementById('loginPass');
      if (el) el.focus();
    }, 300);
  }
});

// ============================================================
// WEATHER LOCATION HANDLER
// ============================================================
function onWeatherLocationChange(val) {
  selectedWeatherLocation = val;
  localConfig.weatherLocation = val;
  const loc = WEATHER_LOCATIONS[val];
  if (loc) {
    document.getElementById('weatherLocationInfo').textContent =
      `📍 Lat: ${loc.lat}°N  |  Lon: ${loc.lon}°E  |  Alt: ${loc.alt} m`;
    setText('weatherLocBanner', loc.label);
  }
}

// ============================================================
// FIREBASE INIT
// ============================================================
function initFirebase() {
  loadHistory();
  updatePreviewCard(0, 6.0);
  setInterval(connectionWatchdog, 12000);

  loadScript(
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
    () => {
      loadScript(
        'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js',
        () => {
          try {
            if (!firebaseApp) {
              firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
            }
            firebaseDB  = firebase.database();
            startSensorsListener();
            startConfigListener();
            setConnectionStatus('online');
            console.log("Firebase Connected Successfully");
          } catch (e) {
            console.error(e);
            setConnectionStatus('error');
            showAlert('Firebase init failed: ' + e.message);
          }
        }
      );
    }
  );
}

// ============================================================
// LOAD SCRIPT
// ============================================================
function loadScript(src, callback) {
  const script = document.createElement('script');
  script.src = src;
  script.onload = callback;
  script.onerror = () => {
    setConnectionStatus('error');
    showAlert('Failed to load Firebase SDK');
  };
  document.head.appendChild(script);
}

// ============================================================
// LIVE SENSOR LISTENER
// ============================================================
function startSensorsListener() {
  firebaseDB.ref('tscric/sensors').on('value', snapshot => {
    const data = snapshot.val();
    if (data) {
      lastData = data;
      isConnected = true;
      setConnectionStatus('online');
      updateDashboard(data);
      updateLastUpdateTime();
    }
  }, error => {
    console.error(error);
    isConnected = false;
    setConnectionStatus('error');
  });
}

// ============================================================
// LIVE CONFIG LISTENER
// ============================================================
function startConfigListener() {
  firebaseDB.ref('tscric/config').on('value', snapshot => {
    const cfg = snapshot.val();
    if (!cfg) return;

    // Plot Area
    if (cfg.plotArea !== undefined) {
      const area = parseFloat(cfg.plotArea);
      if (area >= 1 && area <= 100000) {
        localConfig.plotArea_m2 = area;
        localConfig.plotArea_bigha = area / BIGHA_TO_M2;
        silentFill('plotAreaM2', area.toFixed(2));
        silentFill('plotAreaBigha', (area / BIGHA_TO_M2).toFixed(6));
        updatePreviewCard(localConfig.crop, area);
        updateLiveAreaBanner(area);
      }
    }

    // Crop
    if (cfg.crop !== undefined) {
      const c = parseInt(cfg.crop);
      if (c >= 0 && c <= 7) {
        localConfig.crop = c;
        const sel = document.getElementById('cropSelectMain');
        if (sel) sel.value = c;
        updatePreviewCard(c, localConfig.plotArea_m2);
      }
    }

    // Weather Location
    if (cfg.weatherLocation !== undefined) {
      const loc = cfg.weatherLocation;
      if (WEATHER_LOCATIONS[loc]) {
        selectedWeatherLocation = loc;
        localConfig.weatherLocation = loc;
        const sel = document.getElementById('weatherLocation');
        if (sel) sel.value = loc;
        onWeatherLocationChange(loc);
      }
    }
  });
}

// ============================================================
// SAVE CONFIG
// ============================================================
function saveConfig() {
  if (!firebaseDB) {
    showAlert("Firebase not connected");
    return;
  }

  const m2 = localConfig.plotArea_m2;
  const loc = WEATHER_LOCATIONS[localConfig.weatherLocation] || WEATHER_LOCATIONS['bhopal'];

  const payload = {
    plotArea: parseFloat(m2.toFixed(2)),
    plotArea_bigha: parseFloat((m2 / BIGHA_TO_M2).toFixed(6)),
    crop: localConfig.crop,
    cropName: CROP_DATA[localConfig.crop].name,
    weatherLocation: localConfig.weatherLocation,
    weatherLocationLabel: loc.label,
    weatherLat: loc.lat,
    weatherLon: loc.lon,
    weatherAlt: loc.alt,
    updatedAt: Date.now()
  };

  firebaseDB.ref('tscric/config').set(payload)
    .then(() => {
      showSavedBadge();
      updateLiveAreaBanner(m2);
      console.log("Config Saved with location:", loc.label);
    })
    .catch(error => {
      console.error(error);
      showAlert("Save failed: " + error.message);
    });
}

// ============================================================
// SEND COMMANDS
// ============================================================
function sendCmd(cmd) {
  if (!firebaseDB) {
    showAlert("Firebase not connected");
    return;
  }

  const MAP = {
    pump_on:   { pumpOn: true,  pumpOff: false },
    pump_off:  { pumpOn: false, pumpOff: true  },
    auto_on:   { auto: true  },
    manual_on: { auto: false }
  };

  const payload = MAP[cmd];
  firebaseDB.ref('tscric/commands').update(payload)
    .catch(error => {
      showAlert("Command error: " + error.message);
    });
}

// ============================================================
// PREVIEW CARD
// ============================================================
function updatePreviewCard(cropIdx, area_m2) {
  const crop = CROP_DATA[cropIdx] || CROP_DATA[0];
  const need  = crop.delta * area_m2;
  const bigha = area_m2 / BIGHA_TO_M2;
  setText('prevDelta', crop.delta + ' mm');
  setText('prevArea',  area_m2.toFixed(2) + ' m²');
  setText('prevBigha', bigha.toFixed(6) + ' Bigha');
  setText('prevNeed',  need.toFixed(1) + ' L');
}

// ============================================================
// UPDATE DASHBOARD
// ============================================================
function updateDashboard(data) {
  setText('tempVal',  parseFloat(data.temperature || 0).toFixed(1));
  setText('humVal',   parseFloat(data.humidity    || 0).toFixed(0));
  setText('presVal',  parseFloat(data.pressure    || 0).toFixed(1));
  setText('csmiVal',  parseFloat(data.csmi        || 0).toFixed(1));
  setText('aiScore',  parseFloat(data.aiScore     || 0).toFixed(1));
  setText('flowVal',  parseFloat(data.flowRate    || 0).toFixed(2));
  setText('smvVal',   parseFloat(data.smv         || 0).toFixed(4));
  setText('smaVal',   parseFloat(data.sma         || 0).toFixed(4));
  setText('tprVal',   parseFloat(data.tprScore    || 0).toFixed(3));
  setText('etoVal',   parseFloat(data.eto         || 0).toFixed(2));
  setText('rainVal',  parseFloat(data.rainProb    || 0).toFixed(0));
  setText('cropName', data.crop  || '--');
  setText('stageName', data.stage || '--');
  setText('gddVal',   parseFloat(data.gdd || 0).toFixed(0));

  // Soil depth bars
  const sm1 = parseFloat(data.sm1 || 0);
  const sm2 = parseFloat(data.sm2 || 0);
  const sm3 = parseFloat(data.sm3 || 0);
  const csmi = parseFloat(data.csmi || 0);
  setText('sm1Val', sm1.toFixed(1) + '%');
  setText('sm2Val', sm2.toFixed(1) + '%');
  setText('sm3Val', sm3.toFixed(1) + '%');
  setBarHeight('bar1', sm1);
  setBarHeight('bar2', sm2);
  setBarHeight('bar3', sm3);
  setBarHeight('barCSMI', csmi);

  // Water budget
  const applied  = parseFloat(data.deltaApplied  || 0);
  const required = parseFloat(data.deltaRequired || 0);
  const balance  = parseFloat(data.deltaBalance  || 0);
  const totalFlow= parseFloat(data.totalLitres   || 0);
  setText('appliedVal',  applied.toFixed(1)  + ' L');
  setText('requiredVal', required.toFixed(1) + ' L');
  setText('balanceVal',  balance.toFixed(1)  + ' L');
  setText('totalFlowVal',totalFlow.toFixed(1)+ ' L');
  const pct = required > 0 ? Math.min((applied / required) * 100, 100) : 0;
  const prog = document.getElementById('budgetProgress');
  if (prog) prog.style.width = pct.toFixed(1) + '%';
  setText('budgetPct', pct.toFixed(1) + ' % of seasonal budget used');

  // Pump
  const pumpOn = data.pump || false;
  const autoMode = data.autoMode !== undefined ? data.autoMode : true;
  const faultOn = data.pipelineFault || false;
  setText('pumpStatusText', pumpOn ? '💧 PUMP ON' : '⭕ PUMP OFF');
  setText('pumpModeText', autoMode ? '🤖 Auto Mode' : '✋ Manual Mode');
  const ind = document.getElementById('pumpIndicator');
  if (ind) { ind.className = 'pump-indicator' + (pumpOn ? ' on' : ''); }
  const fb = document.getElementById('faultBanner');
  if (fb) fb.style.display = faultOn ? 'block' : 'none';

  // AI Score circle colour
  const score = parseFloat(data.aiScore || 0);
  const circle = document.getElementById('aiCircle');
  if (circle) {
    circle.className = 'ai-circle ' + (score >= 65 ? 'high' : score >= 35 ? 'medium' : 'low');
  }

  if (data.plotArea_m2) {
    updateLiveAreaBanner(parseFloat(data.plotArea_m2));
  }
}

// ============================================================
// BAR HEIGHT HELPER
// ============================================================
function setBarHeight(id, pct) {
  const el = document.getElementById(id);
  if (!el) return;
  const h = Math.max(2, Math.min(100, pct));
  el.style.height = h + '%';
}

// ============================================================
// AREA BANNER
// ============================================================
function updateLiveAreaBanner(area_m2) {
  const el = document.getElementById('liveArea');
  if (!el) return;
  el.innerHTML = area_m2.toFixed(2) + ' m² (' + (area_m2 / BIGHA_TO_M2).toFixed(4) + ' Bigha)';
}

// ============================================================
// HISTORY
// ============================================================
function addHistoryEntry(entry) {
  irrigHistory.unshift(entry);
  if (irrigHistory.length > MAX_HISTORY) irrigHistory.pop();
  try {
    localStorage.setItem('tscric_history', JSON.stringify(irrigHistory));
  } catch(e) {}
  renderHistory();
}

function loadHistory() {
  try {
    const saved = localStorage.getItem('tscric_history');
    if (saved) irrigHistory = JSON.parse(saved);
    renderHistory();
  } catch (e) { console.error(e); }
}

function renderHistory() {
  const tbody = document.getElementById('historyBody');
  if (!tbody) return;
  if (!irrigHistory.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#8b949e">No events yet</td></tr>';
    return;
  }
  tbody.innerHTML = irrigHistory.map(e => `
    <tr>
      <td>${e.time}</td>
      <td>${e.csmi}%</td>
      <td>${e.ai}</td>
      <td>${e.dose} L</td>
      <td>${e.reason}</td>
    </tr>
  `).join('');
}

// ============================================================
// CONNECTION WATCHDOG
// ============================================================
function connectionWatchdog() {
  if (!isConnected) setConnectionStatus('offline');
}

// ============================================================
// STATUS
// ============================================================
function setConnectionStatus(status) {
  const text = document.getElementById('connStatus');
  const dot  = document.getElementById('connDot');
  if (!text) return;
  if (status === 'online') {
    text.innerText = '🟢 Live';
    if (dot) dot.className = 'status-dot online';
  } else if (status === 'offline') {
    text.innerText = '🟡 Offline';
    if (dot) dot.className = 'status-dot offline';
  } else {
    text.innerText = '🔴 Error';
    if (dot) dot.className = 'status-dot error';
  }
}

// ============================================================
// ALERT
// ============================================================
function showAlert(msg) {
  const bar = document.getElementById('alertBar');
  if (!bar) return;
  bar.style.display = 'block';
  bar.innerText = msg;
}

// ============================================================
// SAVED BADGE
// ============================================================
function showSavedBadge() {
  const badge = document.getElementById('configSavedBadge');
  if (!badge) return;
  badge.style.display = 'inline-block';
  setTimeout(() => { badge.style.display = 'none'; }, 3000);
}

// ============================================================
// LAST UPDATE
// ============================================================
function updateLastUpdateTime() {
  setText('lastUpdate', 'Updated ' + new Date().toLocaleTimeString());
}

// ============================================================
// INPUT HANDLERS
// ============================================================
function onCropChange(val) {
  localConfig.crop = parseInt(val);
  updatePreviewCard(localConfig.crop, localConfig.plotArea_m2);
}

function onM2Input(val) {
  if (updatingM2) return;
  const m2 = parseFloat(val);
  if (isNaN(m2)) return;
  localConfig.plotArea_m2    = m2;
  localConfig.plotArea_bigha = m2 / BIGHA_TO_M2;
  updatingBigha = true;
  silentFill('plotAreaBigha', localConfig.plotArea_bigha.toFixed(6));
  updatingBigha = false;
  updatePreviewCard(localConfig.crop, m2);
}

function onBighaInput(val) {
  if (updatingBigha) return;
  const bigha = parseFloat(val);
  if (isNaN(bigha)) return;
  const m2 = bigha * BIGHA_TO_M2;
  localConfig.plotArea_m2    = m2;
  localConfig.plotArea_bigha = bigha;
  updatingM2 = true;
  silentFill('plotAreaM2', m2.toFixed(2));
  updatingM2 = false;
  updatePreviewCard(localConfig.crop, m2);
}

// ============================================================
// HELPERS
// ============================================================
function setText(id, val) {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
}

function silentFill(id, val) {
  const el = document.getElementById(id);
  if (el && document.activeElement !== el) el.value = val;
}
