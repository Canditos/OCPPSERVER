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
  voiceOptions: {
    sgv: true,
    trend: true,
    delta: true,
    coach: true,
    duration: false
  }
};

// Workout Session Analytics Tracking
let sessionStartTime = null;
let sessionReadings = [];
let sessionCarbsTotal = 0;
let sessionCarbsEntries = [];
let lastCarbIntake = null;

let config = { ...defaultConfig };

// State
let isRunning = false;
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
  const payload = {
    intervalMinutes: config.intervalMinutes || 2,
    language: config.language || 'pt-PT',
    apiBase: API_BASE,
    targetMin: config.targetMin || 110,
    targetMax: config.targetMax || 170
  };
  if (window.AndroidVoice && typeof window.AndroidVoice.startWorkoutService === 'function') {
    try {
      window.AndroidVoice.startWorkoutService(
        payload.intervalMinutes,
        payload.language,
        payload.apiBase,
        payload.targetMin,
        payload.targetMax
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

function onHeartbeatTick() {
  const now = Date.now();
  if (now - lastHeartbeatProcessTime < 400) return;
  lastHeartbeatProcessTime = now;

  if (!isRunning) return;

  // 1. Duration display
  updateWorkoutDuration();

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
      coachTitle: 'Carb Coach Recommendation',
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
      footerTip: '💡 During a run, use your earbud button or gesture to hear glucose anytime.',
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
      coachTitle: 'Recomendação de Hidratos (HC)',
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
      footerTip: '💡 Durante a corrida podes usar o botão dos auriculares para ouvir a glicémia a qualquer momento.',
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

function recordCarbsIntake(grams, source = 'manual') {
  const g = parseInt(grams, 10) || 20;
  sessionCarbsTotal += g;
  const now = Date.now();
  const entry = { timestamp: now, grams: g, source };
  sessionCarbsEntries.push(entry);
  lastCarbIntake = entry;

  const lang = config.language || 'pt-PT';
  const isPt = lang === 'pt-PT';

  const msg = isPt
    ? `Registei ${g} gramas de hidratos. Boa corrida!`
    : `Recorded ${g} grams of carbs. Keep running strong!`;

  if (typeof playStudioVoice === 'function') {
    playStudioVoice(msg);
  }

  const toast = document.createElement('div');
  toast.className = 'fixed top-16 left-1/2 -translate-x-1/2 max-w-[90vw] bg-amber-950/95 text-amber-200 border border-amber-500/50 px-4 py-2.5 rounded-2xl text-xs font-bold shadow-2xl z-50 transition-opacity duration-300 backdrop-blur text-center flex items-center gap-2';
  toast.innerHTML = `<span>🍬</span><span>${isPt ? `Registo efetuado: ${g}g de hidratos!` : `Logged: ${g}g of carbs!`}</span>`;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 4000);

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
      el.className = 'profile-btn flex-1 py-1.5 px-2 rounded-xl font-bold text-[11px] text-center transition flex items-center justify-center gap-1 bg-sky-500 text-white shadow-sm cursor-pointer';
    } else {
      el.className = 'profile-btn flex-1 py-1.5 px-2 rounded-xl font-medium text-[11px] text-slate-400 hover:text-white text-center transition flex items-center justify-center gap-1 cursor-pointer';
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

  modal.classList.remove('hidden');
}

function closeWorkoutSummaryModal() {
  document.getElementById('workoutSummaryModal')?.classList.add('hidden');
}

function evaluateCarbAdvice(sgv, direction, delta) {
  const lang = config.language || 'en';
  const dirKey = direction || 'Flat';
  const dirInfo = I18N[lang]?.directions[dirKey] || I18N[lang]?.directions.Flat;
  const dirSpoken = dirInfo.spoken;

  const isDroppingFast = dirKey === 'SingleDown' || dirKey === 'DoubleDown' || (delta !== null && delta <= -6);
  const isDroppingSlow = dirKey === 'FortyFiveDown' || (delta !== null && delta < -2 && delta > -6);
  const isDropping = isDroppingFast || isDroppingSlow;
  // 1. Carb Absorption Window (Prevent repeat gel recommendations within 15 min)
  if (lastCarbIntake && (Date.now() - lastCarbIntake.timestamp) < 15 * 60 * 1000) {
    const minsAgo = Math.max(1, Math.round((Date.now() - lastCarbIntake.timestamp) / 60000));
    if (sgv < (config.targetMin || 110)) {
      if (lang === 'pt-PT') {
        return {
          status: 'absorbing',
          badge: `⏳ EM ABSORÇÃO (${lastCarbIntake.grams}g há ${minsAgo}m)`,
          badgeColor: 'bg-amber-600 text-white animate-pulse',
          cardBorder: 'border-amber-500 shadow-amber-900/40',
          carbs: `Aguardar (${lastCarbIntake.grams}g)`,
          title: 'Hidratos em absorção',
          adviceText: `Tomaste ${lastCarbIntake.grams}g há ${minsAgo}m. A digestão demora 10 a 15 min. Aguarda pela subida da glicémia.`,
          spokenText: `Glicémia a ${sgv}, ${dirSpoken}. Hidratos em absorção, tomaste ${lastCarbIntake.grams} gramas há ${minsAgo} minutos. Aguarda pela subida.`
        };
      } else {
        return {
          status: 'absorbing',
          badge: `⏳ ABSORBING (${lastCarbIntake.grams}g ${minsAgo}m ago)`,
          badgeColor: 'bg-amber-600 text-white animate-pulse',
          cardBorder: 'border-amber-500 shadow-amber-900/40',
          carbs: `Wait (${lastCarbIntake.grams}g)`,
          title: 'Carbs absorbing',
          adviceText: `You took ${lastCarbIntake.grams}g ${minsAgo}m ago. Takes 10-15m to absorb. Wait for the rise.`,
          spokenText: `Blood glucose at ${sgv}, ${dirSpoken}. Carbs absorbing, you took ${lastCarbIntake.grams} grams ${minsAgo} minutes ago. Waiting for rise.`
        };
      }
    }
  }

  // 2. Predictive Hypoglycemia Alert (15 minutes advance warning)
  if (delta !== null && delta <= -5 && sgv <= 135) {
    const dropPerMin = Math.abs(delta) / 5.0;
    const minutesTo70 = Math.round((sgv - 70) / dropPerMin);
    if (minutesTo70 > 0 && minutesTo70 <= 15) {
      if (lang === 'pt-PT') {
        return {
          status: 'predictive_hypo',
          badge: `🚨 HIPO EM ~${minutesTo70} MIN`,
          badgeColor: 'bg-rose-600 text-white animate-pulse',
          cardBorder: 'border-rose-500 shadow-rose-900/60',
          carbs: '15g a 20g HC Imediatos',
          title: 'Alerta Preditivo: Risco de Hipo',
          adviceText: `Queda rápida de ${Math.abs(delta)} mg/dL em 5m. Ao ritmo atual chegas a 70 mg/dL em aproximadamente ${minutesTo70} minutos.`,
          spokenText: `Atenção urgente! Queda rápida. Risco de hipoglicémia dentro de ${minutesTo70} minutos. Toma 15 a 20 gramas de hidratos agora!`
        };
      } else {
        return {
          status: 'predictive_hypo',
          badge: `🚨 HYPO IN ~${minutesTo70} MIN`,
          badgeColor: 'bg-rose-600 text-white animate-pulse',
          cardBorder: 'border-rose-500 shadow-rose-900/60',
          carbs: '15g to 20g Fast Carbs',
          title: 'Predictive Alert: Hypo Risk Ahead',
          adviceText: `Fast drop of ${Math.abs(delta)} mg/dL in 5m. Projected to hit 70 mg/dL in about ${minutesTo70} minutes.`,
          spokenText: `Urgent warning! Rapid drop. Risk of hypoglycemia in ${minutesTo70} minutes. Take 15 to 20 grams of carbs now!`
        };
      }
    }
  }

  if (lang === 'pt-PT') {
    // PORTUGUÊS DE PORTUGAL
    if (sgv < config.urgentLow) {
      return {
        status: 'urgent',
        badge: '🚨 HIPOGLICÉMIA',
        badgeColor: 'bg-red-600 text-white animate-pulse',
        cardBorder: 'border-red-500 shadow-red-900/50',
        carbs: '15g a 20g HC rápidos',
        title: 'Pára a corrida e ingere 15g a 20g de hidratos rápidos',
        adviceText: 'Glicémia perigosa durante esforço. Pára ou caminha agora. Toma 1 gel ou açúcar.',
        spokenText: `Atenção urgente! Glicémia perigosamente baixa a ${sgv}. Pára a corrida e consome quinze a vinte gramas de hidratos de absorção rápida já.`
      };
    }
    if (sgv >= config.urgentLow && sgv < 95) {
      if (isDropping) {
        return {
          status: 'urgent',
          badge: '⚠️ AVISO DE DESCIDA',
          badgeColor: 'bg-orange-600 text-white animate-pulse',
          cardBorder: 'border-orange-500 shadow-orange-900/40',
          carbs: '15g HC rápidos',
          title: 'Ingerir 15g de hidratos rápidos já',
          adviceText: 'Glicémia baixa e a cair. Toma 1 gel imediatamente para travar a descida.',
          spokenText: `Aviso. Glicémia a ${sgv}, ${dirSpoken}. Consome quinze gramas de hidratos de absorção rápida imediatamente.`
        };
      }
      return {
        status: 'warning',
        badge: '⚠️ LIMIAR INFERIOR',
        badgeColor: 'bg-amber-500 text-gray-900',
        cardBorder: 'border-amber-500 shadow-amber-900/30',
        carbs: '10g a 15g HC',
        title: 'Ingerir 10g a 15g de hidratos',
        adviceText: 'Glicémia no limite inferior para corrida. Consome 10 a 15g para manter energia.',
        spokenText: `Glicémia a ${sgv}, no limiar inferior. Consome dez a quinze gramas de hidratos de carbono.`
      };
    }
    if (sgv >= 95 && sgv < 120) {
      if (isDroppingFast) {
        return {
          status: 'warning',
          badge: '⚠️ QUEDA RÁPIDA',
          badgeColor: 'bg-amber-600 text-white',
          cardBorder: 'border-amber-500 shadow-amber-900/30',
          carbs: '15g HC',
          title: 'Queda rápida: Toma 15g de hidratos',
          adviceText: 'Queda acentuada. Antecipa antes de descer abaixo de 80.',
          spokenText: `Glicémia a ${sgv}, ${dirSpoken}. Toma quinze gramas de hidratos para travar a descida.`
        };
      }
      if (isDroppingSlow) {
        return {
          status: 'warning',
          badge: 'ℹ️ DESCIDA SUAVE',
          badgeColor: 'bg-yellow-500 text-gray-900',
          cardBorder: 'border-yellow-500 shadow-yellow-900/20',
          carbs: '10g HC',
          title: 'Toma 10g de hidratos ou meio gel',
          adviceText: 'A descer suavemente. 10g mantêm a glicémia estável.',
          spokenText: `Glicémia a ${sgv}, ${dirSpoken}. Sugiro dez gramas de hidratos.`
        };
      }
      return {
        status: 'ideal',
        badge: '✅ ACEITÁVEL',
        badgeColor: 'bg-emerald-600 text-white',
        cardBorder: 'border-emerald-500 shadow-emerald-900/30',
        carbs: '5g a 10g HC (opcional)',
        title: 'Estável: mantém o ritmo',
        adviceText: 'Valor aceitável. Se o treino for longo, podes ingerir 5 a 10g de hidratos.',
        spokenText: `Glicémia a ${sgv}, estável. Valor aceitável. Se o treino for longo, podes ingerir cinco a dez gramas de hidratos de carbono.`
      };
    }
    if (sgv >= 120 && sgv <= config.targetMax) {
      if (isDroppingFast) {
        return {
          status: 'warning',
          badge: '⚠️ QUEDA ACENTUADA',
          badgeColor: 'bg-yellow-500 text-gray-900',
          cardBorder: 'border-yellow-500 shadow-yellow-900/20',
          carbs: '10g HC preventivos',
          title: 'Glicémia boa mas a cair rápido',
          adviceText: 'Estás em boa faixa, mas previne a descida com 10g de hidratos.',
          spokenText: `Glicémia a ${sgv}, boa mas a cair rápido. Toma dez gramas de hidratos preventivos.`
        };
      }
      return {
        status: 'ideal',
        badge: '🎯 ZONA IDEAL',
        badgeColor: 'bg-emerald-500 text-white',
        cardBorder: 'border-emerald-500 shadow-emerald-900/30',
        carbs: 'Sem hidratos necessários',
        title: 'Zona ideal para corrida: Continua sem hidratos',
        adviceText: 'Glicémia perfeita para treino aeróbico com boa margem de segurança.',
        spokenText: `Glicémia a ${sgv}, ${dirSpoken}. Zona ideal para correr. Não precisas de hidratos.`
      };
    }
    if (sgv > config.targetMax && sgv <= 230) {
      return {
        status: 'high',
        badge: 'ℹ️ ELEVADA',
        badgeColor: 'bg-purple-600 text-white',
        cardBorder: 'border-purple-500 shadow-purple-900/30',
        carbs: 'Sem hidratos + Água',
        title: 'Elevada: Bebe água e não consumas hidratos',
        adviceText: 'Glicémia alta. Hidrata-te bem com água e acompanha a evolução.',
        spokenText: `Glicémia a ${sgv}, ${dirSpoken}. Bebe água, não precisas de hidratos.`
      };
    }
    return {
      status: 'high',
      badge: '⚠️ MUITO ELEVADA',
      badgeColor: 'bg-rose-700 text-white',
      cardBorder: 'border-rose-500 shadow-rose-900/40',
      carbs: 'Sem hidratos + Hidratação',
      title: 'Muito elevada: Modera o ritmo e bebe água',
      adviceText: 'Atenção ao esforço intenso com glicémia elevada. Hidratação abundante.',
      spokenText: `Atenção. Glicémia muito alta a ${sgv}. Modera o ritmo, bebe água e evita hidratos.`
    };
  }

  // ENGLISH DEFAULT
  if (sgv < config.urgentLow) {
    return {
      status: 'urgent',
      badge: '🚨 HYPOGLYCEMIA',
      badgeColor: 'bg-red-600 text-white animate-pulse',
      cardBorder: 'border-red-500 shadow-red-900/50',
      carbs: '15-20g fast carbs',
      title: 'Stop running now and take 15 to 20g fast carbs',
      adviceText: 'Critical low during running. Stop or walk immediately. Take 1 gel or dextrose.',
      spokenText: `Urgent alert! Blood glucose critical at ${sgv}. Stop running and take 15 to 20 grams of fast-acting carbs now.`
    };
  }
  if (sgv >= config.urgentLow && sgv < 95) {
    if (isDropping) {
      return {
        status: 'urgent',
        badge: '⚠️ FALLING LOW',
        badgeColor: 'bg-orange-600 text-white animate-pulse',
        cardBorder: 'border-orange-500 shadow-orange-900/40',
        carbs: '15g fast carbs',
        title: 'Take 15g fast carbs immediately',
        adviceText: 'Low and falling during exercise. Take 1 gel now to prevent hypoglycemia.',
        spokenText: `Warning. Blood glucose at ${sgv}, ${dirSpoken}. Take 15 grams of fast carbs immediately.`
      };
    }
    return {
      status: 'warning',
      badge: '⚠️ BORDERLINE LOW',
      badgeColor: 'bg-amber-500 text-gray-900',
      cardBorder: 'border-amber-500 shadow-amber-900/30',
      carbs: '10-15g carbs',
      title: 'Take 10 to 15g carbs',
      adviceText: 'Lower margin for running. Take 10-15g carbs to maintain energy.',
      spokenText: `Blood glucose at ${sgv}, borderline low. Take 10 to 15 grams of carbs.`
    };
  }
  if (sgv >= 95 && sgv < 120) {
    if (isDroppingFast) {
      return {
        status: 'warning',
        badge: '⚠️ RAPID DROP',
        badgeColor: 'bg-amber-600 text-white',
        cardBorder: 'border-amber-500 shadow-amber-900/30',
        carbs: '15g carbs',
        title: 'Rapid drop: Take 15g carbs',
        adviceText: 'Sharp drop. Anticipate before dropping below 80.',
        spokenText: `Blood glucose at ${sgv}, ${dirSpoken}. Take 15 grams of carbs to stop the drop.`
      };
    }
    if (isDroppingSlow) {
      return {
        status: 'warning',
        badge: 'ℹ️ SLOW DROP',
        badgeColor: 'bg-yellow-500 text-gray-900',
        cardBorder: 'border-yellow-500 shadow-yellow-900/20',
        carbs: '10g carbs',
        title: 'Take 10g carbs or half gel',
        adviceText: 'Gradual drop. Half an energy gel keeps your glucose steady.',
        spokenText: `Blood glucose at ${sgv}, ${dirSpoken}. Suggesting 10 grams of carbs or half a gel.`
      };
    }
    return {
      status: 'ideal',
      badge: '✅ ACCEPTABLE',
      badgeColor: 'bg-emerald-600 text-white',
      cardBorder: 'border-emerald-500 shadow-emerald-900/30',
      carbs: '5-10g carbs (optional)',
      title: 'Steady: Keep your pace',
      adviceText: 'Good level. If your run is longer than 45 min, consider light carbs.',
      spokenText: `Blood glucose at ${sgv}, steady. Acceptable level. If your run is long, you can take 5 to 10 grams of carbs.`
    };
  }
  if (sgv >= 120 && sgv <= config.targetMax) {
    if (isDroppingFast) {
      return {
        status: 'warning',
        badge: '⚠️ SHARP DROP',
        badgeColor: 'bg-yellow-500 text-gray-900',
        cardBorder: 'border-yellow-500 shadow-yellow-900/20',
        carbs: '10g preventive carbs',
        title: 'Good glucose but dropping quickly',
        adviceText: 'Good range, but take 10g preventive carbs for safety.',
        spokenText: `Blood glucose at ${sgv}, but dropping fast. Take 10 grams of preventive carbs.`
      };
    }
    return {
      status: 'ideal',
      badge: '🎯 TARGET ZONE',
      badgeColor: 'bg-emerald-500 text-white',
      cardBorder: 'border-emerald-500 shadow-emerald-900/30',
      carbs: 'No carbs needed',
      title: 'Target running zone: No carbs needed',
      adviceText: 'Perfect aerobic range with great safety margin.',
      spokenText: `Blood glucose at ${sgv}, ${dirSpoken}. Target zone for running, no carbs needed.`
    };
  }
  if (sgv > config.targetMax && sgv <= 230) {
    return {
      status: 'high',
      badge: 'ℹ️ ELEVATED',
      badgeColor: 'bg-purple-600 text-white',
      cardBorder: 'border-purple-500 shadow-purple-900/30',
      carbs: 'No carbs + Water',
      title: 'Elevated: Drink water, avoid carbs',
      adviceText: 'High for exercise. Stay well hydrated with water.',
      spokenText: `Blood glucose elevated at ${sgv}, ${dirSpoken}. Drink water, no carbs needed.`
    };
  }
  return {
    status: 'high',
    badge: '⚠️ VERY HIGH',
    badgeColor: 'bg-rose-700 text-white',
    cardBorder: 'border-rose-500 shadow-rose-900/40',
    carbs: 'No carbs + Hydration',
    title: 'Very high: Ease pace and hydrate',
    adviceText: 'Watch for dehydration and high exertion. Avoid carbs.',
    spokenText: `Warning: Blood glucose very high at ${sgv}. Ease your pace, drink water and avoid carbs.`
  };
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
  if (lang === 'pt-PT') {
    return `Iniciar Treino (Voz a cada ${m} min)`;
  }
  return `Start Workout (Voice every ${m} min)`;
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
    footerWhatsNew.innerHTML = isPt ? '<span>✨ O que há de novo (v1.6)</span>' : "<span>✨ What's New (v1.6)</span>";
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
    adviceBadge.className = `px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider ${advice.badgeColor}`;
  }
  if (adviceCarbs) adviceCarbs.textContent = advice.carbs;
  if (adviceTitle) adviceTitle.textContent = advice.title;
  if (adviceDesc) adviceDesc.textContent = advice.adviceText;

  if (mainCard) {
    mainCard.className = `relative overflow-hidden rounded-3xl bg-slate-900/90 border-2 p-6 backdrop-blur-xl transition-all duration-300 shadow-2xl ${advice.cardBorder}`;
  }
}

// Workout Management
async function startWorkout() {
  isRunning = true;
  workoutStartTime = Date.now();
  sessionStartTime = Date.now();
  sessionReadings = [];
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
  isRunning = false;
  if (workoutIntervalId) clearInterval(workoutIntervalId);
  if (timerId) clearInterval(timerId);
  if (countdownTimerId) clearInterval(countdownTimerId);

  if (!fromNative) {
    triggerNativeForegroundStop();
  }

  if (currentAudioPlayer) {
    currentAudioPlayer.pause();
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

  if (sessionReadings.length > 0 || sessionStartTime) {
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
  versionCode: 7,
  versionName: '1.6',
  'pt-PT': {
    title: 'O que há de novo',
    sub: 'Versão 1.6 • Atualização de Elite',
    btnDismiss: 'Entendido, Vamos Correr! 🏃‍♂️',
    features: [
      {
        icon: '🎙️',
        title: 'Comando de Voz & Registo de Gel',
        desc: 'Diz "Tomei gel" ou clica no botão rápido para registar 20g HC. O treinador faz pausa inteligente para não mandar tomar outro gel enquanto absorve.'
      },
      {
        icon: '🚨',
        title: 'Alerta Preditivo de Hipo a 15 Minutos',
        desc: 'Aviso sonoro e urgente antecipado com tempo estimado até atingir 70 mg/dL.'
      },
      {
        icon: '🎧',
        title: 'Atalho no Botão dos Auscultadores',
        desc: 'Carrega no botão dos teus fones Bluetooth (passar faixa) para ouvir a glicémia sob demanda a qualquer momento.'
      },
      {
        icon: '🏃‍♂️',
        title: 'Perfis de Treino & Resumo Final',
        desc: 'Perfis Longo (130-170), Séries (110-150) e Caminhada (90-140), com relatório final e % Tempo no Alvo ao parar.'
      }
    ]
  },
  'en': {
    title: "What's New",
    sub: 'Version 1.6 • Elite Update',
    btnDismiss: "Got it, Let's Run! 🏃‍♂️",
    features: [
      {
        icon: '🎙️',
        title: 'Voice Commands & Gel Logging',
        desc: 'Say "Took gel" or tap the quick button to log 20g carbs. Intelligent cooldown avoids repeat alerts during digestion.'
      },
      {
        icon: '🚨',
        title: '15-Minute Predictive Hypo Warning',
        desc: 'Advance audio alarm with estimated time until reaching 70 mg/dL during rapid drops.'
      },
      {
        icon: '🎧',
        title: 'Earbud Button Shortcut',
        desc: 'Press your Bluetooth earbud button to hear glucose on-demand anytime while running.'
      },
      {
        icon: '🏃‍♂️',
        title: 'Workout Profiles & Final Summary',
        desc: 'Long Run, Intervals, and Walk profiles, plus post-workout report with % Time In Range.'
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

    // Check if user already dismissed or installed this version in this session
    const dismissed = sessionStorage.getItem('runner_dismissed_update_version');
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
      sessionStorage.setItem('runner_dismissed_update_version', String(data.versionCode));
      banner.remove();
    });
  }

  const btn = banner.querySelector('#btnDoUpdate');
  if (btn) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      localStorage.setItem('runner_installed_version_code', String(data.versionCode));
      sessionStorage.setItem('runner_dismissed_update_version', String(data.versionCode));
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

window.addEventListener('DOMContentLoaded', () => {
  // Show brief Live OTA toast notification on startup
  function showLiveToast() {
    const toast = document.createElement('div');
    toast.className = 'fixed bottom-16 left-1/2 -translate-x-1/2 bg-slate-900/95 text-emerald-400 border border-emerald-500/40 px-3.5 py-1.5 rounded-full text-xs font-mono shadow-2xl flex items-center gap-2 z-50 transition-opacity duration-500 backdrop-blur';
    toast.innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span><span>● Ligado ao Servidor (Live OTA v1.4)</span>';
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
    checkInitialAudioOutput();
    document.getElementById('audioStatusBadge')?.addEventListener('click', showAudioStatusToast);
    // Profile buttons
    document.getElementById('profZone2')?.addEventListener('click', () => setWorkoutProfile('zone2'));
    document.getElementById('profHIIT')?.addEventListener('click', () => setWorkoutProfile('hiit'));
    document.getElementById('profWalk')?.addEventListener('click', () => setWorkoutProfile('walk'));
    updateProfileButtonsUI();

    // Quick Carb Intake & Voice
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
  document.getElementById('btnStartWorkout')?.addEventListener('click', startWorkout);
  document.getElementById('btnStopWorkout')?.addEventListener('click', stopWorkout);
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
    saveConfig();
    applyLanguageUI();
    updateCountdownDisplay();
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

  // Automatically show What's New notification on launch if the user hasn't seen this version yet
  const lastSeen = localStorage.getItem('runner_last_seen_version_code');
  if (!lastSeen || parseInt(lastSeen, 10) < CHANGELOG_DATA.versionCode) {
    setTimeout(() => {
      openWhatsNewModal();
    }, 1200);
  }

  // Initial fetch on page load
  performPollAndAnnouncement(false);

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
