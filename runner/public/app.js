// Nightscout Audio Runner & Sports Carb Coach
// Dynamic Dual-Language Edition: English (EN) and Português (PT-PT)

// Detect if running inside native Android APK (Capacitor/localhost/AndroidVoice bridge)
function isRunningNative() {
  return (typeof window.AndroidVoice !== 'undefined') ||
         (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) ||
         window.location.origin.includes('localhost') ||
         window.location.protocol === 'capacitor:' ||
         window.location.protocol === 'file:';
}

const isNativeApp = isRunningNative();
const API_BASE = 'https://runner.gatoescondido.com';
const NativeVoice = (window.Capacitor && window.Capacitor.registerPlugin) ? window.Capacitor.registerPlugin('VoiceAudio') : null;

const CONFIG_KEY = 'ns_runner_config_v4';

const defaultConfig = {
  nsUrl: 'https://diabetes.gatoescondido.com',
  intervalMinutes: 2,
  language: 'pt-PT', // Authentic European Portuguese by default
  targetMin: 130,
  targetMax: 170,
  urgentLow: 75,
  workoutProfile: 'zone2',
  wakeLockEnabled: true,
  enableEarbudShortcuts: false,
  maxHr: 185,
  voiceOptions: {
    sgv: true,
    trend: true,
    delta: true,
    coach: true,
    duration: false,
    heartRate: true
  }
};

// Workout Session Analytics Tracking
let sessionStartTime = null;
let sessionReadings = [];
let sessionHeartRates = [];
let sessionCarbsTotal = 0;
let sessionCarbsEntries = [];
let lastCarbIntake = null;
try {
  const savedCarb = localStorage.getItem('ns_last_carb_intake');
  if (savedCarb) {
    const parsed = JSON.parse(savedCarb);
    if (parsed && parsed.timestamp && (Date.now() - parsed.timestamp) < 20 * 60 * 1000) {
      lastCarbIntake = parsed;
    }
  }
} catch (e) {}

// Heart Rate State
let currentHeartRate = 0;
let heartRateDeviceName = '';
let isHeartRateConnected = false;

let config = { ...defaultConfig };

// State
let isRunning = false;
let currentSessionMode = localStorage.getItem("runner_session_mode") || "running";
let lastEmergencySpokenTs = 0;
let lastPumpBolusTs = 0;
let timerId = null;
let countdownTimerId = null;
let secondsRemaining = 120;
let lastEntry = null;
let prevEntry = null;
let wakeLock = null;
let workoutStartTime = null;
let workoutIntervalId = null;
let announcementCount = 0;
let currentAudioPlayer = null;

// Background State
let lastAnnouncementTimestamp = Date.now();
let lastHeartbeatProcessTime = 0;

// Native Android Foreground Service integration (Capacitor & Android JavascriptInterface)
function triggerNativeForegroundStart() {
  const tellHr = (config.voiceOptions && config.voiceOptions.heartRate !== false);
  const maxHr = config.maxHr || 185;
  const payload = {
    intervalMinutes: config.intervalMinutes || 2,
    language: config.language || 'pt-PT',
    apiBase: API_BASE,
    targetMin: config.targetMin || 110,
    targetMax: config.targetMax || 170,
    tellHeartRate: tellHr,
    maxHr: maxHr
  };
  if (window.AndroidVoice && typeof window.AndroidVoice.startWorkoutService === 'function') {
    try {
      const lastG = (lastCarbIntake && (Date.now() - lastCarbIntake.timestamp < 15 * 60 * 1000)) ? (lastCarbIntake.grams || 20) : 0;
      const lastT = (lastCarbIntake && (Date.now() - lastCarbIntake.timestamp < 15 * 60 * 1000)) ? lastCarbIntake.timestamp : 0;
      window.AndroidVoice.startWorkoutService(
        payload.intervalMinutes,
        payload.language,
        payload.apiBase,
        payload.targetMin,
        payload.targetMax,
        payload.tellHeartRate,
        payload.maxHr,
        lastG,
        lastT,
        currentSessionMode
      );
    } catch (e) {
      console.warn('AndroidVoice.startWorkoutService error:', e);
    }
  } else if (NativeVoice && typeof NativeVoice.startWorkout === 'function') {
    NativeVoice.startWorkout(payload).catch(e => console.warn('NativeVoice.startWorkout error:', e));
  }
}

function triggerNativeForegroundStop() {
  if (window.AndroidVoice && typeof window.AndroidVoice.stopWorkoutService === 'function') {
    try { window.AndroidVoice.stopWorkoutService(); } catch (e) { console.warn('AndroidVoice.stopWorkoutService error:', e); }
  }
  if (window.AndroidVoice && typeof window.AndroidVoice.stopVoice === 'function') {
    try { window.AndroidVoice.stopVoice(); } catch (e) {}
  }
  if (NativeVoice && typeof NativeVoice.stopWorkout === 'function') {
    NativeVoice.stopWorkout().catch(e => console.warn('NativeVoice.stopWorkout error:', e));
  }
}

// Native event listeners (when phone is unlocked or action pressed in notification)
window._onNativeWorkoutReading = function(data) {
  console.log('Received native reading:', data);
  if (data && data.announcementCount) {
    announcementCount = data.announcementCount;
    const countEl = document.getElementById('announcementCount');
    if (countEl) countEl.textContent = announcementCount;
  }
  lastAnnouncementTimestamp = Date.now();
  secondsRemaining = (config.intervalMinutes || 2) * 60;
  updateCountdownDisplay();
  performPollAndAnnouncement(false, true); // true = skipSpeech since native service already spoke
};

window._onNativeWorkoutStopped = function() {
  console.log('Received native workout stopped');
  stopWorkout(true);
};

const discoveredDevicesMap = new Map();

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window._onNativeHeartRate = function(bpm, deviceName) {
  handleHeartRateUpdate(bpm, deviceName);
};

window._onNativeHeartRateStatus = function(connected, deviceName, bpm) {
  isHeartRateConnected = !!connected;
  if (connected && deviceName) heartRateDeviceName = deviceName;
  if (bpm) currentHeartRate = bpm;
  updateHeartRateUI();
  updateHeartRateModalUI(connected, deviceName, bpm);

  if (!connected && deviceName && (deviceName.includes('Ativa') || deviceName.includes('relógio') || deviceName.includes('obter'))) {
    showToast('⚠️ ' + deviceName);
    const qSub = document.getElementById('quickBarHrSub');
    if (qSub) qSub.textContent = '⚠️ ' + deviceName;
  }
};


let sessionDistanceMeters = 0;
let sessionCurrentPaceSec = 0;
let sessionAvgPaceSec = 0;
let currentIntervalsWorkout = null;
let intervalsAthleteProfile = null;

window._onNativeGpsUpdate = function(distanceMeters, currentPaceSec, avgPaceSec) {
  sessionDistanceMeters = distanceMeters || 0;
  sessionCurrentPaceSec = currentPaceSec || 0;
  sessionAvgPaceSec = avgPaceSec || 0;

  const paceEl = document.getElementById('quickBarGpsPace');
  const distEl = document.getElementById('quickBarGpsDist');

  if (paceEl) {
    if (currentPaceSec > 0 && currentPaceSec < 900) {
      const pm = Math.floor(currentPaceSec / 60);
      const ps = currentPaceSec % 60;
      paceEl.textContent = `${pm}:${ps < 10 ? '0' : ''}${ps}/km`;
    } else {
      paceEl.textContent = '--/km';
    }
  }

  if (distEl) {
    const km = (distanceMeters / 1000.0).toFixed(2);
    distEl.textContent = `${km} km`;
  }
};

window._onNativeDeviceDiscovered = function(name, address, rssi, isHr) {
  if (!address) return;
  discoveredDevicesMap.set(address, {
    name: name || 'Dispositivo Bluetooth',
    address: address,
    rssi: rssi || -70,
    isHr: !!isHr,
    timestamp: Date.now()
  });
  renderDiscoveredDevices();
};

function renderDiscoveredDevices() {
  const container = document.getElementById('hrDeviceList');
  if (!container) return;

  if (discoveredDevicesMap.size === 0) {
    container.innerHTML = `
      <div id="hrEmptyState" class="p-4 rounded-xl bg-slate-950/50 border border-dashed border-slate-800 text-center text-xs text-slate-500">
        A procurar HUAWEI WATCH e outros sensores BLE...
      </div>
    `;
    return;
  }

  const list = Array.from(discoveredDevicesMap.values()).sort((a, b) => {
    if (a.isHr && !b.isHr) return -1;
    if (!a.isHr && b.isHr) return 1;
    const isWatchA = a.name.toUpperCase().includes('WATCH') || a.name.toUpperCase().includes('GT') || a.name.toUpperCase().includes('HUAWEI');
    const isWatchB = b.name.toUpperCase().includes('WATCH') || b.name.toUpperCase().includes('GT') || b.name.toUpperCase().includes('HUAWEI');
    if (isWatchA && !isWatchB) return -1;
    if (!isWatchA && isWatchB) return 1;
    return a.name.localeCompare(b.name);
  });

  let html = '';
  for (const dev of list) {
    const isWatch = dev.name.toUpperCase().includes('WATCH') || dev.name.toUpperCase().includes('GT') || dev.name.toUpperCase().includes('HUAWEI');
    const icon = dev.isHr ? '❤️' : (isWatch ? '⌚' : '📡');
    const isConnectedThis = isHeartRateConnected && (dev.name === heartRateDeviceName || dev.address === heartRateDeviceName);

    html += `
      <div class="p-2.5 rounded-xl bg-slate-950/70 border ${isConnectedThis ? 'border-emerald-500/50 bg-emerald-950/20' : 'border-slate-800 hover:border-slate-700'} flex items-center justify-between gap-2 transition">
        <div class="flex items-center gap-2.5 min-w-0">
          <span class="text-lg shrink-0">${icon}</span>
          <div class="min-w-0">
            <div class="flex items-center gap-1.5 flex-wrap">
              <span class="text-xs font-bold text-white truncate max-w-[150px]">${escapeHtml(dev.name)}</span>
              ${dev.isHr ? '<span class="text-[9px] px-1.5 py-0.2 rounded-full font-extrabold bg-rose-950 text-rose-300 border border-rose-600/50">Sensor FC</span>' : ''}
              ${isWatch && !dev.isHr ? '<span class="text-[9px] px-1.5 py-0.2 rounded-full font-bold bg-sky-950 text-sky-300 border border-sky-600/40">Watch</span>' : ''}
            </div>
            <p class="text-[10px] text-slate-500 font-mono truncate">${escapeHtml(dev.address)}</p>
          </div>
        </div>
        <button type="button" class="btn-connect-hr-device shrink-0 px-3 py-1.5 rounded-xl ${isConnectedThis ? 'bg-emerald-600 text-white font-black' : 'bg-rose-600 hover:bg-rose-500 text-white font-bold'} text-xs active:scale-95 transition cursor-pointer" data-address="${dev.address}" data-name="${escapeHtml(dev.name)}">
          ${isConnectedThis ? 'Ligado ✓' : 'Ligar'}
        </button>
      </div>
    `;
  }
  container.innerHTML = html;

  container.querySelectorAll('.btn-connect-hr-device').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const addr = btn.getAttribute('data-address');
      const name = btn.getAttribute('data-name');
      connectSpecificHeartRateDevice(addr, name);
    });
  });
}

function updateHeartRateModalUI(connected, deviceName, bpm) {
  const box = document.getElementById('hrConnectedBox');
  const nameEl = document.getElementById('hrConnectedName');
  const bpmEl = document.getElementById('hrConnectedBpm');
  const zoneEl = document.getElementById('hrConnectedZone');
  const statusEl = document.getElementById('hrModalStatus');
  const pulseEl = document.getElementById('hrScanPulse');

  if (connected) {
    if (box) box.classList.remove('hidden');
    if (nameEl) nameEl.textContent = deviceName || 'Sensor Cardíaco';
    if (bpmEl) bpmEl.textContent = bpm > 0 ? bpm : '--';
    if (statusEl) statusEl.textContent = `Ligado a ${deviceName || 'Sensor'}!`;
    if (pulseEl) {
      pulseEl.className = 'inline-block w-2 h-2 rounded-full bg-emerald-400';
    }
    if (zoneEl) {
      if (bpm > 0) {
        const zone = getHeartRateZone(bpm, config.maxHr || 185);
        if (zone) {
          zoneEl.textContent = zone.label;
          zoneEl.className = `text-[10px] px-1.5 py-0.5 rounded font-extrabold uppercase border ${zone.badgeClass} ml-1`;
          zoneEl.classList.remove('hidden');
        }
      } else {
        zoneEl.classList.add('hidden');
      }
    }
  } else {
    if (box) box.classList.add('hidden');
    if (statusEl && statusEl.textContent.includes('Ligado')) {
      statusEl.textContent = 'Desconectado';
    }
    if (pulseEl) {
      pulseEl.className = 'inline-block w-2 h-2 rounded-full bg-sky-400 animate-ping';
    }
  }
}

function openHeartRateModal() {
  const modal = document.getElementById('heartRateModal');
  if (!modal) return;
  modal.classList.remove('hidden');
  updateHeartRateModalUI(isHeartRateConnected, heartRateDeviceName, currentHeartRate);
  renderDiscoveredDevices();
  startHeartRateScanFromUI();
}

function closeHeartRateModal() {
  const modal = document.getElementById('heartRateModal');
  if (modal) modal.classList.add('hidden');
}

function startHeartRateScanFromUI() {
  const statusEl = document.getElementById('hrModalStatus');
  const pulseEl = document.getElementById('hrScanPulse');
  if (pulseEl) pulseEl.className = 'inline-block w-2 h-2 rounded-full bg-sky-400 animate-ping';
  if (statusEl) statusEl.textContent = 'A pesquisar sensores Bluetooth...';

  if (window.AndroidVoice && typeof window.AndroidVoice.startHeartRateScan === 'function') {
    window.AndroidVoice.startHeartRateScan();
  } else if (window.AndroidVoice && typeof window.AndroidVoice.connectHeartRate === 'function') {
    window.AndroidVoice.connectHeartRate('');
  }
}

function connectSpecificHeartRateDevice(address, name) {
  const statusEl = document.getElementById('hrModalStatus');
  if (statusEl) statusEl.textContent = `A ligar a ${name}...`;
  showToast(`❤️ A ligar a ${name}...`);

  if (window.AndroidVoice && typeof window.AndroidVoice.connectHeartRateAddress === 'function') {
    window.AndroidVoice.connectHeartRateAddress(address);
  } else if (window.AndroidVoice && typeof window.AndroidVoice.connectHeartRate === 'function') {
    window.AndroidVoice.connectHeartRate(name);
  }
}

function disconnectHeartRateDevice() {
  if (window.AndroidVoice && typeof window.AndroidVoice.disconnectHeartRate === 'function') {
    window.AndroidVoice.disconnectHeartRate();
  }
  if (webBluetoothDevice && webBluetoothDevice.gatt) {
    try { webBluetoothDevice.gatt.disconnect(); } catch (ignored) {}
  }
  isHeartRateConnected = false;
  currentHeartRate = 0;
  updateHeartRateUI();
  updateHeartRateModalUI(false, '', 0);
  showToast('Sensor cardíaco desligado');
}

function handleHeartRateUpdate(bpm, deviceName) {
  if (!bpm || bpm <= 30 || bpm > 250) return;
  currentHeartRate = bpm;
  isHeartRateConnected = true;
  if (deviceName) heartRateDeviceName = deviceName;
  if (isRunning) {
    sessionHeartRates.push(bpm);
  }
  updateHeartRateUI();
  updateHeartRateModalUI(true, deviceName, bpm);
}

function getHeartRateZone(bpm, maxHr = 185) {
  if (!bpm || bpm <= 0) return null;
  const pct = bpm / maxHr;
  if (pct < 0.60) {
    return { zone: 1, label: 'Z1', namePt: 'Recuperação', nameEn: 'Recovery', spokenPt: 'zona um', spokenEn: 'zone one', color: 'text-sky-400', badgeClass: 'bg-sky-950 text-sky-300 border-sky-800/50' };
  } else if (pct < 0.70) {
    return { zone: 2, label: 'Z2', namePt: 'Aeróbica (Fat Burn)', nameEn: 'Aerobic (Fat Burn)', spokenPt: 'zona dois', spokenEn: 'zone two', color: 'text-emerald-400', badgeClass: 'bg-emerald-950 text-emerald-300 border-emerald-800/50' };
  } else if (pct < 0.80) {
    return { zone: 3, label: 'Z3', namePt: 'Ritmo / Tempo', nameEn: 'Tempo / Aerobic', spokenPt: 'zona três', spokenEn: 'zone three', color: 'text-amber-400', badgeClass: 'bg-amber-950 text-amber-300 border-amber-800/50' };
  } else if (pct < 0.90) {
    return { zone: 4, label: 'Z4', namePt: 'Limiar Anaeróbico', nameEn: 'Threshold', spokenPt: 'zona quatro', spokenEn: 'zone four', color: 'text-orange-400', badgeClass: 'bg-orange-950 text-orange-300 border-orange-800/50' };
  } else {
    return { zone: 5, label: 'Z5', namePt: 'Esforço Máximo', nameEn: 'Maximum Effort', spokenPt: 'zona cinco', spokenEn: 'zone five', color: 'text-rose-500', badgeClass: 'bg-rose-950 text-rose-300 border-rose-800/50' };
  }
}

function updateHeartRateUI() {
  const badge = document.getElementById('hrStatusBadge');
  const label = document.getElementById('labelHr');
  const hrBox = document.getElementById('glucoseCardHrBox');
  const hrVal = document.getElementById('glucoseCardHrValue');
  const hrZone = document.getElementById('glucoseCardHrZone');
  const qVal = document.getElementById('quickBarHrValue');
  const qZone = document.getElementById('quickBarHrZone');
  const qSub = document.getElementById('quickBarHrSub');
  const qBtn = document.getElementById('btnQuickConnectHr');
  const maxHr = config.maxHr || 185;

  if (isHeartRateConnected && currentHeartRate > 0) {
    const zone = getHeartRateZone(currentHeartRate, maxHr);
    if (badge) {
      badge.className = 'flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full transition-all cursor-pointer select-none bg-rose-950/80 text-rose-300 border border-rose-600/70 shadow-sm';
    }
    if (label) {
      label.textContent = `${currentHeartRate} bpm (${zone.label})`;
    }
    if (hrBox) hrBox.classList.remove('hidden');
    if (hrVal) hrVal.textContent = `${currentHeartRate} bpm`;
    if (hrZone && zone) {
      hrZone.textContent = zone.label;
      hrZone.className = `text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase border ${zone.badgeClass}`;
    }
    if (qVal) qVal.textContent = `${currentHeartRate} bpm`;
    if (qZone && zone) {
      qZone.textContent = zone.label;
      qZone.className = `text-[9px] px-1.5 py-0.2 rounded font-extrabold uppercase border ${zone.badgeClass}`;
      qZone.classList.remove('hidden');
    }
    if (qSub) qSub.textContent = `${heartRateDeviceName || 'HUAWEI WATCH'} · Ligado em tempo real ✓`;
    if (qBtn) {
      qBtn.textContent = 'Ligado ✓';
      qBtn.className = 'px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-extrabold text-[10px] transition shrink-0';
    }
  } else if (isHeartRateConnected) {
    if (label) label.textContent = 'Ligado (aguardar)';
    if (hrBox) hrBox.classList.add('hidden');
    if (qVal) qVal.textContent = 'A aguardar...';
    if (qSub) qSub.textContent = `${heartRateDeviceName || 'HUAWEI WATCH'} · A receber dados...`;
    if (qBtn) {
      qBtn.textContent = 'Ligado';
      qBtn.className = 'px-2.5 py-1 rounded-lg bg-emerald-700 text-white font-bold text-[10px] transition shrink-0';
    }
  } else {
    if (badge) {
      badge.className = 'flex items-center gap-1 text-[11px] text-rose-300 font-semibold bg-rose-950/40 border border-rose-800/60 px-2 py-0.5 rounded-full transition-all cursor-pointer active:scale-95 select-none';
    }
    if (label) label.textContent = 'Ligar Watch';
    if (hrBox) hrBox.classList.add('hidden');
    if (qVal) qVal.textContent = '-- bpm';
    if (qZone) qZone.classList.add('hidden');
    if (qSub) qSub.textContent = 'HUAWEI WATCH GT 6 Pro · Toca para ligar';
    if (qBtn) {
      qBtn.textContent = 'Ligar Watch';
      qBtn.className = 'px-2.5 py-1 rounded-lg bg-rose-600/80 hover:bg-rose-600 text-white font-bold text-[10px] transition shrink-0';
    }
  }
}

let webBluetoothDevice = null;
let webBluetoothServer = null;

async function triggerHeartRateConnect() {
  const isPt = (config.language || 'pt-PT') === 'pt-PT';

  // 1. Android Native BLE bridge -> Open visual pairing assistant modal
  if (window.AndroidVoice) {
    openHeartRateModal();
    return;
  }

  // 2. Web Bluetooth API (for browser in Chrome / Chromium)
  if (navigator.bluetooth && typeof navigator.bluetooth.requestDevice === 'function') {
    try {
      showToast(isPt ? 'A abrir emparelhamento Bluetooth...' : 'Opening Bluetooth pairing...');
      const device = await navigator.bluetooth.requestDevice({
        filters: [{ services: ['heart_rate'] }],
        optionalServices: ['heart_rate']
      });
      webBluetoothDevice = device;
      heartRateDeviceName = device.name || 'Sensor Cardíaco';
      showToast(isPt ? `A ligar a ${heartRateDeviceName}...` : `Connecting to ${heartRateDeviceName}...`);

      const server = await device.gatt.connect();
      webBluetoothServer = server;
      const service = await server.getPrimaryService('heart_rate');
      const characteristic = await service.getCharacteristic('heart_rate_measurement');
      await characteristic.startNotifications();
      characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const val = event.target.value;
        const flags = val.getUint8(0);
        const rate16 = flags & 0x1;
        const bpm = rate16 ? val.getUint16(1, true) : val.getUint8(1);
        handleHeartRateUpdate(bpm, heartRateDeviceName);
      });
      device.addEventListener('gattserverdisconnected', () => {
        isHeartRateConnected = false;
        currentHeartRate = 0;
        updateHeartRateUI();
        updateHeartRateModalUI(false, '', 0);
        showToast(isPt ? 'Sensor cardíaco desligado' : 'Heart rate monitor disconnected');
      });
      isHeartRateConnected = true;
      updateHeartRateUI();
      updateHeartRateModalUI(true, heartRateDeviceName, currentHeartRate);
      showToast(isPt ? `❤️ Ligado a ${heartRateDeviceName}!` : `❤️ Connected to ${heartRateDeviceName}!`);
    } catch (e) {
      console.warn('Web Bluetooth error:', e);
      if (e.name !== 'NotFoundError') {
        showToast(isPt ? 'Erro ao ligar ao sensor Bluetooth' : 'Error connecting to Bluetooth sensor');
      }
    }
    return;
  }

  showToast(isPt ? 'Bluetooth não suportado neste navegador' : 'Bluetooth not supported in this browser');
}

function onHeartbeatTick() {
  const now = Date.now();
  if (now - lastHeartbeatProcessTime < 400) return;
  lastHeartbeatProcessTime = now;

  if (!isRunning) return;

  // 1. Duration display
  updateWorkoutDuration();
  updateCarbButtonUI();

  // 2. Periodic Bluetooth output state sync (every ~8 seconds)
  if (now % 8000 < 500) {
    checkInitialAudioOutput();
  }
  // Check Tandem pump bolus every 30 seconds
  if (now % 30000 < 1000) {
    checkLatestPumpBolus();
  }

  // 2. Real wall-clock countdown and announcement trigger
  const targetIntervalMs = (config.intervalMinutes || 2) * 60 * 1000;
  const timeSinceLast = now - lastAnnouncementTimestamp;
  const remainingMs = Math.max(0, targetIntervalMs - timeSinceLast);
  secondsRemaining = Math.ceil(remainingMs / 1000);
  updateCountdownDisplay();

  if (timeSinceLast >= targetIntervalMs) {
    console.log('[Timer] interval reached (' + timeSinceLast + 'ms). Polling & announcing.');
    lastAnnouncementTimestamp = now;
    if (!isNativeApp) {
      performPollAndAnnouncement(false);
    }
  }
}

function loadConfig() {
  try {
    const saved = localStorage.getItem(CONFIG_KEY);
    if (saved) {
      config = { ...defaultConfig, ...JSON.parse(saved) };
    }
  } catch (e) {
    console.error('Failed to load config', e);
  }
}

function saveConfig() {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  } catch (e) {
    console.error('Failed to save config', e);
  }
}

// Translations and Direction mappings
const I18N = {
  'en': {
    flag: '🇬🇧',
    code: 'EN',
    directions: {
      NONE: { symbol: '—', label: 'Unknown', spoken: 'steady' },
      DoubleUp: { symbol: '⇈', label: 'Rising sharply', spoken: 'rising sharply' },
      SingleUp: { symbol: '↑', label: 'Rising fast', spoken: 'rising fast' },
      FortyFiveUp: { symbol: '↗', label: 'Rising slightly', spoken: 'rising slightly' },
      Flat: { symbol: '→', label: 'Steady', spoken: 'steady' },
      FortyFiveDown: { symbol: '↘', label: 'Slowly falling', spoken: 'slowly falling' },
      SingleDown: { symbol: '↓', label: 'Falling fast', spoken: 'falling fast' },
      DoubleDown: { symbol: '⇊', label: 'Dropping sharply', spoken: 'dropping sharply' },
      NOT_COMPUTABLE: { symbol: '?', label: 'Not computable', spoken: 'steady' },
      RATE_OUT_OF_RANGE: { symbol: '↕', label: 'Rapid rate', spoken: 'with rapid rate' }
    },
    ui: {
      workoutStopped: 'Workout Stopped',
      workoutRunning: 'Workout Active',
      loading: 'loading...',
      bluetooth: 'Bluetooth Audio',
      glucoseTitle: 'CURRENT GLUCOSE',
      var5m: '5M DELTA:',
      coachTitle: 'Carb Coach',
      evaluating: 'Evaluating',
      dose: 'DOSE:',
      nextVoice: 'Next Audio',
      duration: 'Duration',
      announcements: 'Announcements',
      startBtn: 'Start Workout (Voice every 2 min)',
      stopBtn: 'Stop Workout',
      speakNow: 'Speak Now',
      testAudio: 'Test Audio',
      speaking: 'Speaking',
      footerTip: '💡 Earbuds: Click button to hear glucose on demand',
      settingsTitle: 'Workout Settings',
      labelLangSetting: 'Voice & App Language',
      labelNsUrl: 'Nightscout Server URL',
      labelInterval: 'Voice Announcement Interval',
      btnSaveSettings: 'Save Settings'
    }
  },
  'pt-PT': {
    flag: '🇵🇹',
    code: 'PT',
    directions: {
      NONE: { symbol: '—', label: 'Indeterminado', spoken: 'estável' },
      DoubleUp: { symbol: '⇈', label: 'A subir a pique', spoken: 'a subir vertiginosamente' },
      SingleUp: { symbol: '↑', label: 'A subir rápido', spoken: 'a subir com velocidade' },
      FortyFiveUp: { symbol: '↗', label: 'A subir ligeiramente', spoken: 'a subir ligeiramente' },
      Flat: { symbol: '→', label: 'Estável', spoken: 'estável' },
      FortyFiveDown: { symbol: '↘', label: 'A descer suavemente', spoken: 'a descer suavemente' },
      SingleDown: { symbol: '↓', label: 'A descer rápido', spoken: 'a descer com velocidade' },
      DoubleDown: { symbol: '⇊', label: 'A cair a pique', spoken: 'a cair vertiginosamente' },
      NOT_COMPUTABLE: { symbol: '?', label: 'Sem cálculo', spoken: 'estável' },
      RATE_OUT_OF_RANGE: { symbol: '↕', label: 'Variação rápida', spoken: 'com variação rápida' }
    },
    ui: {
      workoutStopped: 'Treino Parado',
      workoutRunning: 'Treino a Correr',
      loading: 'a carregar...',
      bluetooth: 'Phones Bluetooth',
      glucoseTitle: 'GLICÉMIA ATUAL',
      var5m: 'VARIAÇÃO 5M:',
      coachTitle: 'Carb Coach',
      evaluating: 'A Avaliar',
      dose: 'DOSE:',
      nextVoice: 'Próxima Voz',
      duration: 'Duração',
      announcements: 'Avisos',
      startBtn: 'Iniciar Treino (Voz a cada 2 min)',
      stopBtn: 'Parar Treino',
      speakNow: 'Falar Agora',
      testAudio: 'Testar Áudio',
      speaking: 'A Falar',
      footerTip: '💡 Auriculares: Botão ouve glicémia instantânea',
      settingsTitle: 'Definições da Corrida',
      labelLangSetting: 'Língua da Voz e da App',
      labelNsUrl: 'Endereço Nightscout',
      labelInterval: 'Intervalo de Anúncio por Voz',
      btnSaveSettings: 'Guardar Definições'
    }
  }
};

// Sports Carb Coach Decision Engine

// ========================================================
// Voice Commands, Carb Logging & Workout Analytics (v1.6)
// ========================================================

function updateCarbButtonUI() {
  const btn = document.getElementById('btnQuickGel');
  const label = document.getElementById('labelQuickGel');
  if (!btn || !label) return;

  const now = Date.now();
  if (lastCarbIntake && (now - lastCarbIntake.timestamp < 15 * 60 * 1000)) {
    const minsAgo = Math.max(0, Math.floor((now - lastCarbIntake.timestamp) / 60000));
    const minsLeft = Math.max(1, 15 - minsAgo);
    label.textContent = `✅ Gel Tomado (${minsLeft}m)`;
    btn.className = 'flex-1 py-1.5 sm:py-2 px-3 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/50 text-sky-300 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer';
  } else {
    const isPt = (config.language || 'pt-PT') === 'pt-PT';
    label.textContent = isPt ? 'Tomei Gel (20g)' : 'Took Gel (20g)';
    btn.className = 'flex-1 py-1.5 sm:py-2 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/40 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition active:scale-95 cursor-pointer';
  }
}

function recordCarbsIntake(grams, source = 'manual') {
  const g = parseInt(grams, 10) || 20;
  sessionCarbsTotal += g;
  const now = Date.now();
  const entry = { timestamp: now, grams: g, source };
  sessionCarbsEntries.push(entry);
  lastCarbIntake = entry;

  try {
    localStorage.setItem('ns_last_carb_intake', JSON.stringify(lastCarbIntake));
  } catch (e) {}

  const lang = config.language || 'pt-PT';
  const isPt = lang === 'pt-PT';

  // 1. Notify Native Android Background Service immediately
  if (window.AndroidVoice && typeof window.AndroidVoice.notifyCarbIntake === 'function') {
    try {
      window.AndroidVoice.notifyCarbIntake(g, now);
    } catch (e) {
      console.warn('Failed AndroidVoice.notifyCarbIntake', e);
    }
  } else if (NativeVoice && typeof NativeVoice.notifyCarbIntake === 'function') {
    NativeVoice.notifyCarbIntake({ grams: g, timestamp: now }).catch(e => console.warn(e));
  }

  // 2. Play confirmation audio only if not running native (native plays via AudioEngine)
  if (!isRunningNative() && typeof playStudioVoice === 'function') {
    const msg = isPt
      ? `Gel registado! ${g} gramas em absorção. Alerta silenciado durante quinze minutos.`
      : `Carbs logged! ${g} grams absorbing. Alerts paused for fifteen minutes.`;
    playStudioVoice(msg);
  }

  // 3. Visual toast
  const toast = document.createElement('div');
  toast.className = 'fixed top-16 left-1/2 -translate-x-1/2 max-w-[90vw] bg-sky-950/95 text-sky-200 border border-sky-500/60 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-2xl z-50 transition-opacity duration-300 backdrop-blur text-center flex items-center gap-2';
  toast.innerHTML = `<span>⏳</span><span>${isPt ? `Gel registado: ${g}g em absorção! Alerta pausado 15m.` : `Logged: ${g}g absorbing! Alert paused 15m.`}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 4000);

  // 4. Update button UI immediately
  updateCarbButtonUI();

  // 5. Immediately re-evaluate advice and update UI so the alert vanishes!
  if (lastEntry) {
    const delta = prevEntry ? lastEntry.sgv - prevEntry.sgv : null;
    const advice = evaluateCarbAdvice(lastEntry.sgv, lastEntry.direction, delta);
    updateUIWithReading(lastEntry, prevEntry, delta, advice);
  }
}

let speechRecognizerInstance = null;
let isVoiceListening = false;

function setVoiceListeningBanner(show, title, sub) {
  const banner = document.getElementById('voiceListeningBanner');
  if (!banner) return;
  if (show) {
    banner.classList.remove('hidden');
    if (title) document.getElementById('voiceBannerTitle').textContent = title;
    if (sub) document.getElementById('voiceBannerSub').textContent = sub;
  } else {
    banner.classList.add('hidden');
  }
}

function startVoiceListening() {
  const lang = config.language || 'pt-PT';
  const isPt = lang === 'pt-PT';

  // 1. Android Native Voice Recognition
  if (window.AndroidVoice && typeof window.AndroidVoice.startVoiceRecognition === 'function') {
    try {
      window.AndroidVoice.startVoiceRecognition(lang);
      setVoiceListeningBanner(true, isPt ? 'A ouvir comando de voz...' : 'Listening for voice command...', isPt ? 'Diz "Tomei gel", "15 gramas" ou "Como estou"' : 'Say "Took gel", "15 grams" or "How am I"');
      return;
    } catch (e) {
      console.warn('Native voice recognition error:', e);
    }
  }

  // 2. Web Speech API (Chrome / WebView fallback)
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (SpeechRecognition) {
    try {
      if (speechRecognizerInstance) {
        speechRecognizerInstance.abort();
      }
      speechRecognizerInstance = new SpeechRecognition();
      speechRecognizerInstance.lang = lang;
      speechRecognizerInstance.continuous = false;
      speechRecognizerInstance.interimResults = false;

      speechRecognizerInstance.onstart = () => {
        isVoiceListening = true;
        setVoiceListeningBanner(true, isPt ? 'A ouvir comando de voz...' : 'Listening for voice command...', isPt ? 'Diz "Tomei gel", "15 gramas" ou "Como estou"' : 'Say "Took gel", "15 grams" or "How am I"');
      };

      speechRecognizerInstance.onresult = (event) => {
        if (event.results && event.results.length > 0) {
          const text = event.results[0][0].transcript;
          handleVoiceCommandResult(text);
        }
      };

      speechRecognizerInstance.onerror = (e) => {
        console.warn('SpeechRecognition error:', e);
        setVoiceListeningBanner(false);
      };

      speechRecognizerInstance.onend = () => {
        isVoiceListening = false;
        setTimeout(() => setVoiceListeningBanner(false), 2000);
      };

      speechRecognizerInstance.start();
      return;
    } catch (e) {
      console.warn('Web Speech API error:', e);
    }
  }

  openCustomCarbModal();
}

function stopVoiceListening() {
  if (window.AndroidVoice && typeof window.AndroidVoice.stopVoiceRecognition === 'function') {
    window.AndroidVoice.stopVoiceRecognition();
  }
  if (speechRecognizerInstance) {
    try { speechRecognizerInstance.stop(); } catch (e) {}
  }
  setVoiceListeningBanner(false);
}

function handleVoiceCommandResult(text) {
  if (!text) return;
  console.log('[VoiceCommand] Recognized text:', text);
  const lang = config.language || 'pt-PT';
  const isPt = lang === 'pt-PT';

  setVoiceListeningBanner(true, `🎤 "${text}"`, isPt ? 'Comando processado!' : 'Command processed!');
  setTimeout(() => setVoiceListeningBanner(false), 2500);

  const clean = text.toLowerCase();

  // Carb intake matches
  if (/tomei|toma|comi|gel|hidrato|carbo|hc|grama|\bg\b/.test(clean)) {
    const numMatch = clean.match(/\b(\d+)\b/);
    const grams = numMatch ? parseInt(numMatch[1], 10) : 20;
    recordCarbsIntake(grams, 'voice');
    return;
  }

  // Speak Now matches
  if (/falar|glicemia|como estou|leitura|valor|diz|ouvir|speak/.test(clean)) {
    announceCurrent(true);
    return;
  }

  // Stop Workout matches
  if (/parar treino|terminar treino|fim do treino|stop workout/.test(clean)) {
    stopWorkout();
    return;
  }

  recordCarbsIntake(20, 'voice');
}

window._onSpeechResult = handleVoiceCommandResult;
window._onSpeechState = (state) => {
  const isPt = (config.language || 'pt-PT') === 'pt-PT';
  if (state === 'listening') {
    setVoiceListeningBanner(true, isPt ? 'A ouvir comando de voz...' : 'Listening...', isPt ? 'Diz "Tomei gel", "15g", ou "Como estou"' : 'Say "Took gel", "15g", or "How am I"');
  } else if (state === 'processing') {
    setVoiceListeningBanner(true, isPt ? 'A processar...' : 'Processing...', '');
  } else if (state === 'error' || state === 'idle') {
    setTimeout(() => setVoiceListeningBanner(false), 1500);
  }
};

window._onHeadsetButton = () => {
  console.log('[Headset] Earbud media button pressed! Triggering Speak Now.');
  announceCurrent(true);
};

function openCustomCarbModal() {
  document.getElementById('customCarbModal')?.classList.remove('hidden');
}
function closeCustomCarbModal() {
  document.getElementById('customCarbModal')?.classList.add('hidden');
}

// Workout Profiles
function setWorkoutProfile(profileKey) {
  config.workoutProfile = profileKey;
  if (profileKey === 'zone2') {
    config.targetMin = 130;
    config.targetMax = 170;
  } else if (profileKey === 'hiit') {
    config.targetMin = 110;
    config.targetMax = 150;
  } else if (profileKey === 'walk') {
    config.targetMin = 90;
    config.targetMax = 140;
  }
  saveConfig();
  updateProfileButtonsUI();

  const minInput = document.getElementById('cfgTargetMin');
  const maxInput = document.getElementById('cfgTargetMax');
  if (minInput) minInput.value = config.targetMin;
  if (maxInput) maxInput.value = config.targetMax;

  if (lastEntry) {
    const delta = prevEntry ? lastEntry.sgv - prevEntry.sgv : null;
    const advice = evaluateCarbAdvice(lastEntry.sgv, lastEntry.direction, delta);
    updateUIWithReading(lastEntry, prevEntry, delta, advice);
  }
}

function updateProfileButtonsUI() {
  const p = config.workoutProfile || 'zone2';
  const setBtn = (id, active) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (active) {
      el.className = 'profile-btn flex-1 py-1 px-1.5 rounded-lg font-bold text-[10px] sm:text-[11px] text-center transition flex items-center justify-center gap-1 bg-sky-500 text-white shadow-sm cursor-pointer';
    } else {
      el.className = 'profile-btn flex-1 py-1 px-1.5 rounded-lg font-medium text-[10px] sm:text-[11px] text-slate-400 hover:text-white text-center transition flex items-center justify-center gap-1 cursor-pointer';
    }
  };
  setBtn('profZone2', p === 'zone2');
  setBtn('profHIIT', p === 'hiit');
  setBtn('profWalk', p === 'walk');
}

// Workout Summary Modal
function showWorkoutSummaryModal() {
  const modal = document.getElementById('workoutSummaryModal');
  if (!modal) return;

  const durationSec = sessionStartTime ? Math.floor((Date.now() - sessionStartTime) / 1000) : 0;
  const mins = Math.floor(durationSec / 60);
  const secs = durationSec % 60;
  const durStr = `${mins}:${secs < 10 ? '0' : ''}${secs}`;

  const durEl = document.getElementById('sumDuration');
  if (durEl) durEl.textContent = durStr;

  const carbsEl = document.getElementById('sumCarbs');
  if (carbsEl) carbsEl.textContent = `${sessionCarbsTotal} gramas`;

  const carbsCountEl = document.getElementById('sumCarbsCount');
  if (carbsCountEl) carbsCountEl.textContent = `${sessionCarbsEntries.length} registos`;

  if (sessionReadings.length > 0) {
    const first = sessionReadings[0];
    const last = sessionReadings[sessionReadings.length - 1];
    const min = Math.min(...sessionReadings);
    const max = Math.max(...sessionReadings);
    const avg = Math.round(sessionReadings.reduce((a, b) => a + b, 0) / sessionReadings.length);

    const inRange = sessionReadings.filter(s => s >= (config.targetMin || 110) && s <= (config.targetMax || 170)).length;
    const tir = Math.round((inRange / sessionReadings.length) * 100);

    const startEndEl = document.getElementById('sumStartEnd');
    if (startEndEl) startEndEl.textContent = `${first} ➔ ${last} mg/dL`;

    const avgEl = document.getElementById('sumAvg');
    if (avgEl) avgEl.textContent = `${avg} mg/dL (${min}-${max})`;

    const tirEl = document.getElementById('sumTIR');
    if (tirEl) tirEl.textContent = `${tir}%`;
  }

  const hrBox = document.getElementById('sumHeartRateBox');
  const hrEl = document.getElementById('sumHeartRate');
  const hrZoneEl = document.getElementById('sumHeartRateZone');
  if (sessionHeartRates.length > 0) {
    const validHrs = sessionHeartRates.filter(h => h > 30 && h < 250);
    if (validHrs.length > 0) {
      const avgHr = Math.round(validHrs.reduce((a, b) => a + b, 0) / validHrs.length);
      const maxHr = Math.max(...validHrs);
      const avgZone = getHeartRateZone(avgHr, config.maxHr || 185);
      if (hrEl) hrEl.textContent = `${avgHr} bpm (máx ${maxHr})`;
      if (hrZoneEl && avgZone) hrZoneEl.textContent = `${avgZone.label} • ${heartRateDeviceName || 'HUAWEI WATCH'}`;
      if (hrBox) hrBox.classList.remove('hidden');
    } else if (hrBox) {
      hrBox.classList.add('hidden');
    }
  } else if (hrBox) {
    hrBox.classList.add('hidden');
  }

  modal.classList.remove('hidden');
}

function closeWorkoutSummaryModal() {
  document.getElementById('workoutSummaryModal')?.classList.add('hidden');
}

function evaluateCarbAdvice(sgv, direction, delta) {
  const lang = config.language || 'pt-PT';
  const isPt = lang === 'pt-PT';
  const dirKey = direction || 'Flat';
  const dirInfo = I18N[lang]?.directions[dirKey] || I18N[lang]?.directions.Flat;
  const dirSpoken = dirInfo.spoken;

  const isDroppingFast = dirKey === 'SingleDown' || dirKey === 'DoubleDown' || (delta !== null && delta <= -5);
  const isDroppingSlow = dirKey === 'FortyFiveDown' || (delta !== null && delta < -2 && delta > -5);
  const isDropping = isDroppingFast || isDroppingSlow;

  // 1. Carb Absorption Window (15 minutes silence for carb alarms!)
  if (lastCarbIntake && (Date.now() - lastCarbIntake.timestamp) < 15 * 60 * 1000) {
    const minsAgo = Math.max(0, Math.floor((Date.now() - lastCarbIntake.timestamp) / 60000));
    if (sgv < 65) {
      if (isPt) {
        return {
          status: 'urgent',
          badge: `🚨 HIPO SEVERA (${lastCarbIntake.grams}g há ${minsAgo}m)`,
          badgeColor: 'bg-red-600 text-white animate-pulse',
          cardBorder: 'border-red-500 shadow-red-900/50',
          carbs: 'PÁRA E AGUARDA',
          title: 'Hipo severa: Pára a corrida e descansa',
          adviceText: `Glicémia muito baixa nos ${sgv}. Já tomaste ${lastCarbIntake.grams}g há ${minsAgo}m. Pára totalmente e aguarda pela digestão.`,
          spokenText: `Atenção urgente! Glicémia baixa a ${sgv}. Pára a corrida e descansa, os hidratos estão a ser absorvidos.`
        };
      } else {
        return {
          status: 'urgent',
          badge: `🚨 SEVERE HYPO (${lastCarbIntake.grams}g ${minsAgo}m ago)`,
          badgeColor: 'bg-red-600 text-white animate-pulse',
          cardBorder: 'border-red-500 shadow-red-900/50',
          carbs: 'STOP & WAIT',
          title: 'Severe Hypo: Stop and rest',
          adviceText: `Very low glucose at ${sgv}. You took ${lastCarbIntake.grams}g ${minsAgo}m ago. Stop and wait for absorption.`,
          spokenText: `Urgent! Blood glucose low at ${sgv}. Stop running and rest, carbs are absorbing.`
        };
      }
    }

    if (isPt) {
      return {
        status: 'absorbing',
        badge: `⏳ EM ABSORÇÃO (${lastCarbIntake.grams}g há ${minsAgo}m)`,
        badgeColor: 'bg-sky-600 text-white animate-pulse',
        cardBorder: 'border-sky-500 shadow-sky-900/40',
        carbs: `Aguardar digestão (${lastCarbIntake.grams}g)`,
        title: 'Gel em absorção (Alerta silenciado)',
        adviceText: `Tomaste ${lastCarbIntake.grams}g há ${minsAgo}m. O Dexcom G7 e a digestão demoram 10 a 15 min. Alertas de hidratos pausados.`,
        spokenText: `Glicémia a ${sgv}, ${dirSpoken}. Hidratos em absorção, tomaste ${lastCarbIntake.grams} gramas há ${minsAgo} minutos. Aguarda pela subida.`
      };
    } else {
      return {
        status: 'absorbing',
        badge: `⏳ ABSORBING (${lastCarbIntake.grams}g ${minsAgo}m ago)`,
        badgeColor: 'bg-sky-600 text-white animate-pulse',
        cardBorder: 'border-sky-500 shadow-sky-900/40',
        carbs: `Waiting (${lastCarbIntake.grams}g)`,
        title: 'Carbs absorbing (Alert paused)',
        adviceText: `You took ${lastCarbIntake.grams}g ${minsAgo}m ago. Takes 10-15m to absorb. Carb alerts paused.`,
        spokenText: `Blood glucose at ${sgv}, ${dirSpoken}. Carbs absorbing, you took ${lastCarbIntake.grams} grams ${minsAgo} minutes ago. Waiting for rise.`
      };
    }
  }

  // 2. Predictive Hypoglycemia Alert (Projected <= 70 within 15 min)
  if (delta !== null && delta <= -5 && sgv <= 140) {
    const dropPerMin = Math.abs(delta) / 5.0;
    const minutesTo70 = Math.round((sgv - 70) / dropPerMin);
    if (minutesTo70 > 0 && minutesTo70 <= 15) {
      if (isPt) {
        return {
          status: 'predictive_hypo',
          badge: `🚨 HIPO EM ~${minutesTo70} MIN`,
          badgeColor: 'bg-rose-600 text-white animate-pulse',
          cardBorder: 'border-rose-500 shadow-rose-900/60',
          carbs: '20g Gel Rápido Já',
          title: 'Alerta Preditivo: Risco de Hipo Iminente',
          adviceText: `Queda rápida de ${Math.abs(delta)} mg/dL em 5m. Ao ritmo atual chegas a 70 mg/dL em ~${minutesTo70}m. Antecipa o atraso do sensor!`,
          spokenText: `Atenção urgente! Queda rápida. Risco de hipoglicémia dentro de ${minutesTo70} minutos. Antecipa o sensor: toma um gel de vinte gramas já!`
        };
      } else {
        return {
          status: 'predictive_hypo',
          badge: `🚨 HYPO IN ~${minutesTo70} MIN`,
          badgeColor: 'bg-rose-600 text-white animate-pulse',
          cardBorder: 'border-rose-500 shadow-rose-900/60',
          carbs: '20g Fast Gel Now',
          title: 'Predictive Alert: Hypo Risk Ahead',
          adviceText: `Fast drop of ${Math.abs(delta)} mg/dL in 5m. Projected to hit 70 mg/dL in about ${minutesTo70} minutes. Anticipate sensor lag!`,
          spokenText: `Urgent warning! Rapid drop. Risk of hypoglycemia in ${minutesTo70} minutes. Take 20 grams of gel now!`
        };
      }
    }
  }

  // 3. Clinical Hypoglycemia (< 75 mg/dL)
  if (sgv < 75) {
    if (isPt) {
      return {
        status: 'urgent',
        badge: '🚨 HIPOGLICÉMIA',
        badgeColor: 'bg-red-600 text-white animate-pulse',
        cardBorder: 'border-red-500 shadow-red-900/50',
        carbs: '20g a 25g HC rápidos',
        title: 'Pára a corrida e ingere 20g a 25g de hidratos rápidos',
        adviceText: 'Glicémia perigosa durante esforço. Pára a corrida imediatamente. Toma 1 gel ou glicose.',
        spokenText: `Atenção urgente! Glicémia perigosamente baixa a ${sgv}, ${dirSpoken}. Pára imediatamente a corrida e consome vinte a vinte e cinco gramas de hidratos rápidos já!`
      };
    } else {
      return {
        status: 'urgent',
        badge: '🚨 HYPOGLYCEMIA',
        badgeColor: 'bg-red-600 text-white animate-pulse',
        cardBorder: 'border-red-500 shadow-red-900/50',
        carbs: '20g to 25g Fast Carbs',
        title: 'Stop running and take 20g to 25g fast carbs',
        adviceText: 'Dangerous low during workout. Stop running immediately. Take 1 gel or liquid carbs.',
        spokenText: `Urgent warning! Blood glucose low at ${sgv}, ${dirSpoken}. Stop running immediately and take 20 to 25 grams of fast carbs!`
      };
    }
  }

  // 4. Imminent Hypo Zone (75 - 110 mg/dL) - Interstitial lag means real capillary blood is < 90!
  if (sgv <= 110) {
    if (isPt) {
      return {
        status: 'urgent',
        badge: '⚠️ QUEBRA IMINENTE',
        badgeColor: 'bg-orange-600 text-white animate-pulse',
        cardBorder: 'border-orange-500 shadow-orange-900/40',
        carbs: '20g a 25g HC (Gel)',
        title: 'Quebra iminente: Toma gel de 20g a 25g já',
        adviceText: `Glicémia nos ${sgv}. O sensor Dexcom G7 tem 10-15m de atraso; no sangue já estás abaixo de 90. Toma gel agora!`,
        spokenText: `Aviso urgente! Glicémia a ${sgv}, ${dirSpoken}. No sangue estás em quebra iminente. Toma vinte a vinte e cinco gramas de gel agora mesmo!`
      };
    } else {
      return {
        status: 'urgent',
        badge: '⚠️ IMMINENT HYPO',
        badgeColor: 'bg-orange-600 text-white animate-pulse',
        cardBorder: 'border-orange-500 shadow-orange-900/40',
        carbs: '20g to 25g Carbs (Gel)',
        title: 'Imminent hypo: Take 20g-25g gel now',
        adviceText: `Glucose at ${sgv}. With Dexcom G7 lag, blood glucose is already below 90. Take a gel immediately!`,
        spokenText: `Warning! Blood glucose ${sgv}, ${dirSpoken}. Blood glucose is dropping fast. Take 20 to 25 grams of carbs now!`
      };
    }
  }

  // 5. Proactive Carb Action Zone (110 - 140 mg/dL) - Dexcom G7 ISF lag compensation!
  if (sgv <= 140) {
    if (isDroppingFast) {
      if (isPt) {
        return {
          status: 'warning',
          badge: '⚠️ QUEDA RÁPIDA: ANTECIPAÇÃO',
          badgeColor: 'bg-amber-600 text-white animate-pulse',
          cardBorder: 'border-amber-500 shadow-amber-900/40',
          carbs: '20g Gel Agressivo',
          title: 'Queda rápida: Toma gel de 20g antecipado',
          adviceText: `Glicémia nos ${sgv} em queda rápida. O gel demora 12-15m a atuar; toma agora para travar a quebra antes de bater nos 90.`,
          spokenText: `Glicémia a ${sgv}, em descida rápida. Antecipa o atraso do sensor: toma um gel de vinte gramas já para travar a quebra!`
        };
      } else {
        return {
          status: 'warning',
          badge: '⚠️ FAST DROP: PROACTIVE',
          badgeColor: 'bg-amber-600 text-white animate-pulse',
          cardBorder: 'border-amber-500 shadow-amber-900/40',
          carbs: '20g Proactive Gel',
          title: 'Fast drop: Take 20g proactive gel now',
          adviceText: `Glucose at ${sgv} dropping fast. Gels take 12-15m to absorb; take now before dropping into hypo.`,
          spokenText: `Blood glucose ${sgv}, falling fast. Anticipate sensor lag: take a 20 gram gel now to stop the crash!`
        };
      }
    }
    if (isDroppingSlow) {
      if (isPt) {
        return {
          status: 'warning',
          badge: 'ℹ️ DESCIDA SUAVE',
          badgeColor: 'bg-amber-500 text-gray-900 font-bold',
          cardBorder: 'border-amber-500 shadow-amber-900/30',
          carbs: '15g a 20g HC / Gel',
          title: 'Descida suave: Reforça com 15g a 20g',
          adviceText: `Glicémia nos ${sgv} com tendência de descida. 15g a 20g sustentam o esforço sem risco de hipo.`,
          spokenText: `Glicémia a ${sgv}, ${dirSpoken}. Toma quinze a vinte gramas de hidratos para proteger a tua corrida.`
        };
      } else {
        return {
          status: 'warning',
          badge: 'ℹ️ DOWNWARD DRIFT',
          badgeColor: 'bg-amber-500 text-gray-900 font-bold',
          cardBorder: 'border-amber-500 shadow-amber-900/30',
          carbs: '15g to 20g Carbs / Chews',
          title: 'Downward drift: Top up 15g to 20g',
          adviceText: `Glucose at ${sgv} drifting down. Take 15-20g carbs to sustain your run.`,
          spokenText: `Blood glucose ${sgv}, ${dirSpoken}. Take 15 to 20 grams of carbs to sustain your run.`
        };
      }
    }
    if (sgv <= 125) {
      if (isPt) {
        return {
          status: 'warning',
          badge: '⚠️ LIMIAR INFERIOR',
          badgeColor: 'bg-yellow-500 text-gray-900 font-bold',
          cardBorder: 'border-yellow-500 shadow-yellow-900/20',
          carbs: '10g a 15g Isotónico / Gomas',
          title: 'Limiar inferior: Reforço preventivo',
          adviceText: `Glicémia nos ${sgv}, estável mas no limite inferior para corrida. Toma 10 a 15g de hidratos de reserva.`,
          spokenText: `Glicémia a ${sgv}, estável mas no limite inferior de corrida. Toma dez a quinze gramas de hidratos de reforço.`
        };
      } else {
        return {
          status: 'warning',
          badge: '⚠️ LOWER BOUNDARY',
          badgeColor: 'bg-yellow-500 text-gray-900 font-bold',
          cardBorder: 'border-yellow-500 shadow-yellow-900/20',
          carbs: '10g to 15g Drink / Chews',
          title: 'Lower boundary: Preventive reinforcement',
          adviceText: `Glucose at ${sgv}, steady but near lower running buffer. Sip 10-15g sports drink.`,
          spokenText: `Blood glucose ${sgv}, steady but at lower running limit. Sip 10 to 15 grams of sports drink.`
        };
      }
    }
    // 126 - 140 Flat
    if (isPt) {
      return {
        status: 'ideal',
        badge: '🎯 BASE ESTÁVEL',
        badgeColor: 'bg-emerald-600 text-white font-bold',
        cardBorder: 'border-emerald-500 shadow-emerald-900/30',
        carbs: 'Manter / Hidratar',
        title: 'Base estável: Mantém o ritmo',
        adviceText: `Glicémia a ${sgv}. Boa base aeróbica. Se o treino for superior a 45 minutos, podes ir bebericando isotónico.`,
        spokenText: `Glicémia a ${sgv}, estável. Ritmo seguro. Não precisas de hidratos de momento.`
      };
    } else {
      return {
        status: 'ideal',
        badge: '🎯 STEADY BASE',
        badgeColor: 'bg-emerald-600 text-white font-bold',
        cardBorder: 'border-emerald-500 shadow-emerald-900/30',
        carbs: 'Maintain / Hydrate',
        title: 'Steady base: Keep your pace',
        adviceText: `Glucose at ${sgv}. Good aerobic baseline. Sip sports drink if running longer than 45m.`,
        spokenText: `Blood glucose ${sgv}, steady. Safe running pace, no carbs needed right now.`
      };
    }
  }

  // 6. Optimal Running Safety Buffer (140 - 175 mg/dL)
  if (sgv <= 175) {
    if (isDroppingFast) {
      if (isPt) {
        return {
          status: 'warning',
          badge: '⚠️ QUEDA ACENTUADA',
          badgeColor: 'bg-yellow-500 text-gray-900 font-bold',
          cardBorder: 'border-yellow-500 shadow-yellow-900/20',
          carbs: '15g Gel Preventivo',
          title: 'No alvo mas a descer rápido',
          adviceText: `Estás na faixa dos ${sgv} mas com queda acentuada. Antecipa com 15g de gel preventivo antes que atinja os 120.`,
          spokenText: `Glicémia a ${sgv}, mas em descida acentuada. Toma quinze gramas de gel preventivo antes que chegue aos cento e vinte.`
        };
      } else {
        return {
          status: 'warning',
          badge: '⚠️ BUFFER DROP',
          badgeColor: 'bg-yellow-500 text-gray-900 font-bold',
          cardBorder: 'border-yellow-500 shadow-yellow-900/20',
          carbs: '15g Preventive Gel',
          title: 'In buffer but rapid drop',
          adviceText: `In range at ${sgv} but dropping fast. Take a 15g preventive gel before reaching 120.`,
          spokenText: `Blood glucose ${sgv}, but dropping fast. Take a 15 gram preventive gel before reaching 120.`
        };
      }
    }
    if (isDroppingSlow) {
      if (isPt) {
        return {
          status: 'ideal',
          badge: '🎯 ZONA SEGURA (DESCIDA LEVE)',
          badgeColor: 'bg-emerald-600 text-white font-bold',
          cardBorder: 'border-emerald-500 shadow-emerald-900/30',
          carbs: '10g Isotónico / Gomas',
          title: 'Zona segura com ligeira descida',
          adviceText: `Glicémia a ${sgv}. Margem confortável. Bebe um pouco de isotónico para compensar o gasto.`,
          spokenText: `Glicémia a ${sgv}, com ligeira descida. Bebe um pouco de isotónico ou come uma goma de dez gramas.`
        };
      } else {
        return {
          status: 'ideal',
          badge: '🎯 SAFE BUFFER (MILD DRIFT)',
          badgeColor: 'bg-emerald-600 text-white font-bold',
          cardBorder: 'border-emerald-500 shadow-emerald-900/30',
          carbs: '10g Drink / Chews',
          title: 'Safe buffer with mild drift',
          adviceText: `Glucose at ${sgv}. Comfortable margin. Sip sports drink to sustain.`,
          spokenText: `Blood glucose ${sgv}, mild downward trend. Sip sports drink or take a 10 gram chew.`
        };
      }
    }
    // Steady or rising in ideal zone
    if (isPt) {
      return {
        status: 'ideal',
        badge: '🎯 ZONA IDEAL',
        badgeColor: 'bg-emerald-500 text-white font-bold',
        cardBorder: 'border-emerald-500 shadow-emerald-900/30',
        carbs: 'Sem hidratos necessários',
        title: 'Zona ideal para corrida: Continua sem hidratos',
        adviceText: 'Glicémia excelente para corrida com ampla margem de segurança. Mantém o ritmo!',
        spokenText: `Glicémia a ${sgv}, ${dirSpoken}. Zona ideal para correr com excelente margem. Continua assim sem hidratos!`
      };
    } else {
      return {
        status: 'ideal',
        badge: '🎯 IDEAL ZONE',
        badgeColor: 'bg-emerald-500 text-white font-bold',
        cardBorder: 'border-emerald-500 shadow-emerald-900/30',
        carbs: 'No carbs needed',
        title: 'Ideal running zone: Keep going',
        adviceText: 'Perfect running glycemia with generous safety buffer. Keep it up!',
        spokenText: `Blood glucose ${sgv}, ${dirSpoken}. Perfect running zone with safety buffer. Keep going!`
      };
    }
  }

  // 7. Elevated (> 175 and <= 230 mg/dL)
  if (sgv <= 230) {
    if (isPt) {
      return {
        status: 'high',
        badge: 'ℹ️ ELEVADA',
        badgeColor: 'bg-purple-600 text-white font-bold',
        cardBorder: 'border-purple-500 shadow-purple-900/30',
        carbs: 'Sem hidratos + Água pura',
        title: 'Elevada: Bebe água e não consumas hidratos',
        adviceText: 'Glicémia alta. Hidrata-te bem com água pura e acompanha a evolução.',
        spokenText: `Glicémia a ${sgv}, ${dirSpoken}. Bebe água pura e evita hidratos até estabilizar.`
      };
    } else {
      return {
        status: 'high',
        badge: 'ℹ️ ELEVATED',
        badgeColor: 'bg-purple-600 text-white font-bold',
        cardBorder: 'border-purple-500 shadow-purple-900/30',
        carbs: 'No carbs + Pure water',
        title: 'Elevated: Drink water, avoid carbs',
        adviceText: 'High glucose. Drink pure water and monitor trend.',
        spokenText: `Blood glucose ${sgv}, ${dirSpoken}. Drink plain water, avoid carbs until it normalizes.`
      };
    }
  }

  // 8. Very High (> 230 mg/dL)
  if (isPt) {
    return {
      status: 'high',
      badge: '⚠️ MUITO ELEVADA',
      badgeColor: 'bg-rose-700 text-white font-bold',
      cardBorder: 'border-rose-500 shadow-rose-900/40',
      carbs: 'Sem hidratos + Hidratação',
      title: 'Muito elevada: Modera o ritmo e bebe água',
      adviceText: 'Atenção ao esforço com glicémia muito elevada. Modera o ritmo e bebe água abundante.',
      spokenText: `Atenção: Glicémia muito alta a ${sgv}. Modera o ritmo da corrida, bebe água abundante e evita hidratos.`
    };
  } else {
    return {
      status: 'high',
      badge: '⚠️ VERY HIGH',
      badgeColor: 'bg-rose-700 text-white font-bold',
      cardBorder: 'border-rose-500 shadow-rose-900/40',
      carbs: 'No carbs + Rest & hydrate',
      title: 'Very high: Ease pace and hydrate',
      adviceText: 'Caution with high glucose. Ease running pace and drink plenty of water.',
      spokenText: `Warning: Blood glucose very high at ${sgv}. Ease your running pace, drink water and avoid carbs.`
    };
  }
}

// Studio Voice Audio Playback via Server TTS (Language-aware with Audio Ducking for Music)
function playStudioVoice(spokenText) {
  const pulseEl = document.getElementById('audioPulseIndicator');
  if (pulseEl) pulseEl.classList.remove('hidden');

  const lang = config.language || 'en';
  const cleanText = spokenText.replace(/⇈|↑|↗|→|↘|↓|⇊|—|\?/g, '').trim();
  const audioUrl = `https://runner.gatoescondido.com/api/tts?text=${encodeURIComponent(cleanText)}&lang=${encodeURIComponent(lang)}`;

  const btnTest = document.getElementById('btnTestAudio');
  const btnSpeak = document.getElementById('btnAnnounceNow');
  if (btnTest) btnTest.classList.add('opacity-70');
  if (btnSpeak) btnSpeak.classList.add('opacity-70');

  const onDone = () => {
    if (pulseEl) pulseEl.classList.add('hidden');
    if (btnTest) btnTest.classList.remove('opacity-70');
    if (btnSpeak) btnSpeak.classList.remove('opacity-70');
  };

  // 1. Direct native AndroidVoice bridge (primary, 100% reliable)
  if (window.AndroidVoice && typeof window.AndroidVoice.playVoice === 'function') {
    try {
      window._onNativeVoiceDone = onDone;
      window.AndroidVoice.playVoice(audioUrl);
      setTimeout(onDone, 12000);
      return;
    } catch (e) {
      console.warn('AndroidVoice failed, falling back:', e);
    }
  }

  // 2. Capacitor Plugin
  if (NativeVoice && typeof NativeVoice.play === 'function') {
    NativeVoice.play({ url: audioUrl })
      .then(onDone)
      .catch(e => {
        console.warn('NativeVoice plugin error, trying web fallback:', e);
        fallbackWebAudio(audioUrl, onDone);
      });
    return;
  }

  // 3. Web Audio fallback
  fallbackWebAudio(audioUrl, onDone);
}

function fallbackWebAudio(audioUrl, onDone) {
  if (currentAudioPlayer) {
    try {
      currentAudioPlayer.pause();
      currentAudioPlayer.src = '';
      currentAudioPlayer.load();
    } catch (e) {}
    currentAudioPlayer = null;
  }

  const audio = new Audio(audioUrl);
  currentAudioPlayer = audio;

  const cleanup = () => {
    if (onDone) onDone();
    currentAudioPlayer = null;
    try {
      audio.pause();
      audio.src = '';
      audio.load();
    } catch (e) {}
  };

  audio.onended = cleanup;
  audio.onerror = (e) => {
    console.error('Audio stream error loading TTS from server:', e);
    cleanup();
  };

  audio.play().catch(err => {
    console.warn('Audio play prevented', err);
    cleanup();
  });
}

function getStartButtonText(lang, intervalMinutes) {
  const m = intervalMinutes || 2;
  const isDaily = (currentSessionMode === 'daily');
  if (lang === 'pt-PT') {
    return isDaily
      ? `Iniciar Monitorização (Voz a cada ${m} min)`
      : `Iniciar Corrida (Voz a cada ${m} min)`;
  }
  return isDaily
    ? `Start Monitoring (Voice every ${m} min)`
    : `Start Run (Voice every ${m} min)`;
}

// Apply Language strings to entire UI
function applyLanguageUI() {
  const lang = config.language || 'en';
  const data = I18N[lang];
  if (!data) return;
  const texts = data.ui;

  document.getElementById('currentLangFlag').textContent = data.flag;
  document.getElementById('currentLangText').textContent = data.code;

  const setT = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setT('labelSpeaking', texts.speaking);
  setT('labelGlucoseTitle', texts.glucoseTitle);
  setT('labelVar5m', texts.var5m);
  setT('labelCoachTitle', texts.coachTitle);
  setT('labelDose', texts.dose);
  setT('labelNextVoice', texts.nextVoice);
  setT('labelDuration', texts.duration);
  setT('labelAnnouncements', texts.announcements);
  setT('footerTip', texts.footerTip);
  setT('settingsTitle', texts.settingsTitle);
  setT('labelLangSetting', texts.labelLangSetting);
  setT('labelNsUrl', texts.labelNsUrl);
  setT('labelInterval', texts.labelInterval);
  setT('btnSaveSettings', texts.btnSaveSettings);

  const isPt = lang === 'pt-PT';
  setT('labelQuickGel', isPt ? 'Tomei Gel (20g)' : 'Took Gel (20g)');
  setT('labelMicBtn', isPt ? 'Voz' : 'Voice');
  setT('labelProfZone2', isPt ? 'Longo (130-170)' : 'Long Run (130-170)');
  setT('labelProfHIIT', isPt ? 'Séries (110-150)' : 'Intervals (110-150)');
  setT('labelProfWalk', isPt ? 'Caminhada (90-140)' : 'Walk (90-140)');
  setT('summaryTitle', isPt ? 'Resumo do Treino' : 'Workout Summary');
  setT('summarySub', isPt ? 'Treino Concluído' : 'Workout Completed');
  setT('labelSumDuration', isPt ? 'Duração' : 'Duration');
  setT('labelSumTIR', isPt ? 'Tempo no Alvo' : 'Time in Range');
  setT('labelSumStartEnd', isPt ? 'Inicial ➔ Final' : 'Start ➔ Finish');
  setT('labelSumAvg', isPt ? 'Média (Mín/Máx)' : 'Average (Min/Max)');
  setT('labelSumCarbs', isPt ? 'Hidratos Consumidos' : 'Carbs Consumed');
  setT('labelVoiceContent', isPt ? 'Conteúdo do Anúncio de Voz' : 'Voice Announcement Content');
  setT('labelOptSgv', isPt ? 'Glicémia Atual (ex: 135)' : 'Current Glucose (e.g. 135)');
  setT('labelOptTrend', isPt ? 'Tendência / Seta' : 'Trend Arrow');
  setT('labelOptDelta', isPt ? 'Variação 5m' : '5m Delta');
  setT('labelOptCoach', isPt ? 'Recomendação do Treinador (Carb Coach)' : 'Coach Recommendation');
  setT('labelOptDuration', isPt ? 'Duração da Corrida' : 'Workout Duration');

  const footerWhatsNew = document.getElementById('btnFooterWhatsNew');
  if (footerWhatsNew) {
    footerWhatsNew.innerHTML = '<span>✨ v1.6</span>';
  }
  const settingsWhatsNew = document.getElementById('btnSettingsWhatsNew');
  if (settingsWhatsNew) {
    settingsWhatsNew.innerHTML = isPt ? '<span>✨ Ver o que há de novo na v1.6</span>' : "<span>✨ See What's New in v1.6</span>";
  }

  const startBtn = document.getElementById('startBtnText');
  if (startBtn) startBtn.textContent = getStartButtonText(lang, config.intervalMinutes);
  const stopBtn = document.getElementById('stopBtnText');
  if (stopBtn) stopBtn.textContent = texts.stopBtn;
  const speakBtn = document.getElementById('speakNowText');
  if (speakBtn) speakBtn.textContent = texts.speakNow;
  const testBtn = document.getElementById('testAudioText');
  if (testBtn) testBtn.textContent = texts.testAudio;

  const statusText = document.getElementById('workoutStatusText');
  if (statusText) statusText.textContent = isRunning ? texts.workoutRunning : texts.workoutStopped;

  const cfgLang = document.getElementById('cfgLanguage');
  if (cfgLang) cfgLang.value = lang;

  const intervalSelect = document.getElementById('cfgInterval');
  if (intervalSelect) {
    const curVal = intervalSelect.value || String(config.intervalMinutes || 2);
    const opts = [
      { val: '1', pt: 'A cada 1 minuto', en: 'Every 1 minute' },
      { val: '2', pt: 'A cada 2 minutos (Recomendado)', en: 'Every 2 minutes (Recommended)' },
      { val: '3', pt: 'A cada 3 minutos', en: 'Every 3 minutes' },
      { val: '5', pt: 'A cada 5 minutos', en: 'Every 5 minutes' },
    ];
    intervalSelect.innerHTML = opts.map(o =>
      `<option value="${o.val}" ${o.val === curVal ? 'selected' : ''}>${lang === 'pt-PT' ? o.pt : o.en}</option>`
    ).join('');
  }

  if (typeof updateBluetoothStatusBadge === 'function' && typeof currentAudioStatus !== 'undefined') {
    updateBluetoothStatusBadge(currentAudioStatus);
  }
}

// Toggle language
function toggleLanguage() {
  config.language = config.language === 'en' ? 'pt-PT' : 'en';
      config.voiceOptions = {
      sgv: !!document.getElementById('cfgOptSgv')?.checked,
      trend: !!document.getElementById('cfgOptTrend')?.checked,
      delta: !!document.getElementById('cfgOptDelta')?.checked,
      coach: !!document.getElementById('cfgOptCoach')?.checked,
      duration: !!document.getElementById('cfgOptDuration')?.checked
    };
    saveConfig();
  applyLanguageUI();
  if (lastEntry) {
    const delta = prevEntry ? lastEntry.sgv - prevEntry.sgv : null;
    const advice = evaluateCarbAdvice(lastEntry.sgv, lastEntry.direction, delta);
    updateUIWithReading(lastEntry, prevEntry, delta, advice);
  }
}

// Media Session Setup (disabled by default so we NEVER steal lockscreen from Yuma/music)
function updateMediaSession(sgv, direction, carbAdvice) {
  if (!config.enableEarbudShortcuts) return;
  if (!('mediaSession' in navigator)) return;

  const lang = config.language || 'en';
  const dirInfo = I18N[lang]?.directions[direction || 'Flat'] || I18N[lang]?.directions.Flat;
  const symbol = dirInfo.symbol;

  navigator.mediaSession.metadata = new MediaMetadata({
    title: `🩸 ${sgv} mg/dL ${symbol}`,
    artist: `NS Runner: ${carbAdvice.carbs}`,
    album: carbAdvice.title,
    artwork: [
      { src: '/icon.svg', sizes: '512x512', type: 'image/svg+xml' }
    ]
  });

  navigator.mediaSession.setActionHandler('nexttrack', () => {
    announceCurrent(true);
  });
  navigator.mediaSession.setActionHandler('previoustrack', () => {
    announceCurrent(true);
  });
}

// Fetch Nightscout Readings
async function fetchNightscoutEntries() {
  const endpointsToTry = [
    `${API_BASE}/api/entries`,
    `${config.nsUrl.replace(/\/+$/, '')}/api/v1/entries.json?count=5`,
    `https://corsproxy.io/?${encodeURIComponent(config.nsUrl.replace(/\/+$/, '') + '/api/v1/entries.json?count=5')}`
  ];

  let lastError = null;
  for (const url of endpointsToTry) {
    try {
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch (e) {
      lastError = e;
    }
  }

  throw lastError || new Error('Could not fetch Nightscout entries');
}

function timeAgo(date) {
  const lang = config.language || 'en';
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (lang === 'en') {
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    return `${Math.floor(minutes / 60)}h ago`;
  }
  if (seconds < 60) return `há ${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  return `há ${Math.floor(minutes / 60)}h`;
}

// Polling & Announcement Routine
async function performPollAndAnnouncement(isManualTrigger = false, skipSpeech = false) {
  try {
    const syncIndicator = document.getElementById('syncIndicator');
    if (syncIndicator) syncIndicator.classList.add('animate-spin');

    const entries = await fetchNightscoutEntries();
    if (syncIndicator) syncIndicator.classList.remove('animate-spin');

    const current = entries[0];
    const previous = entries[1] || null;

    lastEntry = current;
    prevEntry = previous;

    const sgv = current.sgv;
    const direction = current.direction || 'Flat';
    let delta = null;

    if (previous && previous.sgv) {
      delta = sgv - previous.sgv;
    }

    const advice = evaluateCarbAdvice(sgv, direction, delta);

    updateUIWithReading(current, previous, delta, advice);
    updateMediaSession(sgv, direction, advice);

    if ((isRunning || isManualTrigger) && !skipSpeech) {
      announcementCount++;
      const countEl = document.getElementById('announcementCount');
      if (countEl) countEl.textContent = announcementCount;
      let voiceMsg = advice.spokenText;
      const vOpts = config.voiceOptions || {};
      if (vOpts.heartRate !== false && currentHeartRate > 0) {
        const hrZone = getHeartRateZone(currentHeartRate, config.maxHr || 185);
        if (hrZone) {
          if (config.language === 'pt-PT') {
            voiceMsg += ` ${currentHeartRate} batimentos por minuto, ${hrZone.spokenPt}.`;
          } else {
            voiceMsg += ` Heart rate ${currentHeartRate} bpm, ${hrZone.spokenEn}.`;
          }
        }
      }
      if (vOpts.duration && isRunning && workoutStartTime) {
        const elapsedMins = Math.floor((Date.now() - workoutStartTime) / 60000);
        if (elapsedMins > 0) {
          voiceMsg += (config.language === 'pt-PT') ? ` ${elapsedMins} minutos de corrida.` : ` ${elapsedMins} minutes of running.`;
        }
      }
      if (current && (Date.now() - current.date) >= 10 * 60 * 1000) {
        const staleM = Math.floor((Date.now() - current.date) / 60000);
        const staleMsg = (config.language === 'pt-PT')
          ? ` Atenção, sinal do sensor com ${staleM} minutos de atraso.`
          : ` Warning, sensor signal delayed by ${staleM} minutes.`;
        voiceMsg += staleMsg;
      }
      playStudioVoice(voiceMsg);
    }
  } catch (err) {
    console.error('Error polling Nightscout:', err);
    const syncIndicator = document.getElementById('syncIndicator');
    if (syncIndicator) syncIndicator.classList.remove('animate-spin');
    const readingTime = document.getElementById('readingTime');
    if (readingTime) readingTime.textContent = 'Error';
  }
}

function updateUIWithReading(current, previous, delta, advice) {
  if (isRunning && current && current.sgv) {
    sessionReadings.push(current.sgv);
  }
  const ageMinutes = Math.floor((Date.now() - current.date) / (60 * 1000));

  const lang = config.language || 'en';
  const sgvEl = document.getElementById('currentSgv');
  const trendEl = document.getElementById('currentTrend');
  const deltaEl = document.getElementById('currentDelta');
  const timeEl = document.getElementById('readingTime');
  const adviceBadge = document.getElementById('carbBadge');
  const adviceCarbs = document.getElementById('carbAmount');
  const adviceTitle = document.getElementById('carbTitle');
  const adviceDesc = document.getElementById('carbDescription');
  const mainCard = document.getElementById('glucoseCard');

  if (sgvEl) sgvEl.textContent = current.sgv;
  if (trendEl) {
    const dirInfo = I18N[lang]?.directions[current.direction] || I18N[lang]?.directions.Flat;
    trendEl.textContent = dirInfo.symbol;
    trendEl.title = dirInfo.label;
  }
  if (deltaEl) {
    if (delta !== null) {
      const sign = delta > 0 ? '+' : '';
      deltaEl.textContent = `${sign}${delta} mg/dL`;
      deltaEl.className = delta > 0 ? 'text-sky-400 font-semibold' : delta < 0 ? 'text-amber-400 font-semibold' : 'text-gray-400 font-semibold';
    } else {
      deltaEl.textContent = '—';
    }
  }
  if (timeEl) {
    timeEl.textContent = timeAgo(current.dateString || current.date);
  }

  if (adviceBadge) {
    adviceBadge.textContent = advice.badge;
    adviceBadge.className = `px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${advice.badgeColor}`;
  }
  if (adviceCarbs) adviceCarbs.textContent = advice.carbs;
  if (adviceTitle) adviceTitle.textContent = advice.title;
  if (adviceDesc) adviceDesc.textContent = advice.adviceText;

  // Mini Glucose Bar in Gym View
  const gymSgv = document.getElementById('gymGlucoseVal');
  const gymTrend = document.getElementById('gymGlucoseTrend');
  const gymDelta = document.getElementById('gymGlucoseDelta');
  if (gymSgv && current && current.sgv) {
    gymSgv.textContent = `${current.sgv} mg/dL`;
    if (current.sgv < config.targetMin) {
      gymSgv.className = 'text-xs font-black text-rose-400 font-mono';
    } else if (current.sgv > config.targetMax) {
      gymSgv.className = 'text-xs font-black text-amber-400 font-mono';
    } else {
      gymSgv.className = 'text-xs font-black text-emerald-400 font-mono';
    }
  }
  if (gymTrend && current && current.direction) {
    const dirInfo = I18N[lang]?.directions[current.direction] || I18N[lang]?.directions.Flat;
    if (dirInfo) gymTrend.textContent = dirInfo.symbol;
  }
  if (gymDelta && delta !== null) {
    const sign = delta > 0 ? '+' : '';
    gymDelta.textContent = `(${sign}${delta})`;
  }

  if (mainCard) {
    mainCard.className = `relative overflow-hidden rounded-2xl bg-slate-900/90 border-2 px-4 py-2 sm:py-3 backdrop-blur-xl transition-all duration-300 shadow-xl ${advice.cardBorder}`;
  }

  const coachCard = document.getElementById('carbCoachCard');
  if (coachCard) {
    if (advice.status === 'absorbing') {
      coachCard.className = 'rounded-2xl bg-gradient-to-b from-sky-950/90 to-slate-950/95 border-2 border-sky-500/80 p-2 sm:p-2.5 shadow-lg shadow-sky-900/30 shrink-0 transition-all';
    } else {
      coachCard.className = 'rounded-2xl bg-gradient-to-b from-slate-900/95 to-slate-950/95 border border-slate-800 p-2 sm:p-2.5 shadow-md shrink-0 transition-all';
    }
  }
}

function setSessionMode(mode) {
  currentSessionMode = mode === 'daily' ? 'daily' : 'running';
  try { localStorage.setItem('runner_session_mode', currentSessionMode); } catch (e) {}

  const btnRun = document.getElementById('btnModeRunning');
  const btnDaily = document.getElementById('btnModeDaily');
  const startText = document.getElementById('startBtnText');
  const lang = config.language || 'en';

  if (currentSessionMode === 'daily') {
    if (btnDaily) btnDaily.className = 'flex-1 py-1.5 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition bg-sky-600 text-white shadow-sm cursor-pointer';
    if (btnRun) btnRun.className = 'flex-1 py-1.5 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer';
    if (startText && !isRunning) startText.textContent = getStartButtonText(lang, config.intervalMinutes);
  } else {
    if (btnRun) btnRun.className = 'flex-1 py-1.5 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition bg-emerald-600 text-white shadow-sm cursor-pointer';
    if (btnDaily) btnDaily.className = 'flex-1 py-1.5 px-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer';
    if (startText && !isRunning) startText.textContent = getStartButtonText(lang, config.intervalMinutes);
  }
}

async function checkLatestPumpBolus() {
  try {
    const res = await fetch('/api/pump/latest?t=' + Date.now());
    if (!res.ok) return null;
    const data = await res.json();
    const badge = document.getElementById('pumpBolusBadge');
    const badgeText = document.getElementById('pumpBolusText');
    if (!badge || !badgeText) return data;

    const gymBadge = document.getElementById('gymBolusMiniBadge');
    const gymBadgeText = document.getElementById('gymBolusMiniText');

    if (data && data.hasBolus && data.minsAgo < 180) {
      badge.classList.remove('hidden');
      const timeStr = data.minsAgo < 60 ? `${data.minsAgo}m` : `${Math.floor(data.minsAgo / 60)}h${data.minsAgo % 60}m`;
      badgeText.textContent = `Bólus: ${data.insulin}U há ${timeStr}`;
      if (gymBadge && gymBadgeText) {
        gymBadge.classList.remove('hidden');
        gymBadgeText.textContent = `${data.insulin}U há ${timeStr}`;
      }
    } else {
      badge.classList.add('hidden');
      if (gymBadge) gymBadge.classList.add('hidden');
    }
    return data;
  } catch (e) {
    return null;
  }
}

// Workout Management
async function startWorkout() {
  isRunning = true;
  workoutStartTime = Date.now();
  sessionStartTime = Date.now();
  sessionReadings = [];
  sessionHeartRates = [];
  if (currentHeartRate > 0) {
    sessionHeartRates.push(currentHeartRate);
  }
  sessionCarbsTotal = 0;
  sessionCarbsEntries = [];
  if (lastEntry && lastEntry.sgv) {
    sessionReadings.push(lastEntry.sgv);
  }
  lastAnnouncementTimestamp = Date.now();
  announcementCount = 0;
  const countEl = document.getElementById('announcementCount');
  if (countEl) countEl.textContent = '0';

  // 1. Start Native Android Foreground Service (for APK background execution)
  triggerNativeForegroundStart();
  checkInitialAudioOutput();

  // Auto-connect to Huawei Watch on workout start if not connected yet
  if (!isHeartRateConnected && isRunningNative()) {
    if (window.AndroidVoice && typeof window.AndroidVoice.startHeartRateScan === 'function') {
      window.AndroidVoice.startHeartRateScan();
    }
  }

  if (config.wakeLockEnabled && 'wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {
      console.warn('Wake Lock failed', e);
    }
  }

  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.playbackState = 'playing'; } catch (e) {}
  }

  const lang = config.language || 'en';
  document.getElementById('btnStartWorkout').classList.add('hidden');
  document.getElementById('btnStopWorkout').classList.remove('hidden');
  document.getElementById('workoutStatusBadge').className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5';
  document.getElementById('workoutStatusBadge').innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> ' + I18N[lang].ui.workoutRunning;

  // Main thread backup timer
  if (workoutIntervalId) clearInterval(workoutIntervalId);
  workoutIntervalId = setInterval(onHeartbeatTick, 1000);

  // Immediate poll and announce (in native mode, native service already polls & speaks)
  if (!isNativeApp) {
    await performPollAndAnnouncement(false);
  } else {
    performPollAndAnnouncement(false, true); // skipSpeech since native service already speaks
  }
  lastAnnouncementTimestamp = Date.now();
  secondsRemaining = (config.intervalMinutes || 2) * 60;
  updateCountdownDisplay();
}

function stopWorkout(fromNative = false) {
  console.log('[Workout] Stopping workout... fromNative=' + fromNative);
  isRunning = false;
  if (workoutIntervalId) {
    clearInterval(workoutIntervalId);
    workoutIntervalId = null;
  }
  if (timerId) {
    clearInterval(timerId);
    timerId = null;
  }
  if (countdownTimerId) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }

  // Always invoke native stop to kill Foreground Service, WakeLock, and Notification immediately
  triggerNativeForegroundStop();

  if (currentAudioPlayer) {
    try {
      currentAudioPlayer.pause();
      currentAudioPlayer.src = '';
    } catch (e) {}
    currentAudioPlayer = null;
  }

  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }

  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.playbackState = 'paused'; } catch (e) {}
  }

  const lang = config.language || 'en';
  document.getElementById('btnStartWorkout').classList.remove('hidden');
  document.getElementById('btnStopWorkout').classList.add('hidden');
  document.getElementById('workoutStatusBadge').className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1.5';
  document.getElementById('workoutStatusBadge').innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-500"></span> ' + I18N[lang].ui.workoutStopped;
  updateCountdownDisplay();

  if (currentSessionMode !== 'daily' && (sessionReadings.length > 0 || sessionStartTime)) {
    showWorkoutSummaryModal();
  }
}

function resetCountdown() {
  lastAnnouncementTimestamp = Date.now();
  secondsRemaining = (config.intervalMinutes || 2) * 60;
  updateCountdownDisplay();
}

function updateCountdownDisplay() {
  const el = document.getElementById('countdownText');
  if (!el) return;
  if (!isRunning) {
    const mins = config.intervalMinutes || 2;
    el.textContent = `${mins}:00`;
    return;
  }
  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const str = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  el.textContent = str;
}

function updateWorkoutDuration() {
  if (!workoutStartTime) return;
  const diff = Math.floor((Date.now() - workoutStartTime) / 1000);
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;

  const durationStr = hours > 0
    ? `${hours}h ${remainingMins < 10 ? '0' : ''}${remainingMins}m`
    : `${mins}:${secs < 10 ? '0' : ''}${secs}`;

  const el = document.getElementById('workoutDuration');
  if (el) el.textContent = durationStr;
}

function announceCurrent(forceFetch = false) {
  if (lastEntry) {
    const delta = prevEntry ? lastEntry.sgv - prevEntry.sgv : null;
    const advice = evaluateCarbAdvice(lastEntry.sgv, lastEntry.direction, delta);
    playStudioVoice(advice.spokenText);
    if (forceFetch) {
      performPollAndAnnouncement(false, true); // true = skip speech since we already spoke!
    }
  } else {
    performPollAndAnnouncement(true, false);
  }
}

// What's New & Release Changelog System
const CHANGELOG_DATA = {
  versionCode: 15,
  versionName: '2.4',
  'pt-PT': {
    title: 'O que há de novo',
    sub: 'Versão 2.3 • Modo Sessão, Emergência 30s & Bomba Tandem',
    btnDismiss: 'Entendido! 🚀',
    features: [
      {
        icon: '🏋️',
        title: 'Treino de Ginásio (100% Máquinas)',
        desc: 'Novo separador dedicado aos treinos de ginásio sincronizados com o Intervals.icu, cronómetro de descanso de 60s, checklist de séries e guia postural catita.'
      },
      {
        icon: '🏃',
        title: 'Modo Treino vs Dia a Dia',
        desc: 'Alterna com 1 toque entre Treino (com GPS, ritmo cardíaco e Intervals) e Modo Dia a Dia (apenas glicémia por voz e no ecrã).'
      },
      {
        icon: '🚨',
        title: 'Aviso Imediato de Emergência (30s)',
        desc: 'Se a glicémia descer a pique ou entrar em hipo severa, a app avisa de imediato sem esperar pelo temporizador de 2 minutos.'
      },
      {
        icon: '💉',
        title: 'Deteção de Bólus da Bomba Tandem',
        desc: 'Novo crachá com o último bólus administrado pela bomba de insulina e anúncio sonoro quando ocorre uma administração recente.'
      },
      {
        icon: '🎙️',
        title: 'Voz Focada na Glicémia',
        desc: 'Removido o anúncio de ritmo para manter o anúncio sonoro curto e focado. A glicémia é sempre dita, mesmo em absorção de hidratos.'
      }
    ]
  },
  'en': {
    title: "What's New",
    sub: 'Version 2.3 • Session Mode, 30s Danger Alerts & Tandem Pump',
    btnDismiss: "Got it! 🚀",
    features: [
      {
        icon: '🏃',
        title: 'Workout vs Daily Mode',
        desc: 'Toggle with 1 tap between Workout mode (GPS, HR, Intervals) and Daily mode (voice glucose only, no workout prompts).'
      },
      {
        icon: '🚨',
        title: 'Immediate 30s Danger Alerts',
        desc: 'Fast checking loop interrupts immediately on rapid drop or severe hypo without waiting for the cycle.'
      },
      {
        icon: '💉',
        title: 'Tandem Pump Bolus Detection',
        desc: 'Detects recent insulin boluses from your pump and announces them.'
      },
      {
        icon: '🎙️',
        title: 'Glucose-Centric Audio',
        desc: 'Pace speech removed so glucose is always crisp and prominent, even during carb absorption.'
      }
    ]
  }
};

function openWhatsNewModal(customFeatures) {
  const modal = document.getElementById('whatsNewModal');
  if (!modal) return;
  const lang = config.language === 'pt-PT' ? 'pt-PT' : 'en';
  const cData = CHANGELOG_DATA[lang] || CHANGELOG_DATA['pt-PT'];

  const titleEl = document.getElementById('whatsNewTitle');
  const subEl = document.getElementById('whatsNewSub');
  const listEl = document.getElementById('whatsNewContent');
  const btnDismiss = document.getElementById('btnDismissWhatsNew');

  if (titleEl) titleEl.textContent = cData.title;
  if (subEl) subEl.textContent = `${cData.sub} (v${CHANGELOG_DATA.versionName})`;
  if (btnDismiss) btnDismiss.textContent = cData.btnDismiss;

  const features = (customFeatures && customFeatures.length > 0) ? customFeatures : cData.features;

  if (listEl) {
    listEl.innerHTML = features.map(f => `
      <div class="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/80">
        <span class="text-xl shrink-0 p-2 rounded-xl bg-slate-900 border border-slate-800">${f.icon || '✨'}</span>
        <div>
          <h4 class="text-xs font-bold text-slate-100">${f.title}</h4>
          <p class="text-[11px] text-slate-400 mt-1 leading-relaxed">${f.desc}</p>
        </div>
      </div>
    `).join('');
  }

  modal.classList.remove('hidden');
}

function closeWhatsNewModal() {
  const modal = document.getElementById('whatsNewModal');
  if (!modal) return;
  modal.classList.add('hidden');
  localStorage.setItem('runner_last_seen_version_code', String(CHANGELOG_DATA.versionCode));
}

// App Initialization
// Check for native APK updates
async function checkAppVersion() {
  if (!isRunningNative()) return;
  try {
    const res = await fetch('/api/version?t=' + Date.now());
    if (!res.ok) return;
    const data = await res.json();
    if (!data || !data.versionCode) return;

    // Check if user already dismissed or installed this version in localStorage
    const dismissed = localStorage.getItem('runner_dismissed_update_version');
    if (dismissed && parseInt(dismissed, 10) >= data.versionCode) {
      const existing = document.getElementById('updateBanner');
      if (existing) existing.remove();
      return;
    }

    let currentVersion = null;
    if (window.AndroidVoice && typeof window.AndroidVoice.getNativeVersionCode === 'function') {
      try {
        currentVersion = window.AndroidVoice.getNativeVersionCode();
      } catch (err) {
        console.warn('getNativeVersionCode error:', err);
      }
    }

    // Check localStorage fallback
    const stored = localStorage.getItem('runner_installed_version_code');
    if (currentVersion !== null && currentVersion !== undefined && currentVersion > 0) {
      localStorage.setItem('runner_installed_version_code', String(currentVersion));
    } else if (stored) {
      currentVersion = parseInt(stored, 10);
    }

    console.log(`[VersionCheck] Installed=${currentVersion}, Server=${data.versionCode}`);

    // If native version is equal to or greater than server, WE ARE UP TO DATE!
    if (currentVersion && currentVersion >= data.versionCode) {
      const existing = document.getElementById('updateBanner');
      if (existing) existing.remove();
      return;
    }

    // If localStorage already records this version was installed, don't nag
    if (stored && parseInt(stored, 10) >= data.versionCode) {
      const existing = document.getElementById('updateBanner');
      if (existing) existing.remove();
      return;
    }

    // Only show banner if we have a valid confirmed older native version
    if (currentVersion && currentVersion > 0 && data.versionCode > currentVersion) {
      showUpdateBanner(data);
    }
  } catch (e) {
    console.warn('App version check ignored:', e);
  }
}

function showUpdateBanner(data) {
  if (document.getElementById('updateBanner')) return;
  const lang = config.language === 'pt-PT' ? 'pt-PT' : 'en';
  const isPt = lang === 'pt-PT';
  const banner = document.createElement('div');
  banner.id = 'updateBanner';
  banner.className = 'bg-gradient-to-r from-sky-600 via-indigo-600 to-sky-700 text-white px-3 py-2 text-xs flex items-center justify-between shadow-lg sticky top-0 z-50 border-b border-white/10';
  banner.innerHTML = `
    <div class="flex items-center gap-1.5 font-medium truncate mr-2">
      <span class="animate-bounce">🚀</span>
      <span>${isPt ? `Nova versão ${data.versionName} disponível!` : `New version ${data.versionName} available!`}</span>
    </div>
    <div class="flex items-center gap-1.5 shrink-0">
      <button id="btnBannerWhatsNew" class="px-2 py-1 bg-white/20 hover:bg-white/30 text-white font-bold rounded-lg text-[11px] transition cursor-pointer">
        ${isPt ? 'Novidades' : 'Changelog'}
      </button>
      <button id="btnDoUpdate" class="px-2.5 py-1 bg-white text-sky-900 font-extrabold rounded-lg text-[11px] hover:bg-slate-100 transition shadow cursor-pointer">
        ${isPt ? 'Atualizar' : 'Update'}
      </button>
      <button id="btnDismissUpdate" class="p-1 hover:bg-white/20 text-white/80 hover:text-white rounded-lg text-sm transition cursor-pointer" title="${isPt ? 'Fechar' : 'Dismiss'}">
        ✕
      </button>
    </div>
  `;
  document.body.prepend(banner);

  const btnWhatsNew = banner.querySelector('#btnBannerWhatsNew');
  if (btnWhatsNew) {
    btnWhatsNew.addEventListener('click', () => {
      openWhatsNewModal(data.features || null);
    });
  }

  const btnDismiss = banner.querySelector('#btnDismissUpdate');
  if (btnDismiss) {
    btnDismiss.addEventListener('click', () => {
      localStorage.setItem('runner_dismissed_update_version', String(data.versionCode));
      banner.remove();
    });
  }

  const btn = banner.querySelector('#btnDoUpdate');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.setItem('runner_installed_version_code', String(data.versionCode));
      localStorage.setItem('runner_dismissed_update_version', String(data.versionCode));
      banner.remove();

      if (window.AndroidVoice && typeof window.AndroidVoice.openDownloadUrl === 'function') {
        window.AndroidVoice.openDownloadUrl(data.apkUrl);
      } else {
        window.location.href = data.apkUrl;
      }
    });
  }
}


// Live Audio Output Status System (Bluetooth earbuds vs Phone speaker)
let currentAudioStatus = null;

function updateBluetoothStatusBadge(status) {
  currentAudioStatus = status;
  const badge = document.getElementById('audioStatusBadge');
  const icon = document.getElementById('audioStatusIcon');
  const label = document.getElementById('labelBluetooth');
  if (!badge || !label) return;

  const lang = config.language || 'pt-PT';
  const isPt = lang === 'pt-PT';

  if (!status || (!status.isBluetooth && !status.isWired)) {
    // Built-in Speaker / No headphones
    badge.className = 'flex items-center gap-1.5 text-xs font-medium bg-slate-900/80 border border-slate-800 text-slate-400 px-3 py-1 rounded-full transition-all cursor-pointer select-none';
    label.textContent = isPt ? 'Altifalante (Sem Fones)' : 'Speaker (No Earbuds)';
    badge.title = isPt ? 'Altifalante ativo (Sem auriculares detetados)' : 'Speaker active (No earbuds detected)';
    if (icon) {
      icon.innerHTML = `<svg class="w-3.5 h-3.5 text-slate-500" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77zm-2.5 4.77l-4.5 4.5H3v3h4l4.5 4.5V8zM16.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
      </svg>`;
    }
  } else if (status.isBluetooth) {
    // Bluetooth Earbuds Connected
    badge.className = 'flex items-center gap-1.5 text-xs font-semibold bg-emerald-950/60 border border-emerald-500/50 text-emerald-300 px-3 py-1 rounded-full shadow-sm shadow-emerald-950/50 transition-all cursor-pointer select-none';
    const rawName = (status.deviceName && status.deviceName.trim()) ? status.deviceName.trim() : '';
    const name = rawName || (isPt ? 'Fones Bluetooth' : 'Bluetooth Earbuds');
    label.textContent = name;
    badge.title = isPt ? `Auriculares Bluetooth ligados: ${name}` : `Bluetooth earbuds connected: ${name}`;
    if (icon) {
      icon.innerHTML = `<span class="relative flex h-2 w-2 mr-0.5">
        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
        <span class="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
      </span>
      <svg class="w-3.5 h-3.5 text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M14.88 16.29L13 18.17V13.83l1.88 2.46M13 10.17V5.83l1.88 2.46L13 10.17m4.71-3.88c-.39-.39-1.02-.39-1.41 0L13.41 9.17l-.41-.42V3a1 1 0 00-1.71-.71L7.29 6.29a1.003 1.003 0 000 1.41l4 4-4 4a1.003 1.003 0 000 1.41l4 4c.39.39 1.02.39 1.41 0l4-4a.996.996 0 000-1.41L13.41 12l3.29-3.29c.4-.4.4-1.03.01-1.42z"/>
      </svg>`;
    }
  } else if (status.isWired) {
    // Wired headphones
    badge.className = 'flex items-center gap-1.5 text-xs font-semibold bg-sky-950/60 border border-sky-500/50 text-sky-300 px-3 py-1 rounded-full shadow-sm transition-all cursor-pointer select-none';
    label.textContent = isPt ? 'Fones Ligados' : 'Wired Earbuds';
    badge.title = isPt ? 'Auscultadores com fio ligados' : 'Wired earbuds connected';
    if (icon) {
      icon.innerHTML = `<svg class="w-3.5 h-3.5 text-sky-400" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 3a9 9 0 00-9 9v7c0 1.1.9 2 2 2h3a1 1 0 001-1v-5a1 1 0 00-1-1H5v-2a7 7 0 1114 0v2h-3a1 1 0 00-1 1v5a1 1 0 001 1h3c1.1 0 2-.9 2-2v-7a9 9 0 00-9-9z"/>
      </svg>`;
    }
  }
}

function showAudioStatusToast() {
  const lang = config.language || 'pt-PT';
  const isPt = lang === 'pt-PT';
  let msg = '';
  if (currentAudioStatus && currentAudioStatus.isBluetooth) {
    const name = currentAudioStatus.deviceName ? currentAudioStatus.deviceName : (isPt ? 'Auriculares Bluetooth' : 'Bluetooth Earbuds');
    msg = isPt
      ? `🎧 Ligado a: ${name}. O áudio e avisos de glicémia serão ouvidos nos fones com música atenuada.`
      : `🎧 Connected to: ${name}. Glucose announcements play directly in earbuds with music ducking.`;
  } else if (currentAudioStatus && currentAudioStatus.isWired) {
    msg = isPt
      ? '🎧 Fones com fio ligados. O áudio será reproduzido nos auscultadores.'
      : '🎧 Wired earbuds connected. Audio will play through headphones.';
  } else {
    msg = isPt
      ? '📱 Altifalante ativo. Nenhum fone detetado. Liga os teus auscultadores Bluetooth para correr.'
      : '📱 Phone speaker active. No Bluetooth earbuds detected. Connect Bluetooth earbuds for running.';
  }

  const toast = document.createElement('div');
  toast.className = 'fixed top-16 left-1/2 -translate-x-1/2 max-w-[90vw] bg-slate-900/95 text-slate-100 border border-slate-700 px-4 py-2.5 rounded-2xl text-xs font-medium shadow-2xl z-50 transition-opacity duration-300 backdrop-blur leading-relaxed text-center';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

function checkInitialAudioOutput() {
  if (window.AndroidVoice && typeof window.AndroidVoice.getAudioOutputStatus === 'function') {
    try {
      const raw = window.AndroidVoice.getAudioOutputStatus();
      if (raw) {
        const info = JSON.parse(raw);
        updateBluetoothStatusBadge(info);
        return;
      }
    } catch (e) {
      console.warn('getAudioOutputStatus error:', e);
    }
  }
  updateBluetoothStatusBadge({ connected: false, isBluetooth: false, isWired: false, deviceName: '' });
}

window._onAudioOutputUpdate = updateBluetoothStatusBadge;


// ==========================================
// TREINO DE GINÁSIO (100% MÁQUINAS) & INTERVALS.ICU
// ==========================================

let activeMainTab = 'running'; // 'running' | 'gym'
let gymSchedule = [];
let currentGymIndex = 0;
let currentGymWorkout = null;
let gymRestTimerInterval = null;
let gymRestSeconds = 60;

const MACHINE_METADATA = {
  'leg press': {
    icon: '🦵',
    target: 'Quadríceps & Glúteos',
    equipment: 'Prensa 45° ou Horizontal',
    tip: 'Pés alinhados à largura dos ombros no meio da base. Desce em 3 segundos controlados até os joelhos formarem 90°. NUNCA bloquear/estalar os joelhos no topo para proteger articulações.'
  },
  'seated leg curl': {
    icon: '🦵',
    target: 'Isquiotibiais (Posterior da Coxa)',
    equipment: 'Máquina Flexora Sentada',
    tip: 'Alinha a rotação do joelho com o eixo da máquina. Almofada logo acima do calcanhar/tendão de Aquiles. Contrai firme 1 segundo no fundo e controla o retorno em 2-3 segundos.'
  },
  'flexora': {
    icon: '🦵',
    target: 'Isquiotibiais & Proteção do Joelho',
    equipment: 'Máquina Flexora',
    tip: 'O posterior da coxa é o travão natural na passada de corrida. Mantém a bacia estável no assento sem arquear a lombar.'
  },
  'hip abductor': {
    icon: '🍑',
    target: 'Glúteo Médio & Estabilidade Pélvica',
    equipment: 'Máquina Abdutora Sentada',
    tip: 'Costas bem apoiadas. Abre os joelhos contra a resistência e faz pausa de 1 segundo em abertura máxima. Previne a queda da anca e o joelho de corredor (IT band syndrome).'
  },
  'abdutora': {
    icon: '🍑',
    target: 'Glúteo Médio & Estabilidade Pélvica',
    equipment: 'Máquina Abdutora',
    tip: 'Abre com força mantendo os pés relaxados. Foca a força nos glúteos laterais.'
  },
  'seated cable row': {
    icon: '🚣',
    target: 'Dorsais, Rombóides & Postura',
    equipment: 'Máquina de Remo Sentado / Polia',
    tip: 'Peito alto e ombros encaixados para trás e para baixo. Puxa os cotovelos junto ao tronco, aperta as omoplatas 1 segundo e volta devagar. Mantém a postura aberta na corrida longa.'
  },
  'remo': {
    icon: '🚣',
    target: 'Costas & Postura de Corrida',
    equipment: 'Máquina de Remo Sentado',
    tip: 'Não deites o tronco para trás no final da puxada. Mantém o core firme e os ombros relaxados (longe das orelhas).'
  },
  'puxada': {
    icon: '🏋️',
    target: 'Costas & Grande Dorsal',
    equipment: 'Lat Pulldown / Puxada Alta',
    tip: 'Puxa a barra em direção à parte superior do peito. Não puxes atrás da nuca.'
  },
  'seated calf raise': {
    icon: '🦶',
    target: 'Solear & Tendão de Aquiles',
    equipment: 'Máquina Gémeos Sentado ou Prensa',
    tip: 'Desce ao ponto mais fundo e faz uma PAUSA OBRIGATÓRIA de 2 segundos para eliminar a energia elástica. Sobe na ponta dos pés. O solear absorve até 8x o peso corporal em cada passada!'
  },
  'gémeos': {
    icon: '🦶',
    target: 'Solear, Gastrocnémio & Aquiles',
    equipment: 'Máquina de Gémeos',
    tip: 'A pausa no ponto baixo é indispensável para criar tendões de aço e evitar fascite plantar e tendinites de Aquiles.'
  },
  'leg extension': {
    icon: '🦵',
    target: 'Quadríceps & Tendão Rotuliano',
    equipment: 'Máquina Extensora Sentada',
    tip: 'Extensão suave até quase 180° sem esticar abruptamente. Segura 1 segundo no topo sentindo o vasto medial (músculo acima do joelho). Baixa em 3 segundos.'
  },
  'extensora': {
    icon: '🦵',
    target: 'Quadríceps & Vasto Medial',
    equipment: 'Máquina Extensora',
    tip: 'Fortalecimento do vasto medial para centrar a patela no sulco femoral e prevenir dores no joelho anterior.'
  },
  'seated ab crunch': {
    icon: '🎯',
    target: 'Reto Abdominal & Core Central',
    equipment: 'Máquina Crunch Abdominal',
    tip: 'Expira todo o ar ao enrolar a coluna para a frente, apertando o abdómen com força máxima. Não puxes com os braços nem com a cabeça. Core estável = passada económica.'
  },
  'rotary torso': {
    icon: '🔄',
    target: 'Oblíquos & Estabilidade Rotacional',
    equipment: 'Máquina Torso Rotary Sentada',
    tip: 'Fixa as ancas nas almofadas. Roda lentamente o tronco usando apenas os músculos abdominais laterais. Segura 1 segundo e volta ao centro com controlo.'
  },
  'back extension': {
    icon: '🛡️',
    target: 'Lombar & Cadeia Posterior',
    equipment: 'Máquina Extensão Lombar Sentada',
    tip: 'Apoia a almofada na zona dorsal média. Empurra com a força lombar mantendo o peito direito. Não hiperextendas a coluna para além da linha natural.'
  }
};

function getMachineMeta(name) {
  const lower = (name || '').toLowerCase();
  for (const [key, meta] of Object.entries(MACHINE_METADATA)) {
    if (lower.includes(key)) return meta;
  }
  return {
    icon: '🏋️',
    target: 'Músculos Estabilizadores',
    equipment: 'Máquina Guiada Selectorizada',
    tip: 'Execução controlada: 2 segundos a subir, 1 segundo de contração isométrica, 3 segundos a descer. Respiração fluida: expira no esforço, inspira no retorno.'
  };
}

function playBeepSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.15);
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.35);
  } catch (e) {
    console.warn('Beep audio error:', e);
  }
}

function startGymRestTimer(duration = 60) {
  clearInterval(gymRestTimerInterval);
  gymRestSeconds = duration;
  const timerText = document.getElementById('restTimerText');
  const btnStart = document.getElementById('btnStartRestTimer');
  const btnReset = document.getElementById('btnResetRestTimer');

  if (btnReset) btnReset.classList.remove('hidden');
  if (btnStart) btnStart.textContent = 'Reiniciar 60s';

  const updateDisplay = () => {
    if (!timerText) return;
    if (gymRestSeconds > 0) {
      timerText.textContent = `${gymRestSeconds}s restantes`;
      timerText.className = 'text-base font-black text-amber-400 font-mono tabular-nums animate-pulse';
    } else {
      clearInterval(gymRestTimerInterval);
      gymRestTimerInterval = null;
      timerText.textContent = 'Tempo esgotado! Próxima série 💪';
      timerText.className = 'text-base font-black text-emerald-400 font-mono tabular-nums';
      if (btnReset) btnReset.classList.add('hidden');
      if (btnStart) btnStart.textContent = 'Descansar 60s';
      playBeepSound();
      try {
        if (config.language === 'pt-PT') {
          playStudioVoice('Descanso terminado! Próxima série.');
        } else {
          playStudioVoice('Rest finished! Next set.');
        }
      } catch (e) {}
    }
  };

  updateDisplay();
  gymRestTimerInterval = setInterval(() => {
    gymRestSeconds--;
    updateDisplay();
  }, 1000);
}

function resetGymRestTimer() {
  clearInterval(gymRestTimerInterval);
  gymRestTimerInterval = null;
  gymRestSeconds = 60;
  const timerText = document.getElementById('restTimerText');
  const btnStart = document.getElementById('btnStartRestTimer');
  const btnReset = document.getElementById('btnResetRestTimer');
  if (timerText) {
    timerText.textContent = 'Pronto (60s)';
    timerText.className = 'text-base font-black text-white font-mono tabular-nums';
  }
  if (btnReset) btnReset.classList.add('hidden');
  if (btnStart) btnStart.textContent = 'Descansar 60s';
}

function switchMainTab(tab) {
  activeMainTab = tab === 'gym' ? 'gym' : 'running';
  try { localStorage.setItem('runner_main_tab', activeMainTab); } catch (e) {}

  const tabBtnRunning = document.getElementById('tabBtnRunning');
  const tabBtnGym = document.getElementById('tabBtnGym');
  const runningView = document.getElementById('runningView');
  const gymView = document.getElementById('gymView');

  if (activeMainTab === 'gym') {
    if (runningView) runningView.classList.add('hidden');
    if (gymView) gymView.classList.remove('hidden');

    if (tabBtnGym) {
      tabBtnGym.className = 'flex-1 py-1.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition bg-amber-500 text-slate-950 shadow-md cursor-pointer';
    }
    if (tabBtnRunning) {
      tabBtnRunning.className = 'flex-1 py-1.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer';
    }

    if (gymSchedule.length === 0) {
      loadGymSchedule();
    }
  } else {
    if (gymView) gymView.classList.add('hidden');
    if (runningView) runningView.classList.remove('hidden');

    if (tabBtnRunning) {
      tabBtnRunning.className = 'flex-1 py-1.5 px-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition bg-sky-500 text-white shadow-md cursor-pointer';
    }
    if (tabBtnGym) {
      tabBtnGym.className = 'flex-1 py-1.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition text-slate-400 hover:text-white hover:bg-slate-800/60 cursor-pointer';
    }
  }
}

async function loadGymSchedule(targetDate = null, forceRefresh = false) {
  const container = document.getElementById('gymExercisesList');
  if (!container) return;

  if (gymSchedule.length === 0) {
    container.innerHTML = `
      <div class="py-12 text-center text-slate-400 space-y-2">
        <div class="inline-block animate-spin text-2xl">⏳</div>
        <p class="text-xs font-semibold">A carregar sessões de ginásio do Intervals.icu...</p>
      </div>
    `;
  }

  try {
    const bust = forceRefresh ? `&_t=${Date.now()}` : '';
    const res = await fetch(`/api/intervals/gym?listAll=true${bust}`);
    if (!res.ok) throw new Error('Falha ao comunicar com Intervals.icu');
    const data = await res.json();
    if (!data.workouts || data.workouts.length === 0) {
      container.innerHTML = `<div class="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-center text-xs text-slate-400">Nenhum treino de ginásio encontrado no Intervals.icu.</div>`;
      return;
    }

    gymSchedule = (data.workouts || []).map(w => ({
      id: w.id,
      date: w.date,
      title: w.name || w.title || 'Treino Ginásio',
      name: w.name || w.title || 'Treino Ginásio',
      movingTime: w.movingTime || 2700,
      warmup: w.warmup || (w.parsed && w.parsed.warmup) || '5-6 min Bicicleta Indoor ou Elítica (suave)',
      tandemNotes: w.tandemNotes || (w.parsed && w.parsed.tandemNotes) || 'A musculação em máquinas mantém a glicémia estável ou sobe ligeiramente pela adrenalina. Evitar bolus agressivos.',
      parsedExercises: w.parsedExercises || (w.parsed && w.parsed.exercises) || []
    }));

    // Populate Select
    const select = document.getElementById('gymSessionSelect');
    if (select) {
      select.innerHTML = '';
      gymSchedule.forEach((w, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        const dParts = w.date.split('-');
        const dObj = new Date(parseInt(dParts[0], 10), parseInt(dParts[1], 10) - 1, parseInt(dParts[2], 10));
        const formattedDate = dObj.toLocaleDateString('pt-PT', { day: 'numeric', month: 'short' });
        opt.textContent = `${w.title} (${formattedDate})`;
        select.appendChild(opt);
      });
    }

    // Determine target workout
    let targetIdx = 0;
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (targetDate) {
      const idx = gymSchedule.findIndex(w => w.date === targetDate);
      if (idx !== -1) targetIdx = idx;
    } else {
      const upcomingIdx = gymSchedule.findIndex(w => w.date >= todayStr);
      if (upcomingIdx !== -1) targetIdx = upcomingIdx;
    }

    currentGymIndex = targetIdx;
    if (select) select.selectedIndex = currentGymIndex;
    renderGymWorkout(gymSchedule[currentGymIndex]);

  } catch (err) {
    console.error('loadGymSchedule error:', err);
    container.innerHTML = `
      <div class="p-4 bg-rose-950/40 border border-rose-800/60 rounded-2xl text-center text-xs text-rose-300 space-y-2">
        <p>⚠️ Não foi possível carregar os treinos do ginásio.</p>
        <button id="btnRetryGymSchedule" type="button" class="px-3 py-1 bg-rose-900/60 hover:bg-rose-800 border border-rose-700 rounded-xl text-rose-200 text-xs font-bold transition">Tentar novamente</button>
      </div>
    `;
    document.getElementById('btnRetryGymSchedule')?.addEventListener('click', () => loadGymSchedule(null, true));
  }
}

function renderGymWorkout(workout) {
  if (!workout) return;
  currentGymWorkout = workout;

  // Title & Date
  const titleEl = document.getElementById('gymSessionTitle');
  const dateLabelEl = document.getElementById('gymSessionDateLabel');
  if (titleEl) titleEl.textContent = workout.title || 'Treino de Ginásio';
  if (dateLabelEl && workout.date) {
    const parts = workout.date.split('-');
    const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    const dayName = d.toLocaleDateString('pt-PT', { weekday: 'long' });
    const formattedDate = d.toLocaleDateString('pt-PT', { day: 'numeric', month: 'long', year: 'numeric' });
    dateLabelEl.textContent = `${dayName.charAt(0).toUpperCase() + dayName.slice(1)}, ${formattedDate}`;
  }

  // Warmup & Tandem Notes
  const warmupEl = document.getElementById('gymWarmupText');
  if (warmupEl) {
    warmupEl.textContent = workout.warmup || '5-6 min Bicicleta Indoor suave (preparar articulações e circulação)';
  }
  const tandemEl = document.getElementById('gymTandemNotesText');
  if (tandemEl) {
    tandemEl.textContent = workout.tandemNotes || 'A musculação em máquinas mantém a glicémia estável ou sobe ligeiramente pela adrenalina. Evitar bolus agressivos durante a sessão.';
  }

  // Render Exercises List
  const container = document.getElementById('gymExercisesList');
  if (!container) return;

  const exercises = workout.parsedExercises || [];
  if (exercises.length === 0) {
    container.innerHTML = `<div class="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-center text-xs text-slate-400">Sem exercícios detalhados para esta data.</div>`;
    return;
  }

  let totalSessionSets = 0;
  exercises.forEach(ex => {
    totalSessionSets += (ex.sets || 3);
  });

  let html = `
    <div class="flex items-center justify-between px-1 text-[11px] font-semibold text-slate-400">
      <span class="flex items-center gap-1.5">
        <span class="text-amber-400">🏋️</span>
        <span>${exercises.length} Exercícios Guiados</span>
      </span>
      <span id="gymSessionSetCounter" class="font-mono text-amber-400">-- / ${totalSessionSets} séries</span>
    </div>
  `;

  exercises.forEach((ex, exIdx) => {
    const meta = getMachineMeta(ex.name);
    const setsCount = ex.sets || 3;
    const repsStr = ex.reps ? `${ex.reps} reps` : '10-12 reps';
    const restStr = ex.rest || '60s';

    // Build sets checkboxes
    let setsHtml = '';
    for (let s = 1; s <= setsCount; s++) {
      const setKey = `gym_set_${workout.date}_${exIdx}_${s}`;
      const isDone = localStorage.getItem(setKey) === '1';
      const activeClass = isDone
        ? 'bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold shadow-sm shadow-emerald-500/20'
        : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700 font-bold';

      setsHtml += `
        <button type="button"
          data-ex-idx="${exIdx}"
          data-set-num="${s}"
          data-total-sets="${totalSessionSets}"
          class="gym-set-btn flex-1 py-1.5 px-1 rounded-xl border text-xs flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer ${activeClass}">
          <span>${isDone ? '✓' : ''} S${s}</span>
        </button>
      `;
    }

    html += `
      <div class="rounded-2xl bg-slate-900/90 border border-slate-800 p-3 space-y-2.5 shadow-md">
        <!-- Exercise Top Info -->
        <div class="flex items-start justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span class="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 font-extrabold text-xs flex items-center justify-center shrink-0">
              ${ex.num || exIdx + 1}
            </span>
            <div class="min-w-0">
              <h3 class="text-xs sm:text-sm font-extrabold text-white truncate leading-tight">${ex.name}</h3>
              <p class="text-[10px] text-slate-400 truncate flex items-center gap-1">
                <span>${meta.icon}</span> <span>${meta.target}</span>
              </p>
            </div>
          </div>
          <span class="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-950 border border-slate-800 text-amber-400 shrink-0">
            ${meta.equipment}
          </span>
        </div>

        <!-- Prescription Badges -->
        <div class="flex items-center gap-1.5 text-[11px] font-mono bg-slate-950/60 px-2.5 py-1.5 rounded-xl border border-slate-800/80 justify-between">
          <span class="text-slate-300 font-bold">📋 ${setsCount} séries × ${repsStr}</span>
          <span class="text-amber-400 font-bold flex items-center gap-1">
            <span>⏱️</span> <span>Descanso ${restStr}</span>
          </span>
        </div>

        <!-- Polished Form & Posture Cue ("Instrução Catita") -->
        <div class="bg-amber-950/20 border border-amber-900/40 rounded-xl p-2 text-[11px] text-amber-200/90 leading-snug">
          <p class="font-bold text-[10px] uppercase tracking-wider text-amber-400 mb-0.5">💡 Postura & Execução de Corredor:</p>
          <p>${ex.notes ? ex.notes + ' • ' : ''}${meta.tip}</p>
        </div>

        <!-- Interactive Sets Tracker -->
        <div class="space-y-1 pt-0.5">
          <div class="flex items-center justify-between text-[10px] text-slate-400 px-0.5 font-semibold">
            <span>Séries Concluídas:</span>
            <span class="text-slate-400 text-[10px]">Toca após cada série (inicia 60s)</span>
          </div>
          <div class="flex items-center gap-1.5">
            ${setsHtml}
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Bind click handlers to set buttons
  container.querySelectorAll('.gym-set-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const b = e.currentTarget;
      const exIdx = b.getAttribute('data-ex-idx');
      const setNum = b.getAttribute('data-set-num');
      const totalSets = parseInt(b.getAttribute('data-total-sets'), 10) || totalSessionSets;
      toggleGymSet(workout.date, exIdx, setNum, b, totalSets);
    });
  });

  updateSessionProgress(workout.date, totalSessionSets);
}

function toggleGymSet(workoutDate, exIdx, setNum, btnElement, totalSets) {
  const setKey = `gym_set_${workoutDate}_${exIdx}_${setNum}`;
  const currentState = localStorage.getItem(setKey) === '1';
  const newState = !currentState;

  if (newState) {
    localStorage.setItem(setKey, '1');
    btnElement.className = 'gym-set-btn flex-1 py-1.5 px-1 rounded-xl border text-xs flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer bg-emerald-500 text-slate-950 border-emerald-400 font-extrabold shadow-sm shadow-emerald-500/20';
    btnElement.innerHTML = `<span>✓ S${setNum}</span>`;
    // Trigger 60s rest timer
    startGymRestTimer(60);
  } else {
    localStorage.removeItem(setKey);
    btnElement.className = 'gym-set-btn flex-1 py-1.5 px-1 rounded-xl border text-xs flex items-center justify-center gap-1 transition active:scale-95 cursor-pointer bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700 font-bold';
    btnElement.innerHTML = `<span>S${setNum}</span>`;
  }

  updateSessionProgress(workoutDate, totalSets);
}

function updateSessionProgress(workoutDate, totalSets) {
  const counterEl = document.getElementById('gymSessionSetCounter');
  if (!counterEl) return;

  let completed = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(`gym_set_${workoutDate}_`)) {
      if (localStorage.getItem(key) === '1') completed++;
    }
  }

  counterEl.textContent = `${completed} / ${totalSets} séries`;
  if (completed === totalSets && totalSets > 0) {
    counterEl.className = 'font-mono text-emerald-400 font-bold';
  } else {
    counterEl.className = 'font-mono text-amber-400 font-bold';
  }
}


window.addEventListener('DOMContentLoaded', () => {
  function updateNativeVersionDisplay() {
    const nativeEl = document.getElementById('settingsNativeVersion');
    if (!nativeEl) return;
    if (window.AndroidVoice && typeof window.AndroidVoice.getNativeVersionName === 'function') {
      try {
        const vName = window.AndroidVoice.getNativeVersionName();
        nativeEl.textContent = `Android APK v${vName}`;
      } catch (e) {
        nativeEl.textContent = 'Android APK (Nativo)';
      }
    } else if (isRunningNative()) {
      nativeEl.textContent = 'Android APK (Nativo)';
    } else {
      nativeEl.textContent = 'Navegador Web';
    }
  }

  // Show brief Live OTA toast notification on startup
  function showLiveToast() {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-16 left-1/2 -translate-x-1/2 bg-slate-900/95 text-emerald-400 border border-emerald-500/40 px-3.5 py-1.5 rounded-full text-xs font-mono shadow-2xl flex items-center gap-2 z-50 transition-opacity duration-500 backdrop-blur';
    toast.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span><span>● Ligado ao Servidor (Live OTA v${CHANGELOG_DATA.versionName})</span>`;
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 600);
    }, 3500);
  }
  setTimeout(showLiveToast, 800);

  setTimeout(checkAppVersion, 2500);
      loadConfig();
    applyLanguageUI();
    updateCountdownDisplay();
    // Main View Navigation (Corrida vs Ginásio)
    document.getElementById('tabBtnRunning')?.addEventListener('click', () => switchMainTab('running'));
    document.getElementById('tabBtnGym')?.addEventListener('click', () => switchMainTab('gym'));

    // Gym Session navigation
    document.getElementById('btnGymPrev')?.addEventListener('click', () => {
      if (currentGymIndex > 0) {
        currentGymIndex--;
        const sel = document.getElementById('gymSessionSelect');
        if (sel) sel.selectedIndex = currentGymIndex;
        renderGymWorkout(gymSchedule[currentGymIndex]);
      }
    });
    document.getElementById('btnGymNext')?.addEventListener('click', () => {
      if (currentGymIndex < gymSchedule.length - 1) {
        currentGymIndex++;
        const sel = document.getElementById('gymSessionSelect');
        if (sel) sel.selectedIndex = currentGymIndex;
        renderGymWorkout(gymSchedule[currentGymIndex]);
      }
    });
    document.getElementById('gymSessionSelect')?.addEventListener('change', (e) => {
      currentGymIndex = parseInt(e.target.value, 10) || 0;
      renderGymWorkout(gymSchedule[currentGymIndex]);
    });
    document.getElementById('btnGymRefresh')?.addEventListener('click', () => {
      const curDate = currentGymWorkout ? currentGymWorkout.date : null;
      loadGymSchedule(curDate, true);
    });

    // Gym Rest Timer
    document.getElementById('btnStartRestTimer')?.addEventListener('click', () => startGymRestTimer(60));
    document.getElementById('btnResetRestTimer')?.addEventListener('click', () => resetGymRestTimer());

    // Visual Infographics Toggle Accordion
    document.getElementById('btnToggleGymImages')?.addEventListener('click', () => {
      const c = document.getElementById('gymImagesContainer');
      const arrow = document.getElementById('gymImagesToggleArrow');
      if (c) {
        c.classList.toggle('hidden');
        if (arrow) {
          arrow.style.transform = c.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
        }
      }
    });

    // Restore active main tab (default: running)
    const savedTab = localStorage.getItem('runner_main_tab') || 'running';
    switchMainTab(savedTab);

    updateNativeVersionDisplay();
    checkInitialAudioOutput();
    document.getElementById('audioStatusBadge')?.addEventListener('click', () => {
      checkInitialAudioOutput();
      showAudioStatusToast();
    });
    document.getElementById('btnSettingsDownloadApk')?.addEventListener('click', () => {
      const apkUrl = 'https://runner.gatoescondido.com/nightscout-runner.apk?v=14';
      if (window.AndroidVoice && typeof window.AndroidVoice.openDownloadUrl === 'function') {
        window.AndroidVoice.openDownloadUrl(apkUrl);
      } else {
        window.location.href = apkUrl;
      }
    });
    // Profile buttons
    document.getElementById('profZone2')?.addEventListener('click', () => setWorkoutProfile('zone2'));
    document.getElementById('profHIIT')?.addEventListener('click', () => setWorkoutProfile('hiit'));
    document.getElementById('profWalk')?.addEventListener('click', () => setWorkoutProfile('walk'));
    updateProfileButtonsUI();

    // Session Mode (Corrida vs Dia a Dia)
    document.getElementById('btnModeRunning')?.addEventListener('click', () => setSessionMode('running'));
    document.getElementById('btnModeDaily')?.addEventListener('click', () => setSessionMode('daily'));
    setSessionMode(currentSessionMode);
    checkLatestPumpBolus();

    // Quick Carb Intake & Voice
    updateCarbButtonUI();
    document.getElementById('btnQuickGel')?.addEventListener('click', () => recordCarbsIntake(20, 'button'));
    document.getElementById('btnVoiceCommand')?.addEventListener('click', startVoiceListening);
    document.getElementById('btnCancelVoice')?.addEventListener('click', stopVoiceListening);
    document.getElementById('btnCustomCarb')?.addEventListener('click', openCustomCarbModal);
    document.getElementById('btnCancelCustomCarb')?.addEventListener('click', closeCustomCarbModal);

    document.querySelectorAll('.carb-choice').forEach(b => {
      b.addEventListener('click', (e) => {
        const grams = parseInt(e.currentTarget.getAttribute('data-grams'), 10) || 20;
        recordCarbsIntake(grams, 'custom_picker');
        closeCustomCarbModal();
      });
    });

    // Workout Summary modal
    document.getElementById('btnCloseSummary')?.addEventListener('click', closeWorkoutSummaryModal);
    document.getElementById('btnDismissSummary')?.addEventListener('click', closeWorkoutSummaryModal);

    // Sync settings voice checkboxes
    const vOpts = config.voiceOptions || {};
    const setChk = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.checked = (val !== false);
    };
    setChk('cfgOptSgv', vOpts.sgv);
    setChk('cfgOptTrend', vOpts.trend);
    setChk('cfgOptDelta', vOpts.delta);
    setChk('cfgOptCoach', vOpts.coach);
    setChk('cfgOptDuration', !!vOpts.duration);
    setChk('cfgOptHeartRate', vOpts.heartRate !== false);

    const maxHrInput = document.getElementById('cfgMaxHr');
    if (maxHrInput) maxHrInput.value = config.maxHr || 185;

    document.getElementById('hrStatusBadge')?.addEventListener('click', triggerHeartRateConnect);
    document.getElementById('btnConnectHrSettings')?.addEventListener('click', triggerHeartRateConnect);
    document.getElementById('heartRateQuickBar')?.addEventListener('click', triggerHeartRateConnect);
    document.getElementById('btnQuickConnectHr')?.addEventListener('click', (e) => {
      e.stopPropagation();
      triggerHeartRateConnect();
    });

  const nsInput = document.getElementById('cfgNsUrl');
  const intervalSelect = document.getElementById('cfgInterval');
  const targetMin = document.getElementById('cfgTargetMin');
  const targetMax = document.getElementById('cfgTargetMax');
  const langSelect = document.getElementById('cfgLanguage');

  if (nsInput) nsInput.value = config.nsUrl;
  if (intervalSelect) intervalSelect.value = String(config.intervalMinutes);
  if (targetMin) targetMin.value = config.targetMin;
  if (targetMax) targetMax.value = config.targetMax;
  if (langSelect) langSelect.value = config.language;

  document.getElementById('btnToggleLang')?.addEventListener('click', toggleLanguage);
  document.getElementById('btnStartWorkout')?.addEventListener('click', () => startWorkout());
  document.getElementById('btnStopWorkout')?.addEventListener('click', () => stopWorkout(false));
  document.getElementById('btnTestAudio')?.addEventListener('click', () => {
    if (config.language === 'pt-PT') {
      playStudioVoice("Teste de áudio: Glicémia cento e vinte e oito, estável. Ritmo ideal para corrida, não precisas de hidratos de carbono.");
    } else {
      playStudioVoice("Audio test: Blood glucose 128, steady. Target zone for running, no carbs needed.");
    }
  });
  document.getElementById('btnAnnounceNow')?.addEventListener('click', () => announceCurrent(true));

  // Settings Modal
  const settingsModal = document.getElementById('settingsModal');
  document.getElementById('btnOpenSettings')?.addEventListener('click', () => {
    updateNativeVersionDisplay();
    settingsModal.classList.remove('hidden');
  });
  document.getElementById('btnCloseSettings')?.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });
  document.getElementById('btnSaveSettings')?.addEventListener('click', () => {
    config.nsUrl = document.getElementById('cfgNsUrl').value.trim() || defaultConfig.nsUrl;
    config.intervalMinutes = parseInt(document.getElementById('cfgInterval').value, 10) || 2;
    config.language = document.getElementById('cfgLanguage').value || 'en';
    config.targetMin = parseInt(document.getElementById('cfgTargetMin').value, 10) || 110;
    config.targetMax = parseInt(document.getElementById('cfgTargetMax').value, 10) || 170;
    config.maxHr = parseInt(document.getElementById('cfgMaxHr')?.value, 10) || 185;
    config.voiceOptions = {
      sgv: !!document.getElementById('cfgOptSgv')?.checked,
      trend: !!document.getElementById('cfgOptTrend')?.checked,
      delta: !!document.getElementById('cfgOptDelta')?.checked,
      coach: !!document.getElementById('cfgOptCoach')?.checked,
      duration: !!document.getElementById('cfgOptDuration')?.checked,
      heartRate: !!document.getElementById('cfgOptHeartRate')?.checked
    };
    saveConfig();
    applyLanguageUI();
    updateCountdownDisplay();
    // Main View Navigation (Corrida vs Ginásio)
    document.getElementById('tabBtnRunning')?.addEventListener('click', () => switchMainTab('running'));
    document.getElementById('tabBtnGym')?.addEventListener('click', () => switchMainTab('gym'));

    // Gym Session navigation
    document.getElementById('btnGymPrev')?.addEventListener('click', () => {
      if (currentGymIndex > 0) {
        currentGymIndex--;
        const sel = document.getElementById('gymSessionSelect');
        if (sel) sel.selectedIndex = currentGymIndex;
        renderGymWorkout(gymSchedule[currentGymIndex]);
      }
    });
    document.getElementById('btnGymNext')?.addEventListener('click', () => {
      if (currentGymIndex < gymSchedule.length - 1) {
        currentGymIndex++;
        const sel = document.getElementById('gymSessionSelect');
        if (sel) sel.selectedIndex = currentGymIndex;
        renderGymWorkout(gymSchedule[currentGymIndex]);
      }
    });
    document.getElementById('gymSessionSelect')?.addEventListener('change', (e) => {
      currentGymIndex = parseInt(e.target.value, 10) || 0;
      renderGymWorkout(gymSchedule[currentGymIndex]);
    });
    document.getElementById('btnGymRefresh')?.addEventListener('click', () => {
      const curDate = currentGymWorkout ? currentGymWorkout.date : null;
      loadGymSchedule(curDate, true);
    });

    // Gym Rest Timer
    document.getElementById('btnStartRestTimer')?.addEventListener('click', () => startGymRestTimer(60));
    document.getElementById('btnResetRestTimer')?.addEventListener('click', () => resetGymRestTimer());

    // Visual Infographics Toggle Accordion
    document.getElementById('btnToggleGymImages')?.addEventListener('click', () => {
      const c = document.getElementById('gymImagesContainer');
      const arrow = document.getElementById('gymImagesToggleArrow');
      if (c) {
        c.classList.toggle('hidden');
        if (arrow) {
          arrow.style.transform = c.classList.contains('hidden') ? 'rotate(0deg)' : 'rotate(180deg)';
        }
      }
    });

    // Restore active main tab (default: running)
    const savedTab = localStorage.getItem('runner_main_tab') || 'running';
    switchMainTab(savedTab);

    settingsModal.classList.add('hidden');

    if (isRunning) {
      lastAnnouncementTimestamp = Date.now();
      clearInterval(timerId);
      timerId = setInterval(() => {
        performPollAndAnnouncement(false);
        resetCountdown();
      }, config.intervalMinutes * 60 * 1000);
      resetCountdown();
    }
  });

  // What's New Modal listeners
  document.getElementById('btnFooterWhatsNew')?.addEventListener('click', () => openWhatsNewModal());
  document.getElementById('btnSettingsWhatsNew')?.addEventListener('click', () => {
    settingsModal.classList.add('hidden');
    openWhatsNewModal();
  });
  document.getElementById('btnCloseWhatsNew')?.addEventListener('click', closeWhatsNewModal);
  document.getElementById('btnDismissWhatsNew')?.addEventListener('click', closeWhatsNewModal);
  document.getElementById('whatsNewModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'whatsNewModal') closeWhatsNewModal();
  });

  // Heart Rate Modal listeners
  document.getElementById('btnCloseHrModal')?.addEventListener('click', closeHeartRateModal);
  document.getElementById('btnDismissHrModal')?.addEventListener('click', closeHeartRateModal);
  document.getElementById('btnRefreshHrScan')?.addEventListener('click', startHeartRateScanFromUI);
  document.getElementById('btnDisconnectHr')?.addEventListener('click', disconnectHeartRateDevice);
  document.getElementById('heartRateModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'heartRateModal') closeHeartRateModal();
  });

  // Automatically show What's New notification on launch if the user hasn't seen this version yet
  const lastSeen = localStorage.getItem('runner_last_seen_version_code');
  if (!lastSeen || parseInt(lastSeen, 10) < CHANGELOG_DATA.versionCode) {
    setTimeout(() => {
      openWhatsNewModal();
    }, 1200);
  }

  // Initial fetch on page load
  performPollAndAnnouncement(false);

  // Auto-discover and connect to HUAWEI WATCH on app launch
  if (isRunningNative()) {
    setTimeout(() => {
      if (!isHeartRateConnected) {
        console.log('[HeartRate] Auto-starting background BLE scan for Huawei Watch on launch');
        if (window.AndroidVoice && typeof window.AndroidVoice.startHeartRateScan === 'function') {
          window.AndroidVoice.startHeartRateScan();
        }
      }
    }, 1500);
  }

  // Update visual audio engine badge (Native vs Web)
  function updateAudioEngineDisplay() {
    const badge = document.getElementById('audioEngineBadge');
    if (!badge) return;
    const isNative = isRunningNative();
    if (isNative) {
      badge.textContent = '⚡ Nativo';
      badge.className = 'whitespace-nowrap text-[10px] px-2 py-0.5 rounded-full font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/40 leading-none';
    } else {
      badge.textContent = '🌐 Web';
      badge.className = 'whitespace-nowrap text-[10px] px-2 py-0.5 rounded-full font-bold bg-slate-800 text-slate-400 border border-slate-700 leading-none';
    }
  }

  updateAudioEngineDisplay();

  setTimeout(updateAudioEngineDisplay, 1000);
  setTimeout(updateAudioEngineDisplay, 3000);

  // Clean up any stale service workers or caches from previous sessions
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(regs => {
      for (const r of regs) r.unregister();
    });
  }
  if ('caches' in window) {
    caches.keys().then(keys => {
      for (const k of keys) caches.delete(k);
    });
  }
});
