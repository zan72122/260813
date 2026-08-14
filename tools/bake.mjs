// オフラインのレンダラー：ヘッドレス Chromium で重い per-pixel 計算を回し、
// 結果を assets/ に PNG として書き出す。実行時コストはゼロになる。
//
//   npm run bake          （事前に npm start でサーバを立てておく）
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = process.env.BASE_URL || 'http://127.0.0.1:8123';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'assets');
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  executablePath: process.env.CHROME_BIN || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
page.on('console', (m) => { if (m.type() === 'log') process.stdout.write(`\r  ${m.text()}          `); });
page.on('pageerror', (e) => { console.error('\n', e); });

await page.goto(`${BASE}/tools/bake.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__bakeReady, null, { timeout: 20000 });

console.log('焼き込み開始');
const files = await page.evaluate(() => window.__bake(), null);
const meta = await page.evaluate(() => window.__meta);

let total = 0;
for (const f of files) {
  const buf = Buffer.from(f.url.split(',')[1], 'base64');
  writeFileSync(join(OUT, f.name), buf);
  total += buf.length;
  console.log(`\n  ${f.name}  ${(buf.length / 1024).toFixed(0)} KB`);
}
writeFileSync(join(OUT, 'atlas.json'), JSON.stringify(meta, null, 2));
console.log(`\n合計 ${(total / 1024 / 1024).toFixed(2)} MB`);

await browser.close();
