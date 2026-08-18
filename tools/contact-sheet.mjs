// Builds docs/ART_DIRECTION_CONTACT_SHEET.png from the golden screenshots —
// one glance tells a new agent what this piece looks like.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const golden = resolve('tests/visual/golden');
const lock = JSON.parse(readFileSync('docs/STYLE_LOCK.json', 'utf8'));
const img = (f) => `data:image/png;base64,${readFileSync(`${golden}/${f}`).toString('base64')}`;

const beats = [
  ['01-intro--iphone-portrait.png', '導入 — 静けさ'],
  ['02-first-drop--iphone-portrait.png', '一本を落とす'],
  ['03-waterfalls--iphone-portrait.png', '髪の滝が育つ'],
  ['04-petals--iphone-portrait.png', '編み目を花びらへ'],
  ['05-coil--iphone-portrait.png', '花へ巻く'],
  ['06-gem--iphone-portrait.png', '宝石ピン'],
  ['07-reveal--iphone-portrait.png', '完成 Reveal']
];
const wide = [
  ['01-intro--ipad-landscape.png', 'iPad 横 — Establish'],
  ['07-reveal--ipad-landscape.png', 'iPad 横 — Reveal']
];
const pal = lock.palette;
const swatches = ['skyTop', 'skyMid', 'skyLow', 'skyGlow', 'hairBase', 'hairSheen', 'dress', 'gemCore', 'uiLine']
  .map((k) => `<div class="sw"><i style="background:${pal[k]}"></i><span>${k}</span></div>`)
  .join('');

const html = `<!doctype html><meta charset="utf-8"><style>
  body { margin:0; background:${pal.skyTop}; color:${pal.uiInk};
         font-family:'Hiragino Maru Gothic ProN', sans-serif; width:1720px; }
  .wrap { padding:40px 48px; }
  h1 { font-weight:500; letter-spacing:.4em; font-size:26px; margin:0; }
  h2 { font-weight:400; letter-spacing:.15em; font-size:13px; color:${pal.uiLine}; margin:6px 0 22px; }
  .pal { display:flex; gap:14px; margin-bottom:26px; }
  .sw { text-align:center; font-size:10px; color:${pal.uiLine}; }
  .sw i { display:block; width:74px; height:30px; border-radius:3px; margin-bottom:4px;
          border:1px solid rgba(216,196,154,.35); }
  .row { display:flex; gap:14px; }
  .cell { flex:1; }
  .cell img { width:100%; border-radius:6px; display:block;
              border:1px solid rgba(216,196,154,.25); }
  .cap { font-size:11px; letter-spacing:.12em; color:${pal.uiLine}; margin:7px 0 16px; text-align:center; }
  .wide { display:flex; gap:14px; margin-top:4px; }
  .wide .cell { flex:1; }
</style><div class="wrap">
  <h1>ウォーターフォール・ヘアガーデン</h1>
  <h2>ART DIRECTION CONTACT SHEET — 夕暮れの水の庭 / Twilight Water Garden</h2>
  <div class="pal">${swatches}</div>
  <div class="row">${beats.map(([f, c]) => `<div class="cell"><img src="${img(f)}"><div class="cap">${c}</div></div>`).join('')}</div>
  <div class="wide">${wide.map(([f, c]) => `<div class="cell"><img src="${img(f)}"><div class="cap">${c}</div></div>`).join('')}</div>
</div>`;

const tmp = resolve('node_modules/.contact-sheet.html');
writeFileSync(tmp, html);
const browser = await chromium.launch({ executablePath: process.env.WHG_CHROMIUM ?? '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 1720, height: 900 }, deviceScaleFactor: 1 })).newPage();
await page.goto(`file://${tmp}`);
await page.screenshot({ path: 'docs/ART_DIRECTION_CONTACT_SHEET.png', fullPage: true });
await browser.close();
console.log('wrote docs/ART_DIRECTION_CONTACT_SHEET.png');
