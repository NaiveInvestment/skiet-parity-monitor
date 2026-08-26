// GitHub Actions: 장중 상시 폴러 — 25초마다 토스 시세를 live 브랜치 live.json 단일 커밋으로 강제 푸시.
// 크론 지연 보정을 위해 하루 여러 번 기동되며, 원격 live.json이 신선하면 standby로 대기하다
// active 폴러가 죽으면(60초 이상 미갱신) 이어받는다. 브랜치 히스토리는 항상 1커밋(무부모 commit-tree).
const { execSync } = require('child_process');
const fs = require('fs');
const { krQuote } = require('../quotes-lib');

const KR_CODES = ['361610', '096770'];
const TICK_MS = 25000;
const MAX_AGE_MS = 5.5 * 3600 * 1000; // 러너 6시간 한도 전에 자체 종료 → 다음 크론이 인계
const FRESH_MS = 60000;
const KST_OFFSET = 9 * 3600 * 1000;

const t0 = Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function kstHM() {
  const d = new Date(Date.now() + KST_OFFSET);
  return d.getUTCHours() * 100 + d.getUTCMinutes();
}

function sh(cmd, extraEnv) {
  return execSync(cmd, { env: { ...process.env, ...(extraEnv || {}) }, stdio: ['ignore', 'pipe', 'pipe'] })
    .toString().trim();
}

async function remoteAsOf() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/contents/live.json?ref=live`,
      { headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github.raw+json', 'User-Agent': 'live-poller' } }
    );
    if (!res.ok) return 0;
    const t = Date.parse((await res.json()).asOf);
    return Number.isNaN(t) ? 0 : t;
  } catch { return 0; }
}

function pushLive() {
  const env = { GIT_INDEX_FILE: '.git/live-index' };
  const blob = sh('git hash-object -w live.json');
  sh('git read-tree --empty', env);
  sh(`git update-index --add --cacheinfo 100644,${blob},live.json`, env);
  const tree = sh('git write-tree', env);
  const commit = sh(`git commit-tree ${tree} -m live`);
  sh(`git push -f -q origin ${commit}:refs/heads/live`);
}

async function main() {
  sh('git config user.name "github-actions[bot]"');
  sh('git config user.email "41898282+github-actions[bot]@users.noreply.github.com"');

  let active = false;
  while (true) {
    if (Date.now() - t0 > MAX_AGE_MS) { console.log('age limit — handing over'); break; }
    const hm = kstHM();
    if (hm >= 2005) { console.log('after 20:05 KST — done for today'); break; } // NXT 저녁 세션 마감
    if (hm < 855) { await sleep(60000); continue; } // 개장 전 대기

    if (!active) {
      const ts = await remoteAsOf();
      if (Date.now() - ts < FRESH_MS) { await sleep(60000); continue; } // 다른 폴러 active → standby
      active = true;
      console.log('taking over as active poller');
    }

    try {
      const results = await Promise.all(KR_CODES.map(krQuote));
      const kr = {};
      results.forEach((r, i) => { kr[KR_CODES[i]] = r; });
      fs.writeFileSync('live.json', JSON.stringify({ asOf: new Date().toISOString(), kr }));
      pushLive();
      console.log(new Date().toISOString(), kr['361610'].price, kr['096770'].price);
    } catch (e) {
      console.error('tick failed:', e && e.message ? e.message : e);
    }
    await sleep(TICK_MS);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
