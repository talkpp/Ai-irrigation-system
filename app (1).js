/* ============================================================
   TSCRIC-LoRa Dashboard — app.js FINAL v2.1
   Firebase Realtime Database | Plot Area m² + Bigha | Crop Config
   GitHub Pages deployment ready
   ============================================================ */

// ============================================================
// FIREBASE CONFIGURATION — Replace with your project values
// ============================================================
const FIREBASE_CONFIG = {
  apiKey:            "YOUR_FIREBASE_API_KEY",
  authDomain:        "tscric-lora.firebaseapp.com",
  databaseURL:       "https://tscric-lora-default-rtdb.firebaseio.com",
  projectId:         "tscric-lora",
  storageBucket:     "tscric-lora.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};

// ============================================================
// CONSTANTS
// ============================================================
const BIGHA_TO_M2 = 1333.33;      // 1 Bigha (Madhya Pradesh) = 1333.33 m²
const MAX_HISTORY = 50;

// Seasonal delta (mm) for each crop — matches firmware cropDB[]
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

// Local config — keeps UI in sync with Firebase
let localConfig = {
  plotArea_m2:    6.0,
  plotArea_bigha: 6.0 / BIGHA_TO_M2,
  crop: 0
};

// Flag: prevent input loop when silently setting sibling field
let updatingM2    = false;
let updatingBigha = false;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  loadHistory();
  updatePreviewCard(0, 6.0);  // default preview on load
  initFirebase();
  setInterval(connectionWatchdog, 12000);
});

// ============================================================
// FIREBASE INIT
// ============================================================
function initFirebase() {
  loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js', () => {
    loadScript('https://www.gstatic.com/firebasejs/9.23.0/firebase-database-compat.js', () => {
      try {
        firebaseApp = firebase.initializeApp(FIREBASE_CONFIG);
        firebaseDB  = firebase.database();
        startSensorsListener();
        startConfigListener();
        setConnectionStatus('online');
      } catch (e) {
        setConnectionStatus('error');
        showAlert('Firebase init failed — check FIREBASE_CONFIG in app.js. ' + e.message);
      }
    });
  });
}

function loadScript(src, cb) {
  const s = document.createElement('script');
  s.src = src;
  s.onload = cb;
  s.onerror = () => { setConnectionStatus('error'); showAlert('Failed to load Firebase SDK.'); };
  document.head.appendChild(s);
}

// ============================================================
// SENSORS LIVE LISTENER — tscric/sensors/
// ============================================================
function startSensorsListener() {
  firebaseDB.ref('tscric/sensors').on('value', snap => {
    const d = snap.val();
    if (d) {
      lastData    = d;
      isConnected = true;
      setConnectionStatus('online');
      updateDashboard(d);
      updateLastUpdateTime();
    }
  }, err => {
    isConnected = false;
    setConnectionStatus('error');
    console.error('[Firebase] Sensors error:', err);
  });
}

// ============================================================
// CONFIG LIVE LISTENER — tscric/config/
// Mirrors any config change from any device/browser in real-time
// ============================================================
function startConfigListener() {
  firebaseDB.ref('tscric/config').on('value', snap => {
    const cfg = snap.val();
    if (!cfg) return;

    // --- Plot Area ---
    if (cfg.plotArea !== undefined) {
      const area = parseFloat(cfg.plotArea);
      if (area >= 1 && area <= 100000) {
        localConfig.plotArea_m2    = area;
        localConfig.plotArea_bigha = area / BIGHA_TO_M2;
        silentFill('plotAreaM2',    area.toFixed(2));
        silentFill('plotAreaBigha', (area / BIGHA_TO_M2).toFixed(6));
        updatePreviewCard(localConfig.crop, area);
        updateLiveAreaBanner(area);
      }
    }

    // --- Crop ---
    if (cfg.crop !== undefined) {
      const c = parseInt(cfg.crop);
      if (c >= 0 && c <= 7) {
        localConfig.crop = c;
        const sel = getEl('cropSelectMain');
        if (sel && parseInt(sel.value) !== c) sel.value = c;
        updatePreviewCard(c, localConfig.plotArea_m2);
        updateCropStageInfo();
      }
    }
  });
}

// ============================================================
// CONFIG UI — Crop change
// ============================================================
function onCropChange(val) {
  localConfig.crop = parseInt(val);
  updatePreviewCard(localConfig.crop, localConfig.plotArea_m2);
  updateCropStageInfo();
}

// ============================================================
// CONFIG UI — m² input → auto-fill Bigha
// ============================================================
function onM2Input(val) {
  if (updatingM2) return;
  const m2 = parseFloat(val);
  const el  = getEl('plotAreaM2');

  if (isNaN(m2) || m2 < 1 || m2 > 100000) {
    if (el) el.classList.add('invalid');
    return;
  }
  if (el) { el.classList.remove('invalid'); el.classList.add('valid'); }

  localConfig.plotArea_m2    = m2;
  localConfig.plotArea_bigha = m2 / BIGHA_TO_M2;

  updatingBigha = true;
  silentFill('plotAreaBigha', localConfig.plotArea_bigha.toFixed(6));
  updatingBigha = false;

  updatePreviewCard(localConfig.crop, m2);
}

// ============================================================
// CONFIG UI — Bigha input → auto-fill m²
// ============================================================
function onBighaInput(val) {
  if (updatingBigha) return;
  const bigha = parseFloat(val);
  const el    = getEl('plotAreaBigha');

  if (isNaN(bigha) || bigha < 0.001 || bigha > 75) {
    if (el) el.classList.add('invalid');
    return;
  }
  if (el) { el.classList.remove('invalid'); el.classList.add('valid'); }

  const m2 = bigha * BIGHA_TO_M2;
  localConfig.plotArea_m2    = m2;
  localConfig.plotArea_bigha = bigha;

  updatingM2 = true;
  silentFill('plotAreaM2', m2.toFixed(2));
  updatingM2 = false;

  updatePreviewCard(localConfig.crop, m2);
}

// ============================================================
// PREVIEW CARD — live computed water budget
// ============================================================
function updatePreviewCard(cropIdx, area_m2) {
  const crop  = CROP_DATA[cropIdx] || CROP_DATA[0];
  const need  = crop.delta * area_m2;
  const bigha = area_m2 / BIGHA_TO_M2;
  setText('prevDelta',  crop.delta + ' mm');
  setText('prevArea',   area_m2.toFixed(2) + ' m²');
  setText('prevBigha',  bigha.toFixed(6) + ' Bigha');
  setText('prevNeed',   need.toFixed(1) + ' L');
}

// ============================================================
// LIVE AREA BANNER
// ============================================================
function updateLiveAreaBanner(area_m2) {
  const el = getEl('liveArea');
  if (el) el.innerHTML =
    `${area_m2.toFixed(2)} m² <span style="color:#8b949e;font-size:.75em">(${(area_m2/BIGHA_TO_M2).toFixed(4)} Bigha)</span>`;
}

function updateCropStageInfo() {
  if (!lastData) return;
  const el = getEl('cropStageInfo');
  if (el) el.textContent =
    `Stage: ${lastData.stage || '--'}  |  GDD: ${lastData.gdd ? parseFloat(lastData.gdd).toFixed(0) : '--'}`;
}

// ============================================================
// SAVE CONFIG → Firebase  tscric/config/
// ESP8266 polls this path every 15 s and updates EEPROM
// ============================================================
function saveConfig() {
  if (!firebaseDB) {
    showAlert('Firebase not connected. Cannot save config.');
    return;
  }

  const m2 = localConfig.plotArea_m2;
  if (!m2 || m2 < 1 || m2 > 100000) {
    showAlert('Invalid plot area! Enter a value between 1 and 100,000 m².');
    return;
  }

  const payload = {
    plotArea:        parseFloat(m2.toFixed(2)),
    plotArea_bigha:  parseFloat((m2 / BIGHA_TO_M2).toFixed(6)),
    crop:            localConfig.crop,
    cropName:        CROP_DATA[localConfig.crop].name,
    updatedAt:       Date.now()
  };

  firebaseDB.ref('tscric/config').set(payload)
    .then(() => {
      showSavedBadge();
      updateLiveAreaBanner(m2);
      console.log('[Config] Saved:', payload);
    })
    .catch(e => showAlert('Save failed: ' + e.message));
}

function showSavedBadge() {
  const b = getEl('configSavedBadge');
  if (!b) return;
  b.style.display = 'inline-block';
  setTimeout(() => { b.style.display = 'none'; }, 3500);
}

// ============================================================
// DASHBOARD UPDATE — sensor data
// ============================================================
function updateDashboard(d) {
  // Soil moisture bars
  const sm1  = f(d.sm1);
  const sm2  = f(d.sm2);
  const sm3  = f(d.sm3);
  const csmi = f(d.csmi);

  setBar('bar1',    sm1);
  setBar('bar2',    sm2);
  setBar('bar3',    sm3);
  setBar('barCSMI', csmi);
  setText('sm1Val',  sm1.toFixed(1)  + '%');
  setText('sm2Val',  sm2.toFixed(1)  + '%');
  setText('sm3Val',  sm3.toFixed(1)  + '%');
  setText('csmiVal', csmi.toFixed(1) + '%');

  // AI Score
  const ai = f(d.aiScore);
  setText('aiScore', ai.toFixed(1));
  const aiCircle = getEl('aiCircle');
  if (aiCircle) aiCircle.className =
    'ai-circle ' + (ai >= 65 ? 'high' : ai >= 40 ? 'medium' : 'low');
  const aiEl = getEl('aiScore');
  if (aiEl) aiEl.style.color =
    ai >= 65 ? '#f85149' : ai >= 40 ? '#f0a500' : '#56d364';

  // AI metrics
  const smv = f(d.smv);
  setText('smvVal', smv.toFixed(4));
  setText('smaVal', f(d.sma).toFixed(6));
  setText('tprVal', f(d.tprScore).toFixed(3));
  setText('etoVal', f(d.eto).toFixed(2));
  setText('rainVal',f(d.rainProb).toFixed(0));
  const smvEl = getEl('smvVal');
  if (smvEl) smvEl.style.color = smv < -1.5 ? '#f85149' : smv < 0 ? '#f0a500' : '#56d364';

  // Environmental
  const temp = f(d.temperature);
  setText('tempVal', temp.toFixed(1));
  setText('humVal',  f(d.humidity).toFixed(0));
  setText('presVal', f(d.pressure).toFixed(1));
  setText('flowVal', f(d.flowRate).toFixed(3));
  const tEl = getEl('tempVal');
  if (tEl) tEl.style.color = temp > 37 ? '#f85149' : '#56d364';

  // Water budget
  const applied  = f(d.deltaApplied);
  const balance  = f(d.deltaBalance);
  const required = applied + balance;
  const totalL   = f(d.totalLitres);
  const pct      = required > 0 ? Math.min((applied / required) * 100, 100) : 0;
  setText('appliedVal',   applied.toFixed(1)  + ' L');
  setText('requiredVal',  required.toFixed(1) + ' L');
  setText('balanceVal',   balance.toFixed(1)  + ' L');
  setText('totalFlowVal', totalL.toFixed(2)   + ' L');
  setText('budgetPct',    pct.toFixed(1)      + '% of seasonal budget used');
  setWidth('budgetProgress', pct);

  // Crop banner
  setText('cropName',  d.crop  || '--');
  setText('stageName', d.stage || '--');
  setText('gddVal',    f(d.gdd).toFixed(0));
  setText('connMode',  d.wifiMode || '--');
  updateCropStageInfo();

  // Live area from device data (reflects what ESP8266 has)
  if (d.plotArea_m2) updateLiveAreaBanner(f(d.plotArea_m2));

  // Sync config fields if they are empty (first load)
  const m2Input = getEl('plotAreaM2');
  if (m2Input && !m2Input.value && d.plotArea_m2) {
    silentFill('plotAreaM2',    f(d.plotArea_m2).toFixed(2));
    silentFill('plotAreaBigha', f(d.plotArea_bigha).toFixed(6));
    localConfig.plotArea_m2    = f(d.plotArea_m2);
    localConfig.plotArea_bigha = f(d.plotArea_bigha);
    updatePreviewCard(localConfig.crop, localConfig.plotArea_m2);
  }
  if (d.cropIdx !== undefined) {
    const sel = getEl('cropSelectMain');
    if (sel && !sel._userChanged) {
      sel.value = d.cropIdx;
      localConfig.crop = d.cropIdx;
      updatePreviewCard(localConfig.crop, localConfig.plotArea_m2);
    }
  }

  // Pump
  const pumping  = Boolean(d.pump);
  const autoMode = Boolean(d.autoMode);
  const pumpInd  = getEl('pumpIndicator');
  if (pumpInd) pumpInd.className = 'pump-indicator' + (pumping ? ' on' : '');
  setText('pumpStatusText', pumping  ? '💧 PUMPING' : '⏸ IDLE');
  setText('pumpModeText',   autoMode ? '🤖 AUTO MODE' : '✋ MANUAL MODE');

  // Fault
  const fb = getEl('faultBanner');
  if (fb) fb.style.display = d.pipelineFault ? 'block' : 'none';

  // Alerts
  const alerts = [];
  if (d.pipelineFault)  alerts.push('⚠️ Pipeline fault detected!');
  if (csmi < 25)        alerts.push('🔴 Critical soil moisture — immediate irrigation needed');
  if (d.rainProb > 80)  alerts.push('🌧️ High rain probability — irrigation suppressed');
  if (ai >= 65 && !pumping) alerts.push('🤖 AI Score ≥ 65 — Irrigation trigger conditions met');
  const alertBar = getEl('alertBar');
  if (alertBar) {
    alertBar.style.display = alerts.length ? 'block' : 'none';
    if (alerts.length) alertBar.textContent = alerts.join('  |  ');
  }

  // Log irrigation events
  if (pumping && lastData && !lastData._prevPump) {
    addHistoryEntry({
      time:   new Date().toLocaleTimeString(),
      csmi:   csmi.toFixed(1),
      ai:     ai.toFixed(1),
      dose:   totalL.toFixed(2),
      reason: f(d.tprScore) >= 0.85 ? 'TPR+AI' : autoMode ? 'AI-Auto' : 'Manual'
    });
  }
  if (lastData) lastData._prevPump = pumping;
}

// ============================================================
// COMMANDS → Firebase  tscric/commands/
// ============================================================
function sendCmd(cmd) {
  if (!firebaseDB) { showAlert('Firebase not connected.'); return; }
  const MAP = {
    pump_on:   { pumpOn: true,  pumpOff: false },
    pump_off:  { pumpOn: false, pumpOff: true  },
    auto_on:   { auto: true  },
    manual_on: { auto: false }
  };
  const payload = MAP[cmd];
  if (!payload) return;
  firebaseDB.ref('tscric/commands').update(payload)
    .catch(e => showAlert('Command error: ' + e.message));
}

// ============================================================
// IRRIGATION HISTORY
// ============================================================
function addHistoryEntry(entry) {
  irrigHistory.unshift(entry);
  if (irrigHistory.length > MAX_HISTORY) irrigHistory.pop();
  try { localStorage.setItem('tscric_history', JSON.stringify(irrigHistory)); } catch(e) {}
  renderHistory();
}

function loadHistory() {
  try {
    const saved = localStorage.getItem('tscric_history');
    if (saved) irrigHistory = JSON.parse(saved);
    renderHistory();
  } catch(e) {}
}

function renderHistory() {
  const tbody = getEl('historyBody');
  if (!tbody) return;
  if (!irrigHistory.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#8b949e">No events recorded yet</td></tr>';
    return;
  }
  tbody.innerHTML = irrigHistory.map(e => {
    const cls = e.reason.includes('Manual') ? 'manual' : e.reason.includes('TPR') ? 'tpr' : 'auto';
    return `<tr>
      <td>${e.time}</td>
      <td>${e.csmi}%</td>
      <td>${e.ai}</td>
      <td>${e.dose} L</td>
      <td><span class="badge badge-${cls}">${e.reason}</span></td>
    </tr>`;
  }).join('');
}

// ============================================================
// UTILITIES
// ============================================================
function f(v)  { return parseFloat(v || 0); }
function getEl(id) { return document.getElementById(id); }

function setText(id, val) {
  const el = getEl(id);
  if (el) el.textContent = val;
}

function setBar(id, pct) {
  const el = getEl(id);
  if (el) el.style.height = Math.max(2, Math.min(100, pct)) + '%';
}

function setWidth(id, pct) {
  const el = getEl(id);
  if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%';
}

// Fill input without triggering oninput (avoids conversion loop)
function silentFill(id, val) {
  const el = getEl(id);
  if (el && document.activeElement !== el) el.value = val;
}

function setConnectionStatus(status) {
  const dot  = getEl('connDot');
  const text = getEl('connStatus');
  if (dot)  dot.className   = 'status-dot ' + status;
  if (text) text.textContent =
    status === 'online'  ? '🟢 Live'        :
    status === 'error'   ? '🔴 Error'       :
    status === 'offline' ? '🟡 Reconnecting' : '🟡 Connecting';
}

function showAlert(msg) {
  const bar = getEl('alertBar');
  if (bar) { bar.style.display = 'block'; bar.textContent = '⚠️ ' + msg; }
}

function updateLastUpdateTime() {
  setText('lastUpdate', 'Updated ' + new Date().toLocaleTimeString());
}

function connectionWatchdog() {
  if (!isConnected) setConnectionStatus('offline');
}
