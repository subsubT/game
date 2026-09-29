import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const allowed = new Set(['1math3.html', 'firebase-config.js', 'teacher/index.html', 'teacher/tool.js', 'src/student/1math3.css', 'src/student/1math3.bundle.js']);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };
const port = Number(process.env.PORT || 5173);
createServer(async (req, res) => {
  const path = decodeURIComponent((req.url || '').split('?')[0]).replace(/^\/+/, '');
  if (!allowed.has(path)) { res.writeHead(404); res.end(); return; }
  try { const body = await readFile(resolve(root, path)); res.writeHead(200, { 'content-type': mime[extname(path)], 'cache-control': 'no-store' }); res.end(body); }
  catch { res.writeHead(404); res.end(); }
}).listen(port, '127.0.0.1', () => console.log(`Local student page: http://127.0.0.1:${port}/1math3.html`));
