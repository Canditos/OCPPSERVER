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

// Ensure cache directory exists
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
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

  // 1. Neural European Portuguese (RaquelNeural) & English TTS Route
  if (parsedUrl.pathname === '/api/tts') {
    const text = (parsedUrl.searchParams.get('text') || '').trim();
    const lang = parsedUrl.searchParams.get('lang') || 'pt-PT';
    
    if (!text) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Text required' }));
      return;
    }

    // Voice selection: RaquelNeural is the authentic Portugal voice the user approved!
    const voice = lang === 'pt-PT' ? 'pt-PT-RaquelNeural' : 'en-US-JennyNeural';

    // File cache hash
    const hash = crypto.createHash('md5').update(`${voice}:${text}`).digest('hex');
    const cachedFile = path.join(CACHE_DIR, `${hash}.mp3`);

    if (fs.existsSync(cachedFile)) {
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      });
      fs.createReadStream(cachedFile).pipe(res);
      return;
    }

    // Generate using python edge-tts worker
    const workerScript = path.join(__dirname, 'tts_worker.py');
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';

    execFile(pythonCmd, [workerScript, text, voice, cachedFile], (error) => {
      if (!error && fs.existsSync(cachedFile)) {
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400'
        });
        fs.createReadStream(cachedFile).pipe(res);
      } else {
        // Fallback to Google Translate TTS if python worker fails
        console.warn('Python TTS worker error, falling back to Google TTS:', error?.message);
        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(lang)}&client=tw-ob`;
        https.get(ttsUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
            'Referer': 'https://translate.google.com/'
          }
        }, (ttsRes) => {
          res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Access-Control-Allow-Origin': '*'
          });
          ttsRes.pipe(res);
        }).on('error', () => {
          res.writeHead(500, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'TTS failed' }));
        });
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
