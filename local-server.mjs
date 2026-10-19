#!/usr/bin/env node
/**
 * Finance OS Local — Zero-dependency local server for Node.js (v18+)
 * Pure standard library (node:http, node:fs, node:path, node:child_process)
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, 'app');

const HOST = process.env.HOST || '127.0.0.1';
const PORT = Number(process.env.PORT) || 8765;
const APP_URL = `http://${HOST}:${PORT}`;
const MARKER = 'finance-os-local-v1';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

function openBrowser(targetUrl) {
  const start = process.platform === 'darwin' ? 'open' :
                process.platform === 'win32' ? 'start ""' : 'xdg-open';
  exec(`${start} "${targetUrl}"`);
}

function checkExistingInstance(cb) {
  const req = http.get(`${APP_URL}/__finance_os_health`, { timeout: 1500 }, res => {
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      try {
        const body = JSON.parse(data);
        cb(body.app === MARKER);
      } catch {
        cb(false);
      }
    });
  });
  req.on('error', () => cb(false));
  req.on('timeout', () => { req.destroy(); cb(false); });
}

const server = http.createServer((req, res) => {
  // Disallow outside hosts only if bound strictly to loopback and not in a cloud environment
  const isCloud = !!(process.env.VERCEL || process.env.PORT || process.env.NODE_ENV === 'production');
  const hostHeader = req.headers.host || '';
  if (!isCloud && HOST === '127.0.0.1' && !hostHeader.startsWith('127.0.0.1:') && !hostHeader.startsWith('localhost:')) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Host não permitido.');
    return;
  }

  // Health check endpoint
  if (req.url === '/__finance_os_health') {
    const body = JSON.stringify({ app: MARKER });
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body),
      'Cache-Control': 'no-store'
    });
    res.end(body);
    return;
  }

  // Parse requested pathname
  let reqPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
  if (reqPath === '/' || reqPath === '') {
    reqPath = '/index.html';
  }

  // Normalize path and prevent directory traversal
  const safePath = path.normalize(path.join(ROOT, reqPath));
  if (!safePath.startsWith(ROOT)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Acesso negado.');
    return;
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // SPA Fallback: if requesting a non-file route, serve index.html
      const indexPath = path.join(ROOT, 'index.html');
      fs.readFile(indexPath, (indexErr, indexData) => {
        if (indexErr) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Arquivo não encontrado.');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-cache',
          'X-Content-Type-Options': 'nosniff'
        });
        res.end(indexData);
      });
      return;
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const isFont = ext === '.woff2';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stats.size,
      'Cache-Control': isFont ? 'public, max-age=31536000, immutable' : 'no-cache',
      'X-Content-Type-Options': 'nosniff'
    });

    const stream = fs.createReadStream(safePath);
    stream.pipe(res);
  });
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    checkExistingInstance(running => {
      if (running) {
        console.log(`\n✓ Finance OS já está ativo em: ${APP_URL}`);
        openBrowser(APP_URL);
        process.exit(0);
      } else {
        console.error(`\n✖ A porta ${PORT} está ocupada por outro programa.`);
        console.error('Feche o programa ou defina a variável de ambiente PORT.');
        process.exit(1);
      }
    });
  } else {
    console.error('Erro no servidor:', err.message);
    process.exit(1);
  }
});

server.listen(PORT, HOST, () => {
  console.log('='.repeat(52));
  console.log('  FINANCE OS LOCAL (Node.js)');
  console.log(`  Endereço: ${APP_URL}`);
  console.log('  Dados 100% privados no navegador');
  console.log('  Pressione Ctrl+C para encerrar');
  console.log('='.repeat(52));

  setTimeout(() => openBrowser(APP_URL), 400);
});
