// SKIET 합병 패리티 모니터 — static file server + KR quote proxy (Node 18+, no deps)
// 토스/네이버 시세 API는 CORS를 막으므로 로컬에서는 이 서버가 프록시한다. (실시간 모드)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { krQuote, krMinutes } = require('./quotes-lib');

const PORT = Number(process.env.PORT) || 8788;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const send = (status, body, type = 'application/json; charset=utf-8') => {
    res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(body);
  };
  try {
    if (url.pathname === '/api/kr') {
      const codes = (url.searchParams.get('codes') || '').split(',').filter(Boolean);
      const results = await Promise.allSettled(codes.map(krQuote));
      const out = {};
      results.forEach((r, i) => { out[codes[i]] = r.status === 'fulfilled' ? r.value : { error: String(r.reason) }; });
      return send(200, JSON.stringify(out));
    }
    if (url.pathname === '/api/chart') {
      const codes = (url.searchParams.get('codes') || '').split(',').filter(Boolean);
      const results = await Promise.allSettled(codes.map(krMinutes));
      const out = {};
      results.forEach((r, i) => { out[codes[i]] = r.status === 'fulfilled' ? r.value : []; });
      return send(200, JSON.stringify(out));
    }
    let file = url.pathname === '/' ? '/index.html' : url.pathname;
    file = path.normalize(file).replace(/^([.][.][\\/])+/, '');
    const full = path.join(ROOT, file);
    if (!full.startsWith(ROOT) || !fs.existsSync(full) || fs.statSync(full).isDirectory()) {
      return send(404, JSON.stringify({ error: 'not found' }));
    }
    return send(200, fs.readFileSync(full), MIME[path.extname(full)] || 'application/octet-stream');
  } catch (e) {
    return send(500, JSON.stringify({ error: String(e) }));
  }
}).listen(PORT, () => console.log(`SKIET parity monitor: http://localhost:${PORT}`));
