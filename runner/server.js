// Lightweight HTTP server for Nightscout Audio Runner with CORS Proxy and High-Quality Neural TTS
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { URL } = require('url');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

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

// In-memory audio cache for instant playback
const audioCache = new Map();

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

  // 1. High Quality Studio TTS Route (supports pt-PT and en)
  if (parsedUrl.pathname === '/api/tts') {
    const text = parsedUrl.searchParams.get('text') || '';
    const lang = parsedUrl.searchParams.get('lang') || 'pt-PT';
    
    if (!text.trim()) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Text required' }));
      return;
    }

    const cacheKey = `${lang}:${text}`;
    if (audioCache.has(cacheKey)) {
      const cached = audioCache.get(cacheKey);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': cached.length,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400'
      });
      res.end(cached);
      return;
    }

    // Call Google TTS with pt-PT or en
    const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(text)}&tl=${encodeURIComponent(lang)}&client=tw-ob`;
    
    https.get(ttsUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://translate.google.com/'
      }
    }, (ttsRes) => {
      if (ttsRes.statusCode !== 200) {
        res.writeHead(ttsRes.statusCode, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
        res.end(JSON.stringify({ error: 'TTS provider error' }));
        return;
      }

      const chunks = [];
      ttsRes.on('data', (chunk) => chunks.push(chunk));
      ttsRes.on('end', () => {
        const fullBuffer = Buffer.concat(chunks);
        // Cache if under 1MB
        if (fullBuffer.length < 1000000) {
          audioCache.set(cacheKey, fullBuffer);
        }
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': fullBuffer.length,
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400'
        });
        res.end(fullBuffer);
      });
    }).on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(JSON.stringify({ error: 'TTS request failed', details: err.message }));
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
  console.log(`🔊 Estúdio TTS ativo (Português de Portugal e English)`);
  console.log(`======================================================`);
  console.log(`No teu computador:   http://localhost:${PORT}`);
  if (localIps.length > 0) {
    console.log(`No teu Pixel 9 Pro XL:`);
    localIps.forEach(ip => {
      console.log(`  👉 http://${ip}:${PORT}`);
    });
    console.log(`(Certifica-te de que o telemóvel está no mesmo Wi-Fi)`);
  }
  console.log(`======================================================\n`);
});
