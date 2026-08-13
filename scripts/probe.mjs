import { chromium } from '@playwright/test';
const EXEC = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const browser = await chromium.launch({
  headless: true,
  executablePath: EXEC,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
page.on('pageerror', (e) => console.log('ERR', e.message));
await page.goto('http://localhost:4173/?e2e=1&seed=12345');
await page.waitForFunction(() => window.__ui && window.__ui.ready);

const out = await page.evaluate(async () => {
  const g = window.__game;
  g.setStage(2);
  g.parts[0].tx = 0; g.parts[0].ty = -0.02; g.parts[0].x = 0; g.parts[0].y = -0.02;
  for (let i = 0; i < 300; i++) g.turn(0.06, 1 / 60);
  g.ringVel = 0; g.ringAngle = Math.PI / 2;
  g.ring.o = 1; g.ring.r = 1.06; g.ring.w = 0.10;
  g.cam.z = 0.78; g.cam.x = 0; g.cam.y = 0; g.cam.vz = 0;
  await new Promise((r) => setTimeout(r, 600));

  const c = document.getElementById('gl');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  const px = new Uint8Array(4);
  const sample = (nx, ny) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(Math.round(nx * c.width), Math.round(ny * c.height), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    return [px[0], px[1], px[2]];
  };
  return {
    canvas: [c.width, c.height],
    ver: gl.getParameter(gl.VERSION),
    halfFloat: !!(gl.getExtension('EXT_color_buffer_half_float') || gl.getExtension('EXT_color_buffer_float')),
    quality: g.quality,
    post: Array.from(window.__uniPost || []),
    totalRot: g.totalRot, ringAngle: g.ringAngle, stage: g.stage, uniPol: Array.from(window.__uniPol||[]),
    charge: g.charge,
    ringO: g.ring.o, camZ: g.cam.z,
    // y is bottom-up for readPixels
    apertureLeft: sample(0.22, 0.5),
    apertureRight: sample(0.78, 0.5),
    centre: sample(0.5, 0.5),
    panelTop: sample(0.5, 0.78),
    corner: sample(0.06, 0.5),
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
