// 点灯時の白飛び犯人探し: 要素を個別にOFFにして輝度を比較
import { chromium } from 'playwright-core';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.map': 'application/json' };
const server = http.createServer(async (req, res) => {
  try {
    const p = req.url === '/' ? '/index.html' : req.url.split('?')[0];
    const data = await readFile(join(ROOT, p));
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => server.listen(0, r));
const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  headless: true,
  args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader'],
});
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForFunction(() => window.__neon !== undefined);

// フローを強制的に点灯状態まで進める
await page.evaluate(async () => {
  const N = window.__neon;
  const { game, world, tube, fx } = N._refs;
  await N.selectShape('star');
});
await page.waitForFunction(() => window.__neon.state === 'HEAT', null, { timeout: 30000 });
await page.evaluate(() => {
  const N = window.__neon;
  const { game, world, tube } = N._refs;
  // 曲げ完了を直接セット
  game.t = 1; tube.setProgress(1); tube.finalize(); tube.showGuide(0);
  game.state = 'ADMIRE';
  game.darkness = 1; world.setDarkness(1);
  game.neon = 1;
});
await page.waitForTimeout(1200);

function offAll() {
  const N = window.__neon;
  N._refs.bloom.strength = 0;
  N._refs.world.neonLights.forEach((l) => (l.visible = false));
  N._refs.world.floorGlow.visible = false;
  N._refs.world.wallGlow.visible = false;
  N._refs.tube.haloMesh.visible = false;
  N._refs.tube.coreMesh.visible = false;
  N._refs.tube.glassMesh.visible = false;
  N._refs.fx.twinkles.points.visible = false;
  N._refs.game.neon = 0;
  N._refs.tube.setNeon(0, null);
}
const cases = [
  ['all-off', ''],
  ['+glass(neon1)', 'N._refs.tube.glassMesh.visible=true; N._refs.tube.setNeon(1, new (Object.getPrototypeOf(N._refs.tube.glassMat.emissive).constructor)(1,0.8,0.3));'],
  ['+core', 'N._refs.tube.coreMesh.visible=true; N._refs.tube.uniforms.uNeon.value=1;'],
  ['+halo', 'N._refs.tube.haloMesh.visible=true; N._refs.tube.uniforms.uNeon.value=1;'],
  ['+neonlights', 'N._refs.world.neonLights.forEach(l=>{l.visible=true; l.intensity=3.4;});'],
  ['+glowplanes', 'N._refs.world.floorGlow.visible=true; N._refs.world.floorGlow.material.opacity=0.34; N._refs.world.wallGlow.visible=true; N._refs.world.wallGlow.material.opacity=0.22;'],
  ['+bloom', 'N._refs.bloom.strength=1.35;'],
];
await page.evaluate(`(${offAll.toString()})()`);
for (const [name, js] of cases) {
  const lum = await page.evaluate((code) => {
    const N = window.__neon;
    eval(code);
    return N.luma();
  }, js);
  console.log(name.padEnd(14), 'avg=', lum.avg.toFixed(1), 'max=', lum.max);
  await page.screenshot({ path: join(ROOT, 'shots', `iso-${name.replace(/[^a-z0-9]/gi, '')}.png`) });
}
const info = await page.evaluate(() => {
  const N = window.__neon;
  const g = N._refs.tube.coreMesh.geometry;
  g.computeBoundingSphere();
  const pos = g.attributes.position.array;
  let nan = 0, mx = 0;
  for (let i = 0; i < pos.length; i++) { if (!isFinite(pos[i])) nan++; mx = Math.max(mx, Math.abs(pos[i])); }
  const uv = g.attributes.uv.array;
  let uvMax = 0; for (let i = 0; i < uv.length; i++) uvMax = Math.max(uvMax, Math.abs(uv[i]));
  return { r: g.boundingSphere.radius, nan, mx, uvMax, nVerts: pos.length / 3,
    camPos: [...N._refs.scene.children.length ? [0] : []],
  };
});
console.log('core geometry:', JSON.stringify(info));
// コア単独描画（シーン全部隠す）
const solo = await page.evaluate(() => {
  const N = window.__neon;
  const { scene, tube, bloom } = N._refs;
  scene.traverse((o) => { if (o.isMesh || o.isPoints || o.isSprite || o.isLight) o.visible = false; });
  tube.group.visible = true;
  tube.group.children.forEach((o) => (o.visible = false));
  tube.coreMesh.visible = true;
  bloom.strength = 0;
  return N.luma();
});
console.log('core solo:', JSON.stringify(solo));
await page.screenshot({ path: join(ROOT, 'shots', 'iso-solo.png') });
await page.screenshot({ path: join(ROOT, 'shots', 'isolate.png') });
await browser.close(); server.close();
