/* ============================================================
   TSCRIC-LoRa Dashboard — app.js FINAL v2.1
   Firebase Realtime Database | Plot Area m² + Bigha | Crop Config
   GitHub Pages deployment ready
============================================================ */

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

// ============================================================
// STATE
// ============================================================
let firebaseApp  = null;
let firebaseDB   = null;
let irrigHistory = [];
let lastData     = null;
let isConnected  = false;

let localConfig = {
  plotArea_m2: 6.0,
  plotArea_bigha: 6.0 / BIGHA_TO_M2,
  crop: 0
};

let updatingM2 = false;
let updatingBigha = false;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  updatePreviewCard(0, 6.0);
  initFirebase();
  setInterval(connectionWatchdog, 12000);
});

// ============================================================
// FIREBASE INIT
// ============================================================
function initFirebase() {

  loadScript(
    'https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js',
    () => {

      loadScript(
        'https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js',
        () => {

          try {

            firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
            firebaseDB  = firebase.database();

            startSensorsListener();
            startConfigListener();

            setConnectionStatus('online');

            console.log("Firebase Connected Successfully");

          } catch (e) {

            console.error(e);

            setConnectionStatus('error');

            showAlert(
              'Firebase init failed: ' + e.message
            );
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

        localConfig.plotArea_bigha =
          area / BIGHA_TO_M2;

        silentFill(
          'plotAreaM2',
          area.toFixed(2)
        );

        silentFill(
          'plotAreaBigha',
          (area / BIGHA_TO_M2).toFixed(6)
        );

        updatePreviewCard(
          localConfig.crop,
          area
        );

        updateLiveAreaBanner(area);
      }
    }

    // Crop
    if (cfg.crop !== undefined) {

      const c = parseInt(cfg.crop);

      if (c >= 0 && c <= 7) {

        localConfig.crop = c;

        const sel =
          document.getElementById('cropSelectMain');

        if (sel) sel.value = c;

        updatePreviewCard(
          c,
          localConfig.plotArea_m2
        );
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

  const payload = {

    plotArea: parseFloat(m2.toFixed(2)),

    plotArea_bigha: parseFloat(
      (m2 / BIGHA_TO_M2).toFixed(6)
    ),

    crop: localConfig.crop,

    cropName:
      CROP_DATA[localConfig.crop].name,

    updatedAt: Date.now()
  };

  firebaseDB
    .ref('tscric/config')
    .set(payload)

    .then(() => {

      showSavedBadge();

      updateLiveAreaBanner(m2);

      console.log("Config Saved");

    })

    .catch(error => {

      console.error(error);

      showAlert(
        "Save failed: " + error.message
      );
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

    pump_on: {
      pumpOn: true,
      pumpOff: false
    },

    pump_off: {
      pumpOn: false,
      pumpOff: true
    },

    auto_on: {
      auto: true
    },

    manual_on: {
      auto: false
    }
  };

  const payload = MAP[cmd];

  firebaseDB
    .ref('tscric/commands')
    .update(payload)

    .catch(error => {

      showAlert(
        "Command error: " + error.message
      );
    });
}

// ============================================================
// PREVIEW CARD
// ============================================================
function updatePreviewCard(cropIdx, area_m2) {

  const crop =
    CROP_DATA[cropIdx] || CROP_DATA[0];

  const need =
    crop.delta * area_m2;

  const bigha =
    area_m2 / BIGHA_TO_M2;

  setText(
    'prevDelta',
    crop.delta + ' mm'
  );

  setText(
    'prevArea',
    area_m2.toFixed(2) + ' m²'
  );

  setText(
    'prevBigha',
    bigha.toFixed(6) + ' Bigha'
  );

  setText(
    'prevNeed',
    need.toFixed(1) + ' L'
  );
}

// ============================================================
// UPDATE DASHBOARD
// ============================================================
function updateDashboard(data) {

  setText(
    'tempVal',
    parseFloat(data.temperature || 0).toFixed(1)
  );

  setText(
    'humVal',
    parseFloat(data.humidity || 0).toFixed(0)
  );

  setText(
    'csmiVal',
    parseFloat(data.csmi || 0).toFixed(1)
  );

  setText(
    'aiScore',
    parseFloat(data.aiScore || 0).toFixed(1)
  );

  setText(
    'flowVal',
    parseFloat(data.flowRate || 0).toFixed(2)
  );

  setText(
    'cropName',
    data.crop || '--'
  );

  setText(
    'stageName',
    data.stage || '--'
  );

  setText(
    'gddVal',
    parseFloat(data.gdd || 0).toFixed(0)
  );

  if (data.plotArea_m2) {

    updateLiveAreaBanner(
      parseFloat(data.plotArea_m2)
    );
  }
}

// ============================================================
// AREA BANNER
// ============================================================
function updateLiveAreaBanner(area_m2) {

  const el =
    document.getElementById('liveArea');

  if (!el) return;

  el.innerHTML =
    area_m2.toFixed(2) +
    ' m² (' +
    (area_m2 / BIGHA_TO_M2).toFixed(4) +
    ' Bigha)';
}

// ============================================================
// HISTORY
// ============================================================
function addHistoryEntry(entry) {

  irrigHistory.unshift(entry);

  if (irrigHistory.length > MAX_HISTORY) {
    irrigHistory.pop();
  }

  localStorage.setItem(
    'tscric_history',
    JSON.stringify(irrigHistory)
  );

  renderHistory();
}

function loadHistory() {

  try {

    const saved =
      localStorage.getItem('tscric_history');

    if (saved) {

      irrigHistory = JSON.parse(saved);
    }

    renderHistory();

  } catch (e) {

    console.error(e);
  }
}

function renderHistory() {

  const tbody =
    document.getElementById('historyBody');

  if (!tbody) return;

  if (!irrigHistory.length) {

    tbody.innerHTML =
      '<tr><td colspan="5">No history yet</td></tr>';

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

  if (!isConnected) {

    setConnectionStatus('offline');
  }
}

// ============================================================
// STATUS
// ============================================================
function setConnectionStatus(status) {

  const text =
    document.getElementById('connStatus');

  if (!text) return;

  if (status === 'online') {

    text.innerText = '🟢 Live';

  } else if (status === 'offline') {

    text.innerText = '🟡 Offline';

  } else {

    text.innerText = '🔴 Error';
  }
}

// ============================================================
// ALERT
// ============================================================
function showAlert(msg) {

  const bar =
    document.getElementById('alertBar');

  if (!bar) return;

  bar.style.display = 'block';

  bar.innerText = msg;
}

// ============================================================
// SAVED BADGE
// ============================================================
function showSavedBadge() {

  const badge =
    document.getElementById('configSavedBadge');

  if (!badge) return;

  badge.style.display = 'inline-block';

  setTimeout(() => {

    badge.style.display = 'none';

  }, 3000);
}

// ============================================================
// LAST UPDATE
// ============================================================
function updateLastUpdateTime() {

  setText(
    'lastUpdate',
    'Updated ' + new Date().toLocaleTimeString()
  );
}

// ============================================================
// INPUT HANDLERS
// ============================================================
function onCropChange(val) {

  localConfig.crop = parseInt(val);

  updatePreviewCard(
    localConfig.crop,
    localConfig.plotArea_m2
  );
}

function onM2Input(val) {

  if (updatingM2) return;

  const m2 = parseFloat(val);

  if (isNaN(m2)) return;

  localConfig.plotArea_m2 = m2;

  localConfig.plotArea_bigha =
    m2 / BIGHA_TO_M2;

  updatingBigha = true;

  silentFill(
    'plotAreaBigha',
    localConfig.plotArea_bigha.toFixed(6)
  );

  updatingBigha = false;

  updatePreviewCard(
    localConfig.crop,
    m2
  );
}

function onBighaInput(val) {

  if (updatingBigha) return;

  const bigha = parseFloat(val);

  if (isNaN(bigha)) return;

  const m2 = bigha * BIGHA_TO_M2;

  localConfig.plotArea_m2 = m2;

  localConfig.plotArea_bigha = bigha;

  updatingM2 = true;

  silentFill(
    'plotAreaM2',
    m2.toFixed(2)
  );

  updatingM2 = false;

  updatePreviewCard(
    localConfig.crop,
    m2
  );
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

  if (
    el &&
    document.activeElement !== el
  ) {
    el.value = val;
  }
}
