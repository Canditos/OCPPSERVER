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
      versionCode: 3,
      versionName: '1.2',
      apkUrl: 'https://runner.gatoescondido.com/nightscout-runner.apk',
      releaseNotes: 'Atenuação universal de volume (Audio Ducking) para Spotify, Yuma, YouTube Music, Podcasts e qualquer som em segundo plano.',
      features: [
        {
          icon: '🎧',
          title: 'Atenuação Universal de Música (Audio Ducking)',
          desc: 'O Yuma, Spotify, Podcasts ou YouTube baixam o volume suavemente durante o anúncio da glicemia e voltam logo aos 100%.'
        },
        {
          icon: '📲',
          title: 'Atualizações Diretas Sem Desinstalar',
          desc: 'Assinatura permanente de segurança — nunca mais precisas de desinstalar a app para atualizar.'
        },
        {
          icon: '⚡',
          title: 'Interface Aperfeiçoada & Live OTA',
          desc: 'Novo cabeçalho alinhado e atualizações instantâneas de ecrã via nuvem.'
        },
        {
          icon: '🔔',
          title: 'Notificação de Versões',
          desc: 'Vê sempre o que há de novo e o que foi alterado em cada versão.'
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
        'Content-Length': stat.size
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
      try {
        if (fs.existsSync(cachedFile) && fs.statSync(cachedFile).size > 200) {
          valid = true;
        }
      } catch (e) {}

      if (valid) {
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
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
