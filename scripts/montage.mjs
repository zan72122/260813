// Contact sheet of a folder of stills, so a whole set can be eyeballed at once.
import { chromium } from '@playwright/test';
import { readdirSync, readFileSync } from 'node:fs';

const dir = process.argv[2] || 'shots/variety';
const out = process.argv[3] || 'shots/_montage.png';
const cols = Number(process.argv[4] || 4);
const files = readdirSync(dir).filter((f) => f.endsWith('.png')).sort();
const imgs = files
  .map((f) => `<figure><img src="data:image/png;base64,${readFileSync(`${dir}/${f}`).toString('base64')}"><figcaption>${f}</figcaption></figure>`)
  .join('');
const html = `<body style="margin:0;background:#111;display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px">
<style>figure{margin:0}img{width:100%;display:block}figcaption{color:#aaa;font:11px monospace;text-align:center}</style>${imgs}</body>`;

const b = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
});
const p = await b.newPage({ viewport: { width: 1400, height: 200 } });
await p.setContent(html);
await p.screenshot({ path: out, fullPage: true });
await b.close();
console.log('montage →', out);
