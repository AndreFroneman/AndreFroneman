// Zero-dependency static server for Hollow Cordon.
// Usage (from the hollow-cordon folder):  node tools/serve.mjs [port]
import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = +(process.argv[2] || process.env.PORT || 8000);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

http.createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    const path = normalize(join(root, url === '/' ? 'index.html' : url));
    if (!path.startsWith(root)) { res.writeHead(403).end('Forbidden'); return; }
    const data = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Hollow Cordon running at http://localhost:${port}  (Ctrl+C to stop)`));
