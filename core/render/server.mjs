// 本地静态服务（Node）。渲染器和预览页都通过 http 加载 ES 模块（file:// 下无法 import）。
// 只监听 127.0.0.1。附带两个内部接口：
//   GET /__episodes  → episodes/ 下的期数列表
//   GET /__events    → 文件变化的 SSE 推送（预览页热重载用，watch: true 时启用）
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../paths.mjs';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.srt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
};

export function listEpisodes() {
  const dir = path.join(ROOT, 'episodes');
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(dir, d.name, 'episode.js')))
    .map(d => d.name)
    .sort();
}

export function startServer({ port = 0, watch = false } = {}) {
  const clients = new Set();
  let watcher = null;
  if (watch) {
    let timer = null;
    const changed = new Set();
    watcher = fs.watch(ROOT, { recursive: true }, (_, file) => {
      if (!file || /^(out|node_modules|\.cache|\.git)[\\/]/.test(file) || !/\.(js|json|html|css|png|jpg|webp|wav|mp3|woff2?)$/.test(file)) return;
      changed.add(file);
      clearTimeout(timer);
      timer = setTimeout(() => {
        const msg = `data: ${JSON.stringify([...changed])}\n\n`;
        changed.clear();
        for (const res of clients) res.write(msg);
      }, 120);
    });
  }

  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/__episodes') {
      res.writeHead(200, { 'content-type': MIME['.json'], 'cache-control': 'no-store' });
      return res.end(JSON.stringify(listEpisodes()));
    }
    if (url.pathname === '/__events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      res.write(': hello\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }
    let p = decodeURIComponent(url.pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.normalize(path.join(ROOT, p));
    if (!file.startsWith(ROOT + path.sep) || /[\\/](\.git|node_modules)[\\/]/.test(file)) {
      res.writeHead(403); return res.end('forbidden');
    }
    fs.stat(file, (err, st) => {
      if (err || !st.isFile()) { res.writeHead(404); return res.end('not found: ' + p); }
      res.writeHead(200, {
        'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
        'content-length': st.size,
        'cache-control': 'no-store',
      });
      fs.createReadStream(file).pipe(res);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      const { port: actual } = server.address();
      resolve({
        url: `http://127.0.0.1:${actual}`,
        port: actual,
        close: () => new Promise(r => {
          if (watcher) watcher.close();
          for (const c of clients) c.end();
          server.close(() => r());
          server.closeAllConnections?.();
        }),
      });
    });
  });
}
