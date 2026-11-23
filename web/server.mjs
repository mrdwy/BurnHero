// 生产运行：node server.mjs（先 npm run build）。PORT 环境变量可改端口，默认 8080。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleLlm } from './llm-proxy.mjs';

const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png',
  '.woff2': 'font/woff2', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.txt': 'text/plain; charset=utf-8' };

http.createServer((req, res) => {
  if (req.url.startsWith('/api/llm') && req.method === 'POST') return handleLlm(req, res);
  let p = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^(\.\.[\/\\])+/, '');
  let f = path.join(dist, p);
  if (!f.startsWith(dist) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': path.extname(f) === '.html' || path.basename(f) === 'sw.js' ? 'no-store' : 'no-cache' });
  fs.createReadStream(f).pipe(res);
}).listen(process.env.PORT || 8080, process.env.HOST || '127.0.0.1', () => console.log('燃脂勇者 running on http://localhost:' + (process.env.PORT || 8080)));
