// Quick single-shot look at one URL. `node tools/peek.js "?view=caustic" name`
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const query = process.argv[2] || '';
const name = process.argv[3] || 'peek';
const waitMs = Number(process.argv[4] || 1500);
const OUT = new URL('./out/', import.meta.url).pathname;
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/opt/pw-browsers/chromium/chrome-linux/chrome']
  .find((p) => existsSync(p));

const browser = await chromium.launch({
  executablePath: exe,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
await mkdir(OUT, { recursive: true });
const ctx = await browser.newContext({ viewport: { width: Number(process.env.VW || 430), height: Number(process.env.VH || 900) }, deviceScaleFactor: 2, hasTouch: true });
const page = await ctx.newPage();
page.on('pageerror', (e) => console.log('pageerror:', String(e)));
page.on('console', (m) => console.log(m.type() + ':', m.text()));
await page.goto(`http://localhost:8080/${query}`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__lab, null, { timeout: 20000 }).catch(() => {});
if (process.env.POKE) {
  await page.evaluate((s) => { const [u, v] = s.split(',').map(Number); window.__lab.poke(u, v, 0.5); }, process.env.POKE);
}
await page.evaluate((m) => new Promise((r) => setTimeout(r, m)), waitMs);
const info = await page.evaluate(() => ({
  err: window.__labError || null,
  stats: window.__lab ? window.__lab.stats : null,
  caps: window.__lab ? window.__lab.caps : null,
  dist: window.__lab ? window.__lab.camera.distance : null,
  bbox: (() => {
    const l = window.__lab; if (!l) return null;
    const hw = l.pool[0]/2, hd = l.pool[1]/2;
    let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
    const m = l.camera.vp;
    for (let i=0;i<8;i++){
      const sx=(i&1)?hw:-hw, sz=(i&2)?hd:-hd, yy=(i&4)?-0.25:0;
      const w = m[3]*sx+m[7]*yy+m[11]*sz+m[15];
      const px=(m[0]*sx+m[4]*yy+m[8]*sz+m[12])/w, py=(m[1]*sx+m[5]*yy+m[9]*sz+m[13])/w;
      x0=Math.min(x0,px);x1=Math.max(x1,px);y0=Math.min(y0,py);y1=Math.max(y1,py);
    }
    return [x0.toFixed(2),x1.toFixed(2),y0.toFixed(2),y1.toFixed(2)];
  })(),
  pool: window.__lab ? window.__lab.pool.map(v=>v.toFixed(2)) : null,
}));
console.log(JSON.stringify(info));
await page.screenshot({ path: `${OUT}${name}.png` });
await browser.close();
