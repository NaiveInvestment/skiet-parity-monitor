// GitHub Actions: fetch KR quotes and write quotes.json for the static (GitHub Pages) build.
// Codes must match CONFIG in index.html.
const fs = require('fs');
const path = require('path');
const { krQuote } = require('../quotes-lib');

const KR_CODES = ['361610', '096770'];

async function main() {
  const results = await Promise.allSettled(KR_CODES.map(krQuote));
  const kr = {};
  results.forEach((r, i) => { if (r.status === 'fulfilled') kr[KR_CODES[i]] = r.value; });

  if (Object.keys(kr).length < KR_CODES.length) {
    console.error(`quote fetch failed: kr=${Object.keys(kr).length}/${KR_CODES.length}`);
    process.exit(1); // fail the workflow → previous deployment stays live
  }
  const out = { asOf: new Date().toISOString(), kr };
  fs.writeFileSync(path.join(__dirname, '..', 'quotes.json'), JSON.stringify(out));
  console.log(`quotes.json written: 361610=${kr['361610'].price} 096770=${kr['096770'].price}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
