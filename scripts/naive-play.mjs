/**
 * 「はじめて さわる子」のシミュレーション。
 *
 * デバッグ用の近道（solveCurrentTarget など）はつかわず、
 *  - 見えているボタンを ゆびで おす
 *  - ゆびで ぐるっと まわす
 *  - 画面の ピクセルを見て「お題の色に近くて、あかるい つぶ」をさがして さわる
 * だけで最後まで行けるかを確かめる。
 */
import { chromium } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const URL = process.env.SHOT_URL || 'http://127.0.0.1:4173/';
const OUT = path.join(process.cwd(), 'screenshots', 'naive');
fs.mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: 'iphone', width: 390, height: 844, dpr: 3 },
  { name: 'ipad-land', width: 1024, height: 768, dpr: 2 },
];

const log = [];
const say = (m) => {
  log.push(m);
  console.log(m);
};

/** 画面のまるい視野を格子状に見て、お題の色にいちばん近い明るい点をさがす */
async function findColorOnScreen(page, target) {
  return page.evaluate(({ target }) => {
    const c = document.getElementById('stage');
    const g = c.getContext('2d');
    const cs = getComputedStyle(document.documentElement);
    const dpr = c.width / c.getBoundingClientRect().width;
    const cx = parseFloat(cs.getPropertyValue('--field-cx'));
    const cy = parseFloat(cs.getPropertyValue('--field-cy'));
    const r = parseFloat(cs.getPropertyValue('--field-r'));

    const dist = (a, b) => {
      const dr = (a[0] - b[0]) / 255;
      const dg = (a[1] - b[1]) / 255;
      const db = (a[2] - b[2]) / 255;
      return Math.sqrt(0.3 * dr * dr + 0.5 * dg * dg + 0.2 * db * db);
    };

    let best = null;
    const step = Math.max(6, r / 22);
    for (let y = -r * 0.9; y <= r * 0.9; y += step) {
      for (let x = -r * 0.9; x <= r * 0.9; x += step) {
        if (Math.hypot(x, y) > r * 0.9) continue;
        const px = Math.round((cx + x) * dpr);
        const py = Math.round((cy + y) * dpr);
        if (px < 0 || py < 0 || px >= c.width || py >= c.height) continue;
        const d = g.getImageData(px, py, 1, 1).data;
        const col = [d[0], d[1], d[2]];
        const score = dist(col, target);
        if (!best || score < best.score) best = { score, x: cx + x, y: cy + y, col };
      }
    }
    return best;
  }, { target });
}

async function readSwatch(page) {
  return page.evaluate(() => {
    const bg = getComputedStyle(document.getElementById('quest-swatch')).backgroundColor;
    const m = bg.match(/(\d+),\s*(\d+),\s*(\d+)/);
    return m ? [+m[1], +m[2], +m[3]] : null;
  });
}

/** ゆびで 円をなぞって ステージを まわす */
async function spinByFinger(page, turns = 0.45) {
  const geo = await page.evaluate(() => {
    const cs = getComputedStyle(document.documentElement);
    return {
      cx: parseFloat(cs.getPropertyValue('--field-cx')),
      cy: parseFloat(cs.getPropertyValue('--field-cy')),
      r: parseFloat(cs.getPropertyValue('--field-r')),
    };
  });
  const rr = geo.r * 0.62;
  const steps = 14;
  await page.mouse.move(geo.cx + rr, geo.cy);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2 * turns;
    await page.mouse.move(geo.cx + Math.cos(a) * rr, geo.cy + Math.sin(a) * rr);
  }
  await page.mouse.up();
  await page.waitForTimeout(260);
}

const browser = await chromium.launch({
  executablePath: fs.existsSync('/opt/pw-browsers/chromium')
    ? '/opt/pw-browsers/chromium'
    : undefined,
});

let failed = false;

for (const dev of DEVICES) {
  say(`\n===== ${dev.name} (${dev.width}x${dev.height}) =====`);
  const ctx = await browser.newContext({
    viewport: { width: dev.width, height: dev.height },
    deviceScaleFactor: dev.dpr,
    isMobile: true,
    hasTouch: true,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(URL);
  await page.waitForFunction(() => typeof window.__game !== 'undefined');
  await page.waitForTimeout(500);

  // --- タイトルの「さがしもの」を ゆびで おす ---
  const tap = async (testid) => {
    const box = await page.getByTestId(testid).boundingBox();
    await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  };
  await tap('btn-quest');
  await page.waitForTimeout(500);
  say('タイトル → さがしもの: OK');

  // --- いしを えらぶ ---
  await tap('card-niji');
  say('プレパラートを えらんだ');

  // 自動カメラが おわるまで まつ（とばさない）
  await page.waitForFunction(() => window.__game.state().phase === 'observe', null, {
    timeout: 12_000,
  });
  say('顕微鏡の外観 → 接眼レンズの中へ、自動で入った');

  // --- ヒントが 出ることを たしかめる ---
  await page.waitForTimeout(2600);
  const coachShown = await page.getByTestId('coach').isVisible();
  say(`まよっていると ヒントが出る: ${coachShown ? 'OK' : 'NG'}`);
  if (!coachShown) failed = true;

  // --- にじスイッチ ---
  await tap('btn-polar');
  await page.waitForTimeout(900);
  const polarOn = (await page.evaluate(() => window.__game.state())).polarOn;
  say(`にじスイッチ: ${polarOn ? 'ON' : 'NG'}`);
  if (!polarOn) failed = true;

  // --- ゆびで まわす ---
  const before = (await page.evaluate(() => window.__game.state())).stageAngle;
  await spinByFinger(page, 0.5);
  const after = (await page.evaluate(() => window.__game.state())).stageAngle;
  const turned = Math.abs(after - before);
  say(`ゆびで まわした: ${turned.toFixed(2)} rad ${turned > 1 ? 'OK' : 'NG'}`);
  if (turned <= 1) failed = true;

  // --- 画面を見て、お題の色の つぶを さがして さわる ---
  for (let star = 1; star <= 3; star++) {
    const target = await readSwatch(page);
    let done = false;
    for (let attempt = 0; attempt < 8 && !done; attempt++) {
      const hit = await findColorOnScreen(page, target);
      if (hit && hit.score < 0.16) {
        await page.touchscreen.tap(hit.x, hit.y);
        await page.waitForTimeout(500);
        const st = await page.evaluate(() => window.__game.state());
        if (st.questIndex >= star) {
          say(
            `⭐${star}こめ: ${attempt + 1}回目のさがしで みつけた ` +
              `(お題 rgb(${target}) / さわった rgb(${hit.col}) ずれ ${hit.score.toFixed(3)})`,
          );
          done = true;
          break;
        }
      }
      // 見つからなければ すこし まわして さがしなおす
      await spinByFinger(page, 0.14);
    }
    if (!done) {
      say(`⭐${star}こめ: 見つけられなかった NG`);
      failed = true;
      break;
    }
    await page.waitForTimeout(900);
  }

  await page.waitForTimeout(1400);
  const cleared = await page.getByTestId('clear-title').isVisible();
  say(`「やったね！」が出た: ${cleared ? 'OK' : 'NG'}`);
  if (!cleared) failed = true;
  await page.screenshot({ path: path.join(OUT, `${dev.name}-cleared.png`) });

  // --- じゆうモード: きらきらを 見つけて さわれるか ---
  await tap('btn-other');
  await page.waitForTimeout(600);
  await tap('btn-select-back');
  await page.waitForTimeout(500);
  await tap('btn-free');
  await page.waitForTimeout(500);
  await tap('card-hoshizora');
  await page.waitForFunction(() => window.__game.state().phase === 'observe', null, {
    timeout: 12_000,
  });
  await tap('btn-polar');
  await page.waitForTimeout(900);

  let sparkleFound = false;
  for (let attempt = 0; attempt < 8 && !sparkleFound; attempt++) {
    // きらきらの 星は まっ白にひかる。いちばん白い点を さがして さわる。
    const star = await findColorOnScreen(page, [255, 255, 255]);
    if (star && star.score < 0.2) {
      await page.touchscreen.tap(star.x, star.y);
      await page.waitForTimeout(400);
      const n = Number(await page.getByTestId('free-count').textContent());
      if (n > 0) {
        say(`きらきらを タッチ: ${attempt + 1}回目で ✨${n} OK`);
        sparkleFound = true;
        break;
      }
    }
    await spinByFinger(page, 0.12);
  }
  if (!sparkleFound) {
    say('きらきらを タッチ: 見つけられなかった NG');
    failed = true;
  }

  if (errors.length) {
    say(`JS エラー: ${errors.join(' / ')}`);
    failed = true;
  } else {
    say('JS エラーなし');
  }

  await ctx.close();
}

await browser.close();
fs.writeFileSync(path.join(OUT, 'report.txt'), log.join('\n'));
console.log(failed ? '\n=> NG' : '\n=> ぜんぶ OK');
process.exit(failed ? 1 : 0);
