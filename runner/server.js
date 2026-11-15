// Lightweight HTTP server for Nightscout Audio Runner with Neural TTS (RaquelNeural PT-PT)
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

  // 1.1 App Version endpoint for in-app updates
  if (parsedUrl.pathname === '/api/version') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*'
    });
    res.end(JSON.stringify({
      versionCode: 14,
      versionName: '2.3',
      apkUrl: 'https://runner.gatoescondido.com/nightscout-runner.apk?v=14',
      releaseNotes: 'Modo de Sessão (Corrida vs Dia a Dia), Arranque Autónomo sem Intervals.icu, Interrupção Imediata de Emergência/Hipo, Deteção de Bólus da Bomba Tandem e Voz Focada na Glicémia.',
      features: [
        {
          icon: '🏃',
          title: 'Seleção de Modo: Corrida vs Dia a Dia',
          desc: 'Escolhe entre Modo Corrida (com GPS, ritmo e batimento cardíaco) ou Modo Dia a Dia (monitorização pura da glicémia por voz, sem GPS nem ecrãs desnecessários).'
        },
        {
          icon: '🚨',
          title: 'Interrupção Imediata de Emergência (30s)',
          desc: 'Verificação rápida a cada 30s: aviso por voz prioritário e imediato se entrar em hipo severa ou queda a pique, sem esperar pelo temporizador normal.'
        },
        {
          icon: '💉',
          title: 'Deteção de Bolus da Bomba Tandem',
          desc: 'Monitoriza administrações de insulina da bomba nos últimos 20m e avisa por voz e no ecrã com crachá dedicado.'
        },
        {
          icon: '🎙️',
          title: 'Voz Focada na Glicémia',
          desc: 'Removido o anúncio de ritmo de corrida para manter o foco total na glicémia, que é dita sempre mesmo durante a absorção de hidratos.'
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

  // 2. Neural European Portuguese (RaquelNeural) & English TTS Route
  if (parsedUrl.pathname === '/api/tts') {
    const text = (parsedUrl.searchParams.get('text') || '').trim();
    const lang = parsedUrl.searchParams.get('lang') || 'pt-PT';
    
    if (!text) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Text required' }));
      return;
    }

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
        headers: { 'Accept': 'application/json', 'User-Agent': 'NightscoutAudioRunner/2.3' }
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
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  if (parsedUrl.pathname === '/api/treatments') {
    const targetUrl = 'https://diabetes.gatoescondido.com/api/v1/treatments.json?count=30';
    try {
      const client = https;
      const proxyReq = client.get(targetUrl, {
        headers: { 'Accept': 'application/json', 'User-Agent': 'NightscoutAudioRunner/2.3' }
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
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e.message }));
      return;
    }
  }

  // 2. Built-in Nightscout Proxy to bypass CORS issues on mobile browsers
  if (parsedUrl.pathname === '/api/entries' || parsedUrl.pathname === '/api/proxy') {
    const targetUrl = parsedUrl.searchParams.get('url') || 'https://diabetes.gatoescondido.com/api/v1/entries.json?count=5';
    
    try {
      const parsedTarget = new URL(targetUrl);
      const client = parsedTarget.protocol === 'https:' ? https : http;

      const proxyReq = client.get(targetUrl, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'NightscoutAudioRunner/1.0'
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
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Invalid URL' }));
      return;
    }
  }

  // 2.1 Intervals.icu Athlete & Zones Proxy
  if (parsedUrl.pathname === '/api/intervals/athlete') {
    const apiKey = parsedUrl.searchParams.get('key') || '2vi0p9dd17r7is9lyf2souw4x';
    const authHeader = 'Basic ' + Buffer.from('API_KEY:' + apiKey).toString('base64');
    
    const reqInt = https.request('https://intervals.icu/api/v1/athlete/0', {
      method: 'GET',
      headers: {
        'Authorization': authHeader,
        'User-Agent': 'NightscoutAudioRunner/2.1',
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
    const apiKey = parsedUrl.searchParams.get('key') || '2vi0p9dd17r7is9lyf2souw4x';
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
        'User-Agent': 'NightscoutAudioRunner/2.1',
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

  // 2.3 Intervals.icu Manual Activity Upload Proxy
  if (parsedUrl.pathname === '/api/intervals/upload') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const apiKey = payload.apiKey || '2vi0p9dd17r7is9lyf2souw4x';
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
            'User-Agent': 'NightscoutAudioRunner/2.1'
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

  // 3. Static File Server
  let safePath = path.normalize(parsedUrl.pathname);
  if (safePath === '/' || safePath === '\\') {
    safePath = '/index.html';
  }

  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
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
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500);
        res.end('Internal Server Error');
      } else {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600'
        });
        res.end(content);
      }
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localIps = getLocalIpAddresses();
  console.log(`\n======================================================`);
  console.log(`🏃 Nightscout Audio Runner pronto!`);
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
