// Capture the interaction chain from the brief at several viewports, for
// eyeballing composition. Run the dev server first: npm start.
// Colour, motion and FPS are NOT judgeable here — this renders on SwiftShader.
import { chromium } from 'playwright';
import { existsSync } from 'node:fs';
const exe = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome'].find(existsSync);
const b = await chromium.launch({ executablePath: exe, args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const out = (n) => new URL('./out/'+n+'.png', import.meta.url).pathname;
const wait = (p,m) => p.evaluate(x => new Promise(r=>setTimeout(r,x)), m);

// A: two taps -> interference, portrait
{
  const page = await (await b.newContext({ viewport:{width:430,height:900}, deviceScaleFactor:2, hasTouch:true })).newPage();
  page.on('pageerror', e=>console.log('ERR', String(e)));
  await page.goto('http://localhost:8080/?seed=4242', {waitUntil:'load'});
  await page.waitForFunction(()=>window.__lab, null, {timeout:20000});
  await page.evaluate(()=>{ const l=window.__lab; l.poke(0.34,0.40,0.5); l.poke(0.68,0.60,0.5); });
  await wait(page, 2400);
  await page.screenshot({path: out('st-two')});
  // drag
  await page.evaluate(async ()=>{ const l=window.__lab;
    for (let i=0;i<26;i++){ l.stroke(0.2+i*0.022, 0.30+i*0.010, 0.2+(i+1)*0.022, 0.30+(i+1)*0.010, 1, 0);
      await new Promise(r=>requestAnimationFrame(r)); } });
  await wait(page, 500);
  await page.screenshot({path: out('st-drag')});
  // force a flower open
  await page.evaluate(()=>{ const l=window.__lab; l.input.hasTouched=true; l.blooms.forEach((x,i)=>{ if(i<2){x.opened=true;} }); });
  await wait(page, 2200);
  await page.screenshot({path: out('st-open')});
  await page.close();
}
// A2: the finale flower of light
{
  const page = await (await b.newContext({ viewport:{width:430,height:900}, deviceScaleFactor:2, hasTouch:true })).newPage();
  await page.goto('http://localhost:8080/?seed=4242', {waitUntil:'load'});
  await page.waitForFunction(()=>window.__lab, null, {timeout:20000});
  await page.evaluate(() => { const l=window.__lab;
    l.input.hasTouched = true; l.sinceFinale = 99; l.sinceRelease = 99;
    l.input.activityLevel = 0; l.releaseAt = {u:0.5, v:0.5}; });
  // Long wait on purpose: this renderer manages ~8 fps and the frame-delta
  // clamp slows wall-clock animation, so the flower peaks much later here
  // than it does on real hardware.
  await wait(page, 9000);
  await page.screenshot({path: out('st-finale')});
  await page.close();
}

// B: landscape
{
  const page = await (await b.newContext({ viewport:{width:900,height:430}, deviceScaleFactor:2, hasTouch:true })).newPage();
  await page.goto('http://localhost:8080/?seed=99', {waitUntil:'load'});
  await page.waitForFunction(()=>window.__lab, null, {timeout:20000});
  await page.evaluate(()=>{ window.__lab.poke(0.45,0.5,0.5); });
  await wait(page, 2200);
  await page.screenshot({path: out('st-landscape')});
  await page.close();
}
// C: iPad
{
  const page = await (await b.newContext({ viewport:{width:820,height:1180}, deviceScaleFactor:2, hasTouch:true })).newPage();
  await page.goto('http://localhost:8080/?seed=12345', {waitUntil:'load'});
  await page.waitForFunction(()=>window.__lab, null, {timeout:20000});
  await page.evaluate(()=>{ window.__lab.poke(0.5,0.45,0.5); });
  await wait(page, 2200);
  await page.screenshot({path: out('st-ipad')});
  await page.close();
}
await b.close();
console.log('ok');
