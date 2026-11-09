// Nightscout Audio Runner & Sports Carb Coach (English Edition)
// Studio-Quality Voice via Bluetooth with zero cuts and zero noise

const CONFIG_KEY = 'ns_runner_config_en_v1';

const defaultConfig = {
  nsUrl: 'https://diabetes.gatoescondido.com',
  intervalMinutes: 2,
  language: 'en',
  targetMin: 110,
  targetMax: 170,
  urgentLow: 75,
  wakeLockEnabled: true
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

// Direction translations and symbols
const DIRECTIONS = {
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
};

// Sports Carb Coach Decision Engine
function evaluateCarbAdvice(sgv, direction, delta) {
  const dirKey = direction || 'Flat';
  const dirInfo = DIRECTIONS[dirKey] || DIRECTIONS.Flat;
  const dirSpoken = dirInfo.spoken;

  const isDroppingFast = dirKey === 'SingleDown' || dirKey === 'DoubleDown' || (delta !== null && delta <= -6);
  const isDroppingSlow = dirKey === 'FortyFiveDown' || (delta !== null && delta < -2 && delta > -6);
  const isDropping = isDroppingFast || isDroppingSlow;

  // < 75 mg/dL: Urgent Hypo
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

  // 75 to 95 mg/dL: Low Borderline
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

  // 95 to 120 mg/dL: Moderate / Anticipate
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
      spokenText: `Blood glucose at ${sgv}, steady. Pace is good. Carbs optional.`
    };
  }

  // 120 to 170 mg/dL: Target Aerobic Zone
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

  // 171 to 230 mg/dL: High
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

  // > 230 mg/dL: Very High
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

// Studio Voice Audio Playback via Server TTS (Zero Cuts, High Quality)
function playStudioVoice(spokenText) {
  const pulseEl = document.getElementById('audioPulseIndicator');
  if (pulseEl) pulseEl.classList.remove('hidden');

  if (currentAudioPlayer) {
    currentAudioPlayer.pause();
    currentAudioPlayer = null;
  }

  const cleanText = spokenText.replace(/⇈|↑|↗|→|↘|↓|⇊|—|\?/g, '').trim();
  const audioUrl = `/api/tts?text=${encodeURIComponent(cleanText)}&lang=en`;

  const audio = new Audio(audioUrl);
  currentAudioPlayer = audio;

  audio.onended = () => {
    if (pulseEl) pulseEl.classList.add('hidden');
    currentAudioPlayer = null;
  };

  audio.onerror = (e) => {
    console.warn('Audio stream error, falling back to WebSpeech', e);
    if (pulseEl) pulseEl.classList.add('hidden');
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(cleanText);
      u.lang = 'en-US';
      window.speechSynthesis.speak(u);
    }
  };

  audio.play().catch(err => {
    console.warn('Audio play prevented', err);
    if (pulseEl) pulseEl.classList.add('hidden');
  });
}

// Media Session Setup (Android Lock Screen & Earbud Button controls)
function updateMediaSession(sgv, direction, carbAdvice) {
  if (!('mediaSession' in navigator)) return;

  const dirInfo = DIRECTIONS[direction || 'Flat'] || DIRECTIONS.Flat;
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

// Fetch Nightscout Readings via Server Proxy
async function fetchNightscoutEntries() {
  const endpointsToTry = [
    '/api/entries',
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
  const seconds = Math.floor((new Date() - new Date(date)) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
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
    if (readingTime) readingTime.textContent = 'Connection error';
  }
}

function updateUIWithReading(current, previous, delta, advice) {
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
    const dirInfo = DIRECTIONS[current.direction] || DIRECTIONS.NONE;
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
  announcementCount = 0;
  document.getElementById('announcementCount').textContent = '0';

  if (config.wakeLockEnabled && 'wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
    } catch (e) {
      console.warn('Wake Lock failed', e);
    }
  }

  document.getElementById('btnStartWorkout').classList.add('hidden');
  document.getElementById('btnStopWorkout').classList.remove('hidden');
  document.getElementById('workoutStatusBadge').className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 flex items-center gap-1.5';
  document.getElementById('workoutStatusBadge').innerHTML = '<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> Workout Active';

  workoutIntervalId = setInterval(updateWorkoutDuration, 1000);

  // Immediate poll and announce
  await performPollAndAnnouncement(false);

  // Interval loop
  resetCountdown();
  timerId = setInterval(() => {
    performPollAndAnnouncement(false);
    resetCountdown();
  }, config.intervalMinutes * 60 * 1000);
}

function stopWorkout() {
  isRunning = false;
  if (timerId) clearInterval(timerId);
  if (countdownTimerId) clearInterval(countdownTimerId);
  if (workoutIntervalId) clearInterval(workoutIntervalId);

  if (currentAudioPlayer) {
    currentAudioPlayer.pause();
    currentAudioPlayer = null;
  }

  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }

  document.getElementById('btnStartWorkout').classList.remove('hidden');
  document.getElementById('btnStopWorkout').classList.add('hidden');
  document.getElementById('workoutStatusBadge').className = 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1.5';
  document.getElementById('workoutStatusBadge').innerHTML = '<span class="w-2 h-2 rounded-full bg-slate-500"></span> Workout Stopped';
  document.getElementById('countdownText').textContent = '—';
}

function resetCountdown() {
  if (countdownTimerId) clearInterval(countdownTimerId);
  secondsRemaining = config.intervalMinutes * 60;
  updateCountdownDisplay();
  countdownTimerId = setInterval(() => {
    secondsRemaining--;
    if (secondsRemaining < 0) secondsRemaining = 0;
    updateCountdownDisplay();
  }, 1000);
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

  const nsInput = document.getElementById('cfgNsUrl');
  const intervalSelect = document.getElementById('cfgInterval');
  const targetMin = document.getElementById('cfgTargetMin');
  const targetMax = document.getElementById('cfgTargetMax');

  if (nsInput) nsInput.value = config.nsUrl;
  if (intervalSelect) intervalSelect.value = String(config.intervalMinutes);
  if (targetMin) targetMin.value = config.targetMin;
  if (targetMax) targetMax.value = config.targetMax;

  document.getElementById('btnStartWorkout')?.addEventListener('click', startWorkout);
  document.getElementById('btnStopWorkout')?.addEventListener('click', stopWorkout);
  document.getElementById('btnTestAudio')?.addEventListener('click', () => {
    playStudioVoice("Audio test: Blood glucose 129, steady. Target zone for running, no carbs needed.");
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
    config.targetMin = parseInt(document.getElementById('cfgTargetMin').value, 10) || 110;
    config.targetMax = parseInt(document.getElementById('cfgTargetMax').value, 10) || 170;
    saveConfig();
    settingsModal.classList.add('hidden');

    if (isRunning) {
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

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => {
      console.warn('SW registration skipped', err);
    });
  }
});
