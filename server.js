// Сервер связи для демо Tolqyn: передаёт запросы и тревоги между телефоном клиента и телефоном доверенного лица.
// Запуск: node server.js   (нужен только Node 16+, без установки пакетов). Порт: PORT или 8787.
// ВНИМАНИЕ: демо-сервер без авторизации, 6-значный код служит единственным «паролем». Для реального банка нужна нормальная аутентификация.
const http = require('http'), fs = require('fs'), path = require('path');
const PORT = process.env.PORT || 8787, FILE = path.join(__dirname, 'tolqyn-store.json'), TTL = 7 * 24 * 3600 * 1000;
let DB = { links: {}, reqs: {} };
try { DB = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { }
let dirty = false; const touch = () => { dirty = true; };
setInterval(() => {
  const now = Date.now(); for (const c of Object.keys(DB.reqs)) { for (const id of Object.keys(DB.reqs[c])) if (now - (DB.reqs[c][id].ts || 0) > TTL) { delete DB.reqs[c][id]; dirty = true; } }
  for (const c of Object.keys(DB.links)) if (now - (DB.links[c].ts || 0) > TTL) { delete DB.links[c]; dirty = true; }
  if (dirty) { try { fs.writeFileSync(FILE, JSON.stringify(DB)); } catch (e) { } dirty = false; }
}, 5000);
const H = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,PUT,PATCH,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json' };
const send = (res, code, body) => { res.writeHead(code, H); res.end(JSON.stringify(body)); };
const body = req => new Promise((ok, no) => { let b = ''; req.on('data', c => { b += c; if (b.length > 1e6) { no(new Error('big')); req.destroy(); } }); req.on('end', () => { try { ok(b ? JSON.parse(b) : {}); } catch (e) { no(e); } }); });
const clean = s => String(s || '').replace(/[^0-9a-zA-Z_-]/g, '').slice(0, 64);
http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') { res.writeHead(204, H); return res.end(); }
  const u = req.url.split('?')[0].split('/').filter(Boolean); // api, kind, code, id
  try {
    if (!u.length) return send(res, 200, { ok: true, service: 'tolqyn-relay' });
    if (u[0] !== 'api') return send(res, 404, { error: 'not found' });
    if (u[1] === 'ping') return send(res, 200, { ok: true });
    const code = clean(u[2]), id = clean(u[3]); if (!code && u[1] !== 'ping') return send(res, 400, { error: 'code' });
    if (u[1] === 'link' && req.method === 'GET') return send(res, 200, DB.links[code] || null);
    if (u[1] === 'link' && req.method === 'PUT') { const d = await body(req); DB.links[code] = { ...d, ts: Date.now() }; touch(); return send(res, 200, { ok: true }); }
    if (u[1] === 'reqs' && req.method === 'GET') return send(res, 200, Object.values(DB.reqs[code] || {}));
    if (u[1] === 'req' && req.method === 'PUT' && id) { const d = await body(req); (DB.reqs[code] = DB.reqs[code] || {})[id] = d; touch(); return send(res, 200, { ok: true }); }
    if (u[1] === 'req' && req.method === 'PATCH' && id) { const d = await body(req), m = DB.reqs[code] || {}; if (m[id]) m[id] = { ...m[id], ...d }; touch(); return send(res, 200, { ok: true }); }
    send(res, 404, { error: 'not found' });
  } catch (e) { send(res, 400, { error: String(e.message || e) }); }
}).listen(PORT, () => console.log('Tolqyn сервер связи: http://localhost:' + PORT));
