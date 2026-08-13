/**
 * 試遊用のスクリーンショット撮り。
 *   node scripts/shoot.mjs [出力ディレクトリ]
 * 事前に `npm run build && npm run preview` を起動しておくこと。
 */
import { chromium } from '@playwright/test';
import { existsSync, mkdirSync } from 'node:fs';

const OUT = process.argv[2] ?? 'test-results/visual';
const URL = process.env.SHOOT_URL ?? 'http://127.0.0.1:4173/?seed=7';
const EXE = '/opt/pw-browsers/chromium';

const SCREENS = [
  { name: 'iphone-p', width: 390, height: 844 },
  { name: 'iphone-l', width: 844, height: 390 },
  { name: 'ipad-l', width: 1024, height: 768 },
];

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch(
  existsSync(EXE) ? { executablePath: EXE } : {},
);

const drive = (page, fn) => page.evaluate(fn);
const step = (page, n, dt = 1 / 60) =>
  page.evaluate((a) => window.__lab.step(a.dt, a.n), { n, dt });

for (const s of SCREENS) {
  const page = await browser.newPage({
    viewport: { width: s.width, height: s.height },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  });
  await page.goto(URL);
  await page.waitForFunction(() => Boolean(window.__lab));
  // step() で論理時間を早送りすると CSS アニメーションのタイムラインが遅れる。
  // 追いつくまで実時間で待ってから撮る。
  const shot = async (n) => {
    await page.waitForTimeout(2200);
    await page.screenshot({ path: `${OUT}/${s.name}-${n}.png` });
  };

  // 1. タイトル（デモが虹を咲かせている）
  await step(page, 100);
  await shot('01-title');

  // 2. ラボ：はし
  await page.getByRole('button', { name: 'ラボ' }).click();
  await page.getByRole('button', { name: 'はし' }).click();
  await step(page, 150);
  await drive(page, () => window.__lab.pressAt(600, 440));
  await step(page, 90);
  await shot('02-lab-bridge');

  // 3. ラボ：はし＋おもり
  await drive(page, () => window.__lab.release());
  await step(page, 30);
  await drive(page, () => {
    window.__lab.press.x = 470;
    window.__lab.press.valid = true;
    window.__lab.addWeight();
  });
  await step(page, 90);
  await drive(page, () => {
    window.__lab.press.x = 760;
    window.__lab.press.valid = true;
    window.__lab.addWeight();
  });
  await step(page, 120);
  await shot('03-lab-weights');

  // 4. ラボ：アーチ
  await page.getByRole('button', { name: 'アーチ' }).click();
  await step(page, 150);
  await drive(page, () => window.__lab.pressAt(600, 420));
  await step(page, 90);
  await shot('04-lab-arch');

  // 5. ラボ：おはな
  await drive(page, () => window.__lab.release());
  await page.getByRole('button', { name: 'おはな' }).click();
  await step(page, 150);
  await drive(page, () => {
    const g = window.__lab;
    g.pressAt(g.specimen.hint.x, g.specimen.hint.y + 30);
  });
  await step(page, 90);
  await shot('05-lab-flower');

  // 6. チャレンジ選択
  await drive(page, () => window.__lab.release());
  await page.getByRole('button', { name: 'もどる' }).first().click();
  await page.getByRole('button', { name: 'チャレンジ' }).click();
  await step(page, 60);
  await shot('06-challenge-menu');

  // 7. くまさん（とちゅう）
  await page.getByRole('button', { name: 'くまさん' }).click();
  await step(page, 150);
  await drive(page, () => window.__lab.pressAt(600, 440));
  await step(page, 160);
  await shot('07-bear-mid');

  // 8. くまさん（クリア）
  await step(page, 400);
  await shot('08-bear-clear');

  // 9. アーチ（クリア）
  await drive(page, () => window.__lab.release());
  await page.getByRole('button', { name: 'もどる' }).first().click();
  await page.getByRole('button', { name: 'にじの あし' }).click();
  await step(page, 150);
  await drive(page, () => {
    const g = window.__lab;
    g.pressAt(g.specimen.hint.x, g.specimen.hint.y + 20);
  });
  await step(page, 260);
  await shot('09-arch-clear');

  // 10. おはな（クリア）
  await drive(page, () => window.__lab.release());
  await page.getByRole('button', { name: 'もどる' }).first().click();
  await page.getByRole('button', { name: 'にじの おはな' }).click();
  await step(page, 150);
  await drive(page, () => {
    const g = window.__lab;
    g.pressAt(g.specimen.hint.x, g.specimen.hint.y + 30);
  });
  await step(page, 300);
  await shot('10-flower-clear');

  await page.close();
  console.log('shot:', s.name);
}

await browser.close();
console.log('→', OUT);
