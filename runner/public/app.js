// Nightscout Audio Runner & Sports Carb Coach
// Dynamic Dual-Language Edition: English (EN) and Português (PT-PT)

// Detect if running inside native Android APK (Capacitor/localhost)
const isNativeApp = window.location.origin.includes('localhost') || 
                    window.location.protocol === 'capacitor:' || 
                    window.location.protocol === 'file:';
const API_BASE = isNativeApp ? 'https://runner.gatoescondido.com' : '';
const NativeVoice = (window.Capacitor && window.Capacitor.registerPlugin) ? window.Capacitor.registerPlugin('VoiceAudio') : null;

const CONFIG_KEY = 'ns_runner_config_v4';

const defaultConfig = {
  nsUrl: 'https://diabetes.gatoescondido.com',
  intervalMinutes: 2,
  language: 'en', // 'en' or 'pt-PT'
  targetMin: 110,
  targetMax: 170,
  urgentLow: 75,
  wakeLockEnabled: true,
  enableEarbudShortcuts: false // Keep disabled so background music apps (Yuma, Spotify) keep earbud controls
};

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

// Background Keep-Alive State
let lastAnnouncementTimestamp = Date.now();
let lastHeartbeatProcessTime = 0;
let silentAudioElement = null;
let backgroundTimerWorker = null;

// Native Android Foreground Service integration (Capacitor & Android JavascriptInterface)
function triggerNativeForegroundStart() {
  if (NativeVoice && typeof NativeVoice.startWorkout === 'function') {
    NativeVoice.startWorkout().catch(e => console.warn('NativeVoice.startWorkout error:', e));
  } else if (window.AndroidVoice && typeof window.AndroidVoice.startWorkoutService === 'function') {
    try { window.AndroidVoice.startWorkoutService(); } catch (e) { console.warn('AndroidVoice.startWorkoutService error:', e); }
  }
}

function triggerNativeForegroundStop() {
  if (NativeVoice && typeof NativeVoice.stopWorkout === 'function') {
    NativeVoice.stopWorkout().catch(e => console.warn('NativeVoice.stopWorkout error:', e));
  } else if (window.AndroidVoice && typeof window.AndroidVoice.stopWorkoutService === 'function') {
    try { window.AndroidVoice.stopWorkoutService(); } catch (e) { console.warn('AndroidVoice.stopWorkoutService error:', e); }
  }
}

// 1-second silent WAV data URI for continuous audio session keep-alive
const SILENT_AUDIO_URI = 'data:audio/wav;base64,UklGRjIAAABXQVZFZm10IBIAAAABAAEAQB8AAEAfAAABAAgAAABmYWN0BAAAAAAAAABkYXRhEQAAAP///////////////////w==';

function startSilentAudioKeepAlive() {
  try {
    if (!silentAudioElement) {
      silentAudioElement = new Audio(SILENT_AUDIO_URI);
      silentAudioElement.loop = true;
      silentAudioElement.volume = 0.001; // inaudible to avoid interfering with music
      silentAudioElement.setAttribute('playsinline', 'true');
      silentAudioElement.setAttribute('webkit-playsinline', 'true');
    }

    silentAudioElement.ontimeupdate = () => {
      if (isRunning) {
        onHeartbeatTick();
      }
    };

    silentAudioElement.play().catch(e => {
      console.warn('Silent audio keep-alive play warning:', e);
    });
  } catch (e) {
    console.warn('Failed to start silent audio keep-alive:', e);
  }
}

function stopSilentAudioKeepAlive() {
  if (silentAudioElement) {
    try {
      silentAudioElement.pause();
      silentAudioElement.currentTime = 0;
    } catch (e) {}
  }
}

function startBackgroundWorker() {
  if (window.Worker) {
    try {
      if (backgroundTimerWorker) {
        try { backgroundTimerWorker.terminate(); } catch (e) {}
      }
      const workerCode = 'let t = null; self.onmessage = function(e) { if (e.data === "start") { if (t) clearInterval(t); t = setInterval(function() { self.postMessage("tick"); }, 1000); } else if (e.data === "stop") { if (t) clearInterval(t); t = null; } };';
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      backgroundTimerWorker = new Worker(URL.createObjectURL(blob));
      backgroundTimerWorker.onmessage = (e) => {
        if (e.data === 'tick' && isRunning) {
          onHeartbeatTick();
        }
      };
      backgroundTimerWorker.postMessage('start');
    } catch (e) {
      console.warn('Web Worker creation failed:', e);
    }
  }
}

function stopBackgroundWorker() {
  if (backgroundTimerWorker) {
    try {
      backgroundTimerWorker.postMessage('stop');
      backgroundTimerWorker.terminate();
    } catch (e) {}
    backgroundTimerWorker = null;
  }
}

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
    performPollAndAnnouncement(false);
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
      footerTip: '💡 On your Google Pixel, double-tap or skip track on your Bluetooth earbuds to hear your glucose reading anytime.',
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
      footerTip: '💡 No Google Pixel podes usar o botão dos phones (mudar de faixa) para ouvir a glicémia a qualquer momento.',
      settingsTitle: 'Definições da Corrida',
      labelLangSetting: 'Língua da Voz e da App',
      labelNsUrl: 'Endereço Nightscout',
      labelInterval: 'Intervalo de Anúncio por Voz',
      btnSaveSettings: 'Guardar Definições'
    }
  }
};

// Sports Carb Coach Decision Engine
function evaluateCarbAdvice(sgv, direction, delta) {
  const lang = config.language || 'en';
  const dirKey = direction || 'Flat';
  const dirInfo = I18N[lang]?.directions[dirKey] || I18N[lang]?.directions.Flat;
  const dirSpoken = dirInfo.spoken;

  const isDroppingFast = dirKey === 'SingleDown' || dirKey === 'DoubleDown' || (delta !== null && delta <= -6);
  const isDroppingSlow = dirKey === 'FortyFiveDown' || (delta !== null && delta < -2 && delta > -6);
  const isDropping = isDroppingFast || isDroppingSlow;

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
  const audioUrl = `${API_BASE}/api/tts?text=${encodeURIComponent(cleanText)}&lang=${encodeURIComponent(lang)}`;

  // 1. Capacitor Plugin (non-exclusive sonification overlay — Yuma/Spotify keep playing)
  if (NativeVoice) {
    NativeVoice.play({ url: audioUrl })
      .then(() => { if (pulseEl) pulseEl.classList.add('hidden'); })
      .catch(e => {
        console.warn('NativeVoice plugin error, trying web fallback:', e);
        fallbackWebAudio(audioUrl, pulseEl);
      });
    return;
  }

  // 2. AndroidVoice JavascriptInterface fallback
  if (window.AndroidVoice && typeof window.AndroidVoice.playVoice === 'function') {
    try {
      window.AndroidVoice.playVoice(audioUrl);
      window._onNativeVoiceDone = () => { if (pulseEl) pulseEl.classList.add('hidden'); };
      setTimeout(() => { if (pulseEl) pulseEl.classList.add('hidden'); }, 12000);
      return;
    } catch (e) {
      console.warn('AndroidVoice failed, falling back:', e);
    }
  }

  // 3. Web Audio fallback
  fallbackWebAudio(audioUrl, pulseEl);
}

function fallbackWebAudio(audioUrl, pulseEl) {
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
    if (pulseEl) pulseEl.classList.add('hidden');
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
  setT('labelBluetooth', texts.bluetooth);
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

  const startBtn = document.getElementById('startBtnText');
  if (startBtn) startBtn.textContent = texts.startBtn;
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
}

// Toggle language
function toggleLanguage() {
  config.language = config.language === 'en' ? 'pt-PT' : 'en';
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
async function performPollAndAnnouncement(isManualTrigger = false) {
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

    if (isRunning || isManualTrigger) {
      announcementCount++;
      const countEl = document.getElementById('announcementCount');
      if (countEl) countEl.textContent = announcementCount;
      playStudioVoice(advice.spokenText);
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
  lastAnnouncementTimestamp = Date.now();
  announcementCount = 0;
  const countEl = document.getElementById('announcementCount');
  if (countEl) countEl.textContent = '0';

  // 1. Start Native Android Foreground Service (for APK background execution)
  triggerNativeForegroundStart();

  // 2. Start Web Keep-Alive (Silent Audio Loop + Web Worker)
  startSilentAudioKeepAlive();
  startBackgroundWorker();

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

  // Immediate poll and announce
  await performPollAndAnnouncement(false);
  lastAnnouncementTimestamp = Date.now();
  secondsRemaining = (config.intervalMinutes || 2) * 60;
  updateCountdownDisplay();
}

function stopWorkout() {
  isRunning = false;
  if (workoutIntervalId) clearInterval(workoutIntervalId);
  if (timerId) clearInterval(timerId);
  if (countdownTimerId) clearInterval(countdownTimerId);

  triggerNativeForegroundStop();
  stopSilentAudioKeepAlive();
  stopBackgroundWorker();

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
  document.getElementById('countdownText').textContent = '—';
}

function resetCountdown() {
  lastAnnouncementTimestamp = Date.now();
  secondsRemaining = (config.intervalMinutes || 2) * 60;
  updateCountdownDisplay();
}

function updateCountdownDisplay() {
  const mins = Math.floor(secondsRemaining / 60);
  const secs = secondsRemaining % 60;
  const str = `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  const el = document.getElementById('countdownText');
  if (el) el.textContent = str;
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
  if (forceFetch || !lastEntry) {
    performPollAndAnnouncement(true);
  } else {
    const delta = prevEntry ? lastEntry.sgv - prevEntry.sgv : null;
    const advice = evaluateCarbAdvice(lastEntry.sgv, lastEntry.direction, delta);
    playStudioVoice(advice.spokenText);
  }
}

// App Initialization
window.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  applyLanguageUI();

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

  // Initial fetch on page load
  performPollAndAnnouncement(false);

  // Update visual audio engine badge (Native vs Web)
  function updateAudioEngineDisplay() {
    const badge = document.getElementById('audioEngineBadge');
    if (!badge) return;
    const isNative = (window.Capacitor && (window.Capacitor.isNativePlatform() || window.Capacitor.platform === 'android')) ||
                     (window.AndroidVoice && typeof window.AndroidVoice.playVoice === 'function');
    if (isNative) {
      badge.textContent = '⚡ Nativo (Música OK)';
      badge.className = 'text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/40';
    } else {
      badge.textContent = '🌐 Modo Web';
      badge.className = 'text-[9px] px-1.5 py-0.5 rounded font-mono font-bold bg-slate-800 text-slate-400';
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
