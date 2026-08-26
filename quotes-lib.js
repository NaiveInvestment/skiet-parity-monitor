// Shared quote fetchers — used by server.js (local proxy) and scripts/fetch-quotes.js (GitHub Actions)
// Primary: Toss Invest unofficial API (실시간, KRX+NXT 통합 시세)
// Fallback: Naver mobile API — 토스는 비공식이라 언제든 막힐 수 있음
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

async function tossDetail(productCode) {
  const j = await fetchJson(`https://wts-info-api.tossinvest.com/api/v2/stock-prices/${encodeURIComponent(productCode)}`);
  if (!j.result || j.result.close == null) throw new Error('toss: empty result ' + productCode);
  return j.result;
}

async function krQuoteToss(code) {
  const r = await tossDetail('A' + code);
  return {
    code,
    price: r.close,
    prevClose: r.base ?? null,
    changePct: r.base ? Math.round((r.close / r.base - 1) * 10000) / 100 : null,
    marketState: r.tradingSuspended ? 'SUSPENDED' : 'OPEN',
    src: 'toss',
  };
}

async function krQuoteNaver(code) {
  const b = await fetchJson(`https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}/basic`);
  const num = (s) => (s == null ? null : Number(String(s).replace(/,/g, '')));
  return {
    code,
    name: b.stockName,
    price: num(b.closePrice),
    prevClose: null,
    changePct: num(b.fluctuationsRatio),
    marketState: b.marketStatus || null,
    src: 'naver',
  };
}

async function krQuote(code) {
  try { return await krQuoteToss(code); } catch (e) { /* fall through */ }
  return krQuoteNaver(code);
}

// 당일 분봉 (Naver fchart, EUC-KR XML이지만 숫자 필드만 쓰므로 안전)
async function krMinutes(code) {
  const res = await fetch(`https://fchart.stock.naver.com/sise.nhn?symbol=${encodeURIComponent(code)}&timeframe=minute&count=600&requestType=0`, {
    headers: { 'User-Agent': UA },
  });
  if (!res.ok) throw new Error(`${res.status} fchart ${code}`);
  const txt = await res.text();
  const pts = [];
  const re = /data="(\d{12})\|[^|]*\|[^|]*\|[^|]*\|(\d+)\|/g;
  let m;
  while ((m = re.exec(txt))) pts.push({ t: m[1], c: Number(m[2]) });
  if (!pts.length) throw new Error('fchart empty ' + code);
  const day = pts[pts.length - 1].t.slice(0, 8);
  return pts.filter((p) => p.t.slice(0, 8) === day);
}

module.exports = { krQuote, krMinutes };
