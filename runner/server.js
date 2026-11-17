// Lightweight HTTP server for Nightscout Audio Runner with Neural TTS (RaquelNeural PT-PT)
// Hardened with Cybersecurity Protections: SSRF Shield, Rate Limiting, DoS Defense & Security Headers
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const CACHE_DIR = path.join(PUBLIC_DIR, 'audio_cache');

// Ensure cache directory exists and purge legacy low-volume audios on startup
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
} else {
  try {
    const cachedFiles = fs.readdirSync(CACHE_DIR);
    for (const f of cachedFiles) {
      if (f.endsWith('.mp3')) {
        try { fs.unlinkSync(path.join(CACHE_DIR, f)); } catch (e) {}
      }
    }
    console.log('Cleaned up legacy TTS cache files for loud voice upgrade.');
  } catch (e) {}
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.mp3': 'audio/mpeg',
  '.ico': 'image/x-icon'
};

// ==========================================
// 🛡️ CYBERSECURITY HARDENING: SSRF & IP DEFENSE
// ==========================================
function isSafeTargetUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    // Enforce HTTP / HTTPS
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;

    const hostname = parsed.hostname.toLowerCase();

    // Block IP literals (loopback, private 10.x, 192.168.x, 172.16-31.x, link-local 169.254.x)
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
    const ipMatch = hostname.match(ipv4Regex);
    if (ipMatch) {
      const [, o1, o2] = ipMatch.map(Number);
      if (o1 === 127) return false; // Loopback
      if (o1 === 10) return false;  // Private 10.0.0.0/8
      if (o1 === 172 && o2 >= 16 && o2 <= 31) return false; // Private 172.16.0.0/12
      if (o1 === 192 && o2 === 168) return false; // Private 192.168.0.0/16
      if (o1 === 169 && o2 === 254) return false; // Link-local / Cloud metadata (AWS, GCP, Coolify)
      if (o1 === 0) return false;
      return false; // Reject direct IP targeting
    }

    if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname === '::1' || hostname === '0.0.0.0') {
      return false;
    }

    // Domain allowlist: Nightscout and Intervals.icu ecosystem
    const allowedDomains = [
      'gatoescondido.com',
      'diabetes.gatoescondido.com',
      'intervals.icu',
      'corsproxy.io'
    ];

    const isAllowed = allowedDomains.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );

    return isAllowed;
  } catch (e) {
    return false;
  }
}

// ==========================================
// 🛡️ CYBERSECURITY: RATE LIMITING & DOS SHIELD
// ==========================================
const rateLimitMap = new Map(); // key -> { count, resetTime }

function checkRateLimit(key, limit = 120, windowMs = 60000) {
  const now = Date.now();
  let record = rateLimitMap.get(key);
  if (!record || now > record.resetTime) {
    record = { count: 1, resetTime: now + windowMs };
    rateLimitMap.set(key, record);
    return true;
  }
  record.count++;
  return record.count <= limit;
}

// Clean up stale rate limiter entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetTime) rateLimitMap.delete(key);
  }
}, 300000);

// ==========================================
// 🛡️ CYBERSECURITY: HTTP SECURITY HEADERS
// ==========================================
function applySecurityHeaders(res, isHtml = false) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), microphone=(), camera=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  if (isHtml) {
    res.setHeader('Content-Security-Policy', [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://cdn.jsdelivr.net",
      "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com",
      "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com data:",
      "img-src 'self' data: https:",
      "media-src 'self' blob: data:",
      "connect-src 'self' https://diabetes.gatoescondido.com https://*.gatoescondido.com https://intervals.icu https://*.intervals.icu https://cdn.jsdelivr.net blob: data:"
    ].join('; '));
  }
}

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

const server = http.createServer((req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || 'unknown';

  // Apply default security headers
  applySecurityHeaders(res, false);

  // Global rate limiter per IP: max 180 requests per minute
  if (!checkRateLimit(`global_${clientIp}`, 180, 60000)) {
    res.writeHead(429, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
    res.end(JSON.stringify({ error: 'Muitos pedidos. Rate limit excedido.' }));
    return;
  }

  // Handle CORS Preflight OPTIONS
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With, Accept',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  // 1.1 App Version endpoint for in-app updates (v2.6)
  if (parsedUrl.pathname === '/api/version') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      versionCode: 17,
      versionName: '2.6',
      apkUrl: 'https://runner.gatoescondido.com/nightscout-runner.apk?v=17',
      releaseNotes: 'Blindagem de Cibersegurança (SSRF & DoS Shield), Sparkline SVG em Tempo Real no Card de Glicémia, Seletor Especializado de Géis (Glucody, 4Energy, 4Endurance) e Sincronização 1-Tap c/ Intervals.icu.',
      features: [
        {
          icon: '🛡️',
          title: 'Blindagem de Cibersegurança Avançada',
          desc: 'Proteção contra SSRF e DNS Rebinding nos proxies, limitação de débito (Rate Limiting anti-DoS), cabeçalhos CSP/HSTS e proteção contra Path Traversal.'
        },
        {
          icon: '📈',
          title: 'Sparkline SVG de Glicémia em Tempo Real',
          desc: 'Micro-gráfico neon integrado diretamente no Card de Glicémia: histórico da última hora, corredor alvo e ponto pulsante dinâmico.'
        },
        {
          icon: '🍬',
          title: 'Seletor de Géis & Dextrose Especializado',
          desc: 'Chips rápidos de 1-toque calibrados para Glucody SOS (12g dextrose rápida), 4Energy Líquido (20g) e 4Endurance 2:1 (30g), com registo personalizado.'
        },
        {
          icon: '⚡',
          title: 'Sincronização 1-Tap com Intervals.icu',
          desc: 'Botão dedicado no resumo de treino para enviar notas clínicas completas de glicémia, TIR, hidratos consumidos e frequência cardíaca diretamente para o treino do dia.'
        },
        {
          icon: '📱',
          title: 'Layout Adaptativo Tablet & Telemóvel',
          desc: 'Visual responsivo OLED de alto contraste que se ajusta em telemóvel e tablet com cronómetro sticky no ginásio.'
        }
      ]
    }));
    return;
  }

  // 1.2 Direct APK download route
  if (parsedUrl.pathname === '/nightscout-runner.apk' || parsedUrl.pathname === '/download') {
    const candidates = [
      path.join(PUBLIC_DIR, 'nightscout-runner.apk'),
      path.join(__dirname, 'nightscout-runner.apk')
    ];
    const apkPath = candidates.find(p => fs.existsSync(p));
    if (apkPath) {
      const stat = fs.statSync(apkPath);
      res.writeHead(200, {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': 'attachment; filename="nightscout-runner.apk"',
        'Content-Length': stat.size,
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0'
      });
      fs.createReadStream(apkPath).pipe(res);
      return;
    }
  }

  // 1. Diagnostics endpoint
  if (parsedUrl.pathname === '/api/diag') {
    const workerScript = path.join(__dirname, 'tts_worker.py');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    execFile(pythonCmd, ['--version'], (pyErr, pyOut, pyErrOut) => {
      execFile(pythonCmd, ['-c', 'import edge_tts; print(edge_tts.__version__)'], (edgeErr, edgeOut, edgeErrOut) => {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({
          platform: process.platform,
          python: { error: pyErr?.message, stdout: pyOut.trim(), stderr: pyErrOut.trim() },
          edge_tts: { error: edgeErr?.message, stdout: edgeOut.trim(), stderr: edgeErrOut.trim() }
        }, null, 2));
      });
    });
    return;
  }

  // 2. Neural European Portuguese (RaquelNeural) & English TTS Route with Rate Limiting & Input Sanitization
  if (parsedUrl.pathname === '/api/tts') {
    // Specific rate limit on TTS: max 35 requests per minute per IP
    if (!checkRateLimit(`tts_${clientIp}`, 35, 60000)) {
      res.writeHead(429, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Muitos pedidos de voz. Aguarda um momento.' }));
      return;
    }

    let text = (parsedUrl.searchParams.get('text') || '').trim();
    const lang = parsedUrl.searchParams.get('lang') || 'pt-PT';
    
    if (!text) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Text required' }));
      return;
    }

    // DoS defense: Sanitize and limit text length to 500 characters
    if (text.length > 500) {
      text = text.substring(0, 500);
    }
    // Remove control characters (except common punctuation and whitespace)
    text = text.replace(/[\x00-\x1F\x7F]/g, ' ');

    // Multilingual Neural Voice Map: PT (Raquel), EN (Jenny), ES (Elvira), FR (Denise), DE (Katja)
    const VOICE_MAP = {
      'pt-pt': 'pt-PT-RaquelNeural',
      'pt':    'pt-PT-RaquelNeural',
      'en-us': 'en-US-JennyNeural',
      'en':    'en-US-JennyNeural',
      'es-es': 'es-ES-ElviraNeural',
      'es':    'es-ES-ElviraNeural',
      'fr-fr': 'fr-FR-DeniseNeural',
      'fr':    'fr-FR-DeniseNeural',
      'de-de': 'de-DE-KatjaNeural',
      'de':    'de-DE-KatjaNeural'
    };
    const langKey = (lang || 'pt-PT').toLowerCase();
    const voice = VOICE_MAP[langKey] || 
                  (langKey.startsWith('pt') ? 'pt-PT-RaquelNeural' :
                   langKey.startsWith('es') ? 'es-ES-ElviraNeural' :
                   langKey.startsWith('fr') ? 'fr-FR-DeniseNeural' :
                   langKey.startsWith('de') ? 'de-DE-KatjaNeural' : 'en-US-JennyNeural');

    // File cache hash
    const hash = crypto.createHash('md5').update(`v2_loud:${voice}:${text}`).digest('hex');
    const cachedFile = path.join(CACHE_DIR, `${hash}.mp3`);

    if (fs.existsSync(cachedFile)) {
      try {
        const stat = fs.statSync(cachedFile);
        if (stat.size > 200) {
          res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Content-Length': stat.size,
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400'
          });
          fs.createReadStream(cachedFile).pipe(res);
          return;
        } else {
          fs.unlinkSync(cachedFile);
        }
      } catch (e) {}
    }

    // Generate using python edge-tts worker
    const workerScript = path.join(__dirname, 'tts_worker.py');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    execFile(pythonCmd, [workerScript, text, voice, cachedFile], (error, stdout, stderr) => {
      let valid = false;
      let statSize = 0;
      try {
        if (fs.existsSync(cachedFile)) {
          const stat = fs.statSync(cachedFile);
          if (stat.size > 200) {
            valid = true;
            statSize = stat.size;
          }
        }
      } catch (e) {}

      if (valid) {
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': statSize,
          'Accept-Ranges': 'bytes',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400'
        });
        fs.createReadStream(cachedFile).pipe(res);
      } else {
        console.error('Neural TTS generation failed. Stderr:', stderr, 'Error:', error?.message);
        if (fs.existsSync(cachedFile)) {
          try { fs.unlinkSync(cachedFile); } catch (e) {}
        }
        res.writeHead(500, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        res.end(JSON.stringify({
          error: 'Neural TTS generation failed',
          details: error?.message,
          stderr: stderr ? stderr.trim() : ''
        }));
      }
    });

    return;
  }

  // 2.0 Tandem Pump Bolus Detection & Nightscout Treatments Proxy
  if (parsedUrl.pathname === '/api/pump/latest') {
    const targetUrl = 'https://diabetes.gatoescondido.com/api/v1/treatments.json?count=30';
    try {
      const client = https;
      const proxyReq = client.get(targetUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'NightscoutAudioRunner/2.6' }
      }, (proxyRes) => {
        let rawData = '';
        proxyRes.on('data', chunk => rawData += chunk);
        proxyRes.on('end', () => {
          try {
            const arr = JSON.parse(rawData);
            const boluses = arr.filter(t => t.insulin && parseFloat(t.insulin) > 0);
            let result = { hasBolus: false, insulin: 0, minsAgo: -1, timestamp: 0, spokenPt: '', eventType: '' };
            if (boluses.length > 0) {
              const b = boluses[0];
              const ts = new Date(b.created_at || b.timestamp).getTime();
              const minsAgo = Math.max(0, Math.floor((Date.now() - ts) / 60000));
              const ins = parseFloat(b.insulin);
              const insFormatted = (Math.round(ins * 10) / 10).toString().replace('.', ' vírgula ');
              const spokenPt = minsAgo <= 20
                ? 'A bomba administrou ' + insFormatted + ' unidades de insulina há ' + minsAgo + ' minutos.'
                : '';
              result = {
                hasBolus: true,
                insulin: ins,
                minsAgo: minsAgo,
                timestamp: ts,
                carbs: b.carbs || 0,
                eventType: b.eventType || 'Bolus',
                notes: b.notes || '',
                spokenPt: spokenPt
              };
            }
            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, OPTIONS',
              'Access-Control-Allow-Headers': '*'
            });
            res.end(JSON.stringify(result));
          } catch (err) {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Parse error', details: err.message }));
          }
        });
      });
      proxyReq.on('error', err => {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Proxy failed', details: err.message }));
      });
      return;
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  if (parsedUrl.pathname === '/api/treatments') {
    const targetUrl = 'https://diabetes.gatoescondido.com/api/v1/treatments.json?count=30';
    try {
      const client = https;
      const proxyReq = client.get(targetUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'NightscoutAudioRunner/2.6' }
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        });
        proxyRes.pipe(res);
      });
      proxyReq.on('error', err => {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Proxy failed', details: err.message }));
      });
      return;
    } catch (e) {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  // 2. Hardened Nightscout Proxy with SSRF Protection
  if (parsedUrl.pathname === '/api/entries' || parsedUrl.pathname === '/api/proxy') {
    const rawTarget = parsedUrl.searchParams.get('url') || 'https://diabetes.gatoescondido.com/api/v1/entries.json?count=12';
    
    // SSRF Validation
    if (!isSafeTargetUrl(rawTarget)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'SSRF Protection: O destino indicado não é permitido.' }));
      return;
    }

    try {
      const parsedTarget = new URL(rawTarget);
      const client = parsedTarget.protocol === 'https:' ? https : http;

      const proxyReq = client.get(rawTarget, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'NightscoutAudioRunner/2.6'
        }
      }, (proxyRes) => {
        res.writeHead(proxyRes.statusCode, {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': '*'
        });
        proxyRes.pipe(res);
      });

      proxyReq.on('error', (err) => {
        res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Proxy request failed', details: err.message }));
      });
      return;
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'Invalid URL' }));
      return;
    }
  }

  // 2.1 Intervals.icu Athlete & Zones Proxy
  if (parsedUrl.pathname === '/api/intervals/athlete') {
    const apiKey = parsedUrl.searchParams.get('key') || process.env.INTERVALS_API_KEY || '2vi0p9dd17r7is9lyf2souw4x';
    const authHeader = 'Basic ' + Buffer.from('API_KEY:' + apiKey).toString('base64');
    
    const reqInt = https.request('https://intervals.icu/api/v1/athlete/0', {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'User-Agent': 'NightscoutAudioRunner/2.6',
        'Accept': 'application/json'
      }
    }, (resInt) => {
      let data = '';
      resInt.on('data', chunk => data += chunk);
      resInt.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          let runZones = [136, 144, 152, 161, 165, 170, 179];
          let maxHr = 179;
          if (parsed.sportSettings) {
            const runSetting = parsed.sportSettings.find(s => (s.types || []).includes('Run'));
            if (runSetting && runSetting.hr_zones) {
              runZones = runSetting.hr_zones;
              if (runSetting.max_hr) maxHr = runSetting.max_hr;
            }
          }
          res.writeHead(200, {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*'
          });
          res.end(JSON.stringify({
            id: parsed.id,
            name: parsed.name,
            maxHr: maxHr,
            hrZones: runZones
          }));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'Failed parsing Intervals.icu response' }));
        }
      });
    });
    reqInt.on('error', err => {
      res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: err.message }));
    });
    reqInt.end();
    return;
  }

  // 2.2 Intervals.icu Today's Workout Proxy
  if (parsedUrl.pathname === '/api/intervals/today') {
    const apiKey = parsedUrl.searchParams.get('key') || process.env.INTERVALS_API_KEY || '2vi0p9dd17r7is9lyf2souw4x';
    const athleteId = parsedUrl.searchParams.get('athlete') || 'i470647';
    const authHeader = 'Basic ' + Buffer.from('API_KEY:' + apiKey).toString('base64');

    const now = new Date();
    const oldest = new Date(now.getTime() - 24 * 3600 * 1000).toISOString().split('T')[0];
    const newest = new Date(now.getTime() + 4 * 24 * 3600 * 1000).toISOString().split('T')[0];

    const url = `https://intervals.icu/api/v1/athlete/${athleteId}/events?oldest=${oldest}&newest=${newest}`;
    const reqInt = https.request(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'User-Agent': 'NightscoutAudioRunner/2.6',
        'Accept': 'application/json'
      }
    }, (resInt) => {
      let data = '';
      resInt.on('data', chunk => data += chunk);
      resInt.on('end', () => {
        try {
          const events = JSON.parse(data);
          const todayStr = now.toISOString().split('T')[0];
          let chosen = null;
          if (Array.isArray(events)) {
            chosen = events.find(e => e.category === 'WORKOUT' && e.start_date_local && e.start_date_local.startsWith(todayStr));
            if (!chosen) {
              chosen = events.find(e => e.category === 'WORKOUT' && e.start_date_local && e.start_date_local >= todayStr);
            }
            if (!chosen && events.length > 0) {
              chosen = events.find(e => e.category === 'WORKOUT') || events[events.length - 1];
            }
          }

          if (chosen) {
            let targetPaceMin = null;
            let targetPaceMax = null;
            let targetPaceFormatted = '';
            let steps = [];

            if (chosen.workout_doc && chosen.workout_doc.steps) {
              steps = chosen.workout_doc.steps;
              for (const st of steps) {
                if (st.pace && st.pace.start && st.pace.end) {
                  targetPaceMin = st.pace.start;
                  targetPaceMax = st.pace.end;
                  break;
                }
              }
            }

            if (targetPaceMin && targetPaceMax) {
              const minM = Math.floor(targetPaceMin / 60);
              const minS = targetPaceMin % 60;
              const maxM = Math.floor(targetPaceMax / 60);
              const maxS = targetPaceMax % 60;
              targetPaceFormatted = `${minM}:${minS < 10 ? '0' : ''}${minS} - ${maxM}:${maxS < 10 ? '0' : ''}${maxS} min/km`;
            }

            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({
              found: true,
              workout: {
                id: chosen.id,
                date: chosen.start_date_local,
                name: chosen.name,
                type: chosen.type || 'Run',
                distance: chosen.distance || (chosen.workout_doc && chosen.workout_doc.distance) || 0,
                duration: chosen.duration || (chosen.workout_doc && chosen.workout_doc.duration) || 0,
                targetPaceSecMin: targetPaceMin,
                targetPaceSecMax: targetPaceMax,
                targetPaceFormatted: targetPaceFormatted,
                description: chosen.description || '',
                steps: steps
              }
            }));
          } else {
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ found: false, message: 'Nenhum treino agendado para hoje no Intervals.icu.' }));
          }
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: e.message }));
        }
      });
    });
    reqInt.on('error', err => {
      res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: err.message }));
    });
    reqInt.end();
    return;
  }

  // 2.25 Intervals.icu Gym / Strength Workouts Proxy
  if (parsedUrl.pathname === '/api/intervals/gym') {
    const apiKey = parsedUrl.searchParams.get('key') || process.env.INTERVALS_API_KEY || '2vi0p9dd17r7is9lyf2souw4x';
    const athleteId = parsedUrl.searchParams.get('athlete') || 'i470647';
    const dateParam = parsedUrl.searchParams.get('date'); // YYYY-MM-DD
    const listAll = parsedUrl.searchParams.get('listAll') === 'true';
    const authHeader = 'Basic ' + Buffer.from('API_KEY:' + apiKey).toString('base64');

    // Query window: if listAll, from Nov 2026 to April 2027
    const oldest = listAll ? '2026-11-09' : (dateParam ? dateParam : new Date(Date.now() - 3 * 86400000).toISOString().split('T')[0]);
    const newest = listAll ? '2027-04-10' : (dateParam ? new Date(new Date(dateParam).getTime() + 86400000).toISOString().split('T')[0] : new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0]);

    const url = `https://intervals.icu/api/v1/athlete/${athleteId}/events?oldest=${oldest}&newest=${newest}`;
    const reqInt = https.request(url, {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'User-Agent': 'NightscoutAudioRunner/2.6',
        'Accept': 'application/json'
      }
    }, (resInt) => {
      let data = '';
      resInt.on('data', chunk => data += chunk);
      resInt.on('end', () => {
        try {
          const events = JSON.parse(data);
          if (!Array.isArray(events)) {
            res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
            res.end(JSON.stringify({ error: 'Intervals.icu returned invalid list' }));
            return;
          }

          // Filter for WeightTraining workouts
          const gymEvents = events.filter(e => e.category === 'WORKOUT' && e.type === 'WeightTraining');

          function parseGymDescription(desc) {
            if (!desc) return { warmup: '', exercises: [], tandemNotes: '', raw: '' };
            const lines = desc.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            let warmup = '';
            let exercises = [];
            let tandemNotes = '';
            let currentEx = null;
            let section = '';

            for (const line of lines) {
              if (line.toLowerCase().includes('aquecimento') || line.toLowerCase().includes('cardio leve')) {
                section = 'warmup';
                continue;
              }
              if (line.toLowerCase().includes('circuito') || line.toLowerCase().includes('bloco de força') || line.toLowerCase().includes('bloco de forca')) {
                section = 'exercises';
                continue;
              }
              if (line.toLowerCase().includes('nota tandem') || line.toLowerCase().includes('tandem')) {
                section = 'tandem';
                continue;
              }

              if (section === 'warmup') {
                warmup += (warmup ? ' • ' : '') + line.replace(/^-\s*/, '');
              } else if (section === 'exercises') {
                const matchEx = line.match(/^(\d+)\.\s*([^:]+):\s*(.*)/);
                if (matchEx) {
                  currentEx = {
                    num: parseInt(matchEx[1]),
                    name: matchEx[2].trim(),
                    prescription: matchEx[3].trim(),
                    sets: 3,
                    reps: '12 reps',
                    rest: '60s',
                    notes: ''
                  };
                  const sMatch = matchEx[3].match(/(\d+)\s*s[eé]ries/i);
                  if (sMatch) currentEx.sets = parseInt(sMatch[1]);
                  const rMatch = matchEx[3].match(/(\d+(?:\s*a\s*\d+)?)\s*reps/i);
                  if (rMatch) currentEx.reps = rMatch[1] + ' reps';
                  const restMatch = matchEx[3].match(/descanso\s*(\d+s?)/i);
                  if (restMatch) currentEx.rest = restMatch[1];
                  exercises.push(currentEx);
                } else if (line.startsWith('(') && currentEx) {
                  currentEx.notes = line.replace(/^\(|\)$/g, '').trim();
                } else if (line.startsWith('-') && currentEx) {
                  currentEx.notes += (currentEx.notes ? ' ' : '') + line.replace(/^-\s*/, '');
                }
              } else if (section === 'tandem') {
                tandemNotes += (tandemNotes ? ' ' : '') + line;
              }
            }

            return { warmup, exercises, tandemNotes, raw: desc };
          }

          if (listAll) {
            const list = gymEvents.map(e => ({
              id: e.id,
              date: (e.start_date_local || '').split('T')[0],
              name: e.name,
              movingTime: e.moving_time || 2700,
              parsed: parseGymDescription(e.description)
            })).sort((a,b) => a.date.localeCompare(b.date));

            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ found: true, count: list.length, workouts: list }));
            return;
          }

          // Single workout lookup
          let targetWorkout = null;
          if (dateParam) {
            targetWorkout = gymEvents.find(e => (e.start_date_local || '').startsWith(dateParam));
          }
          if (!targetWorkout && gymEvents.length > 0) {
            const todayStr = new Date().toISOString().split('T')[0];
            targetWorkout = gymEvents.find(e => (e.start_date_local || '').split('T')[0] >= todayStr) || gymEvents[0];
          }

          if (targetWorkout) {
            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({
              found: true,
              workout: {
                id: targetWorkout.id,
                date: (targetWorkout.start_date_local || '').split('T')[0],
                name: targetWorkout.name,
                movingTime: targetWorkout.moving_time || 2700,
                parsed: parseGymDescription(targetWorkout.description),
                allDates: gymEvents.map(e => (e.start_date_local || '').split('T')[0]).sort()
              }
            }));
          } else {
            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(JSON.stringify({ found: false, message: 'Nenhum treino de ginásio encontrado para este período.' }));
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: err.message }));
        }
      });
    });
    reqInt.on('error', err => {
      res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: err.message }));
    });
    reqInt.end();
    return;
  }

  // 2.3 Intervals.icu Manual Activity Upload Proxy
  if (parsedUrl.pathname === '/api/intervals/upload') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const apiKey = payload.apiKey || process.env.INTERVALS_API_KEY || '2vi0p9dd17r7is9lyf2souw4x';
        const athleteId = payload.athleteId || '0';
        const authHeader = 'Basic ' + Buffer.from('API_KEY:' + apiKey).toString('base64');

        const postData = JSON.stringify({
          name: payload.name || 'Corrida Nightscout Runner',
          type: payload.type || 'Run',
          start_date_local: payload.startDate || new Date().toISOString().replace(/\.\d+Z$/, ''),
          distance: payload.distanceMeters || 0,
          moving_time: payload.durationSeconds || 0,
          elapsed_time: payload.durationSeconds || 0,
          average_heartrate: payload.avgHeartRate || undefined,
          max_heartrate: payload.maxHeartRate || undefined,
          description: payload.description || 'Treino monitorizado com Nightscout Audio Runner'
        });

        const uploadReq = https.request(`https://intervals.icu/api/v1/athlete/${athleteId}/activities/manual`, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'User-Agent': 'NightscoutAudioRunner/2.6'
          }
        }, (uploadRes) => {
          let respData = '';
          uploadRes.on('data', c => respData += c);
          uploadRes.on('end', () => {
            res.writeHead(uploadRes.statusCode, {
              'Content-Type': 'application/json; charset=utf-8',
              'Access-Control-Allow-Origin': '*'
            });
            res.end(respData);
          });
        });

        uploadReq.on('error', (err) => {
          res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: err.message }));
        });

        uploadReq.write(postData);
        uploadReq.end();
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'Invalid JSON payload' }));
      }
    });
    return;
  }

  // 2.4 Dedicated Intervals.icu Workout Summary Sync Endpoint (1-Tap Sync)
  if (parsedUrl.pathname === '/api/intervals/sync-workout' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const athleteId = payload.athleteId || 'i470647';
        const apiKey = payload.apiKey || process.env.INTERVALS_API_KEY || '2vi0p9dd17r7is9lyf2souw4x';
        const authHeader = 'Basic ' + Buffer.from('API_KEY:' + apiKey).toString('base64');

        const now = new Date();
        const workoutDate = payload.workoutDate || now.toISOString().split('T')[0];

        // Fetch recent activities to locate today's run
        const oldest = new Date(Date.now() - 2 * 86400000).toISOString().split('T')[0];
        const newest = new Date(Date.now() + 86400000).toISOString().split('T')[0];
        const activitiesUrl = `https://intervals.icu/api/v1/athlete/${athleteId}/activities?oldest=${oldest}&newest=${newest}`;

        https.get(activitiesUrl, {
          headers: {
            'Authorization': authHeader,
            'User-Agent': 'NightscoutAudioRunner/2.6',
            'Accept': 'application/json'
          }
        }, (resActs) => {
          let actData = '';
          resActs.on('data', c => actData += c);
          resActs.on('end', () => {
            try {
              const activities = JSON.parse(actData);
              let targetActivity = null;
              if (Array.isArray(activities) && activities.length > 0) {
                targetActivity = activities.find(a => (a.start_date_local || '').startsWith(workoutDate)) || activities[0];
              }

              const durMinutes = Math.round((payload.durationSeconds || 0) / 60);
              const carbsGrams = payload.carbsGrams || 0;
              const avgG = payload.avgGlucose || '--';
              const minG = payload.minGlucose || '--';
              const maxG = payload.maxGlucose || '--';
              const tir = payload.tirPercent || 100;
              const hrAvg = payload.hrAvg ? `${payload.hrAvg} bpm` : '--';
              const hrMax = payload.hrMax ? `${payload.hrMax} bpm` : '--';

              const description = [
                `🏃 Treino monitorizado com Nightscout Audio Runner v2.6`,
                `--------------------------------------------------`,
                `🩸 Glicémia Média: ${avgG} mg/dL (Mín: ${minG} | Máx: ${maxG})`,
                `🎯 Tempo no Alvo (TIR): ${tir}%`,
                `🍬 Hidratos de Carbono Ingeridos: ${carbsGrams}g`,
                `❤️ Frequência Cardíaca: Média ${hrAvg} (Máx: ${hrMax})`,
                `⏱️ Duração do Treino: ${durMinutes} min`,
                payload.notes ? `📝 Notas: ${payload.notes}` : '',
                `--------------------------------------------------`,
                `#cgm #dexcom-g7 #control-iq #nightscout-runner`
              ].filter(Boolean).join('\n');

              if (targetActivity && targetActivity.id) {
                // Update existing activity
                const updatePayload = JSON.stringify({
                  description: description,
                  carbs_ingested: carbsGrams
                });

                const putReq = https.request(`https://intervals.icu/api/v1/activity/${targetActivity.id}`, {
                  method: 'PUT',
                  headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(updatePayload),
                    'User-Agent': 'NightscoutAudioRunner/2.6'
                  }
                }, (putRes) => {
                  let putData = '';
                  putRes.on('data', d => putData += d);
                  putRes.on('end', () => {
                    res.writeHead(putRes.statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify({
                      success: putRes.statusCode >= 200 && putRes.statusCode < 300,
                      activityId: targetActivity.id,
                      name: targetActivity.name,
                      message: 'Atividade sincronizada com sucesso no Intervals.icu!'
                    }));
                  });
                });

                putReq.on('error', err => {
                  res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                  res.end(JSON.stringify({ error: err.message }));
                });

                putReq.write(updatePayload);
                putReq.end();
              } else {
                // Create manual activity
                const manualPayload = JSON.stringify({
                  name: `Corrida Nightscout Runner (${durMinutes}m)`,
                  type: 'Run',
                  start_date_local: payload.startDate || new Date().toISOString().replace(/\.\d+Z$/, ''),
                  distance: payload.distanceMeters || 0,
                  moving_time: payload.durationSeconds || 0,
                  elapsed_time: payload.durationSeconds || 0,
                  average_heartrate: payload.hrAvg || undefined,
                  max_heartrate: payload.hrMax || undefined,
                  description: description,
                  carbs_ingested: carbsGrams
                });

                const postReq = https.request(`https://intervals.icu/api/v1/athlete/${athleteId}/activities/manual`, {
                  method: 'POST',
                  headers: {
                    'Authorization': authHeader,
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(manualPayload),
                    'User-Agent': 'NightscoutAudioRunner/2.6'
                  }
                }, (postRes) => {
                  let postResp = '';
                  postRes.on('data', d => postResp += d);
                  postRes.on('end', () => {
                    res.writeHead(postRes.statusCode, { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
                    res.end(JSON.stringify({
                      success: postRes.statusCode >= 200 && postRes.statusCode < 300,
                      created: true,
                      message: 'Nova atividade registada e sincronizada no Intervals.icu!'
                    }));
                  });
                });

                postReq.on('error', err => {
                  res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
                  res.end(JSON.stringify({ error: err.message }));
                });

                postReq.write(manualPayload);
                postReq.end();
              }
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
              res.end(JSON.stringify({ error: 'Erro ao interpretar resposta do Intervals.icu', details: err.message }));
            }
          });
        }).on('error', err => {
          res.writeHead(502, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
          res.end(JSON.stringify({ error: 'Erro de ligação ao Intervals.icu', details: err.message }));
        });
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'JSON payload inválido' }));
      }
    });
    return;
  }

  // 3. Static File Server with Path Traversal Protection
  if (parsedUrl.pathname.indexOf('\0') !== -1) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  let safePath;
  try {
    safePath = decodeURIComponent(parsedUrl.pathname);
  } catch (e) {
    res.writeHead(400);
    res.end('Bad Request');
    return;
  }

  safePath = path.normalize(safePath);
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const resolvedPublicDir = path.resolve(PUBLIC_DIR);
  const filePath = path.resolve(PUBLIC_DIR, '.' + safePath);

  if (!filePath.startsWith(resolvedPublicDir)) {
    res.writeHead(403);
    res.end('Access Denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexPath, (readErr, content) => {
        if (readErr) {
          res.writeHead(404);
          res.end('Not Found');
        } else {
          applySecurityHeaders(res, true);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isHtml = ext === '.html';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        res.end('Internal Server Error');
      } else {
        applySecurityHeaders(res, isHtml);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': isHtml ? 'no-cache' : 'public, max-age=3600'
        });
        res.end(content);
      }
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localIps = getLocalIpAddresses();
  console.log(`\n======================================================`);
  console.log(`🏃 Nightscout Audio Runner v2.6 pronto!`);
  console.log(`🛡️ Cibersegurança: SSRF Shield, Rate Limiting & DoS Shield ativos!`);
  console.log(`🇵🇹 Voz de Portugal RaquelNeural ativa!`);
  console.log(`======================================================`);
  console.log(`No teu computador:   http://localhost:${PORT}`);
  if (localIps.length > 0) {
    console.log(`No teu Pixel 9 Pro XL:`);
    localIps.forEach(ip => {
      console.log(`  👉 http://${ip}:${PORT}`);
    });
  }
  console.log(`======================================================\n`);
});

