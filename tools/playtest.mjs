// Interactive end-to-end playtest: plays the whole loop with real pointer
// gestures (no test-API shortcuts) and verifies every phase transition.
// Usage: node tools/playtest.mjs [--url http://localhost:5173/?fast=1]
import { chromium } from 'playwright';

const url = process.argv.includes('--url')
  ? process.argv[process.argv.indexOf('--url') + 1]
  : 'http://localhost:5173/?fast=1';

const browser = await chromium.launch({
  executablePath: process.env.WHG_CHROMIUM ?? '/opt/pw-browsers/chromium',
  args: ['--use-gl=angle', '--enable-unsafe-swiftshader']
});
const page = await (await browser.newContext({
  viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true
})).newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));

const fail = (msg) => {
  console.error('FAIL:', msg);
  process.exitCode = 1;
};

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__whg?.ready, null, { timeout: 20000 });

// intro → braid happens on its own
await page.waitForFunction(() => window.__whg.getPhase() === 'braid', null, { timeout: 15000 });
console.log('phase: braid');

const screenOf = (expr) =>
  page.evaluate((e) => {
    const g = window.__whg.game;
    // eslint-disable-next-line no-new-func
    const world = new Function('g', `return (${e})`)(g);
    const p = world.clone().project(g.rig.camera);
    return { x: ((p.x + 1) / 2) * innerWidth, y: ((1 - p.y) / 2) * innerHeight };
  }, expr);

async function drag(from, to, steps = 14, holdMs = 30) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    await page.mouse.move(
      from.x + ((to.x - from.x) * i) / steps,
      from.y + ((to.y - from.y) * i) / steps
    );
    await page.waitForTimeout(holdMs);
  }
  await page.mouse.up();
}

const waitIdle = () =>
  page.waitForFunction(() => !window.__whg.game['busy'], null, { timeout: 20000 });

// --- braid: cross / drop / pick, driven purely by gestures ---
let guard = 30;
while ((await page.evaluate(() => window.__whg.getPhase())) === 'braid' && guard-- > 0) {
  await waitIdle();
  const step = await page.evaluate(() => window.__whg.getBraidStep());
  const verb = await page.evaluate(() => {
    const S = ['cross', 'drop', 'pick', 'cross', 'drop', 'pick', 'cross', 'drop', 'pick', 'cross'];
    return S[window.__whg.getBraidStep()] ?? 'done';
  });
  if (verb === 'done') break;
  const front = await screenOf('g.hair.frontPoint()');
  if (verb === 'cross') {
    await drag({ x: front.x + 30, y: front.y + 10 }, { x: front.x - 110, y: front.y + 25 });
  } else if (verb === 'drop') {
    await drag({ x: front.x + 10, y: front.y + 20 }, { x: front.x + 25, y: front.y + 190 });
  } else {
    const pick = await screenOf('g.hair.pickStartPoint()');
    await page.mouse.click(pick.x, pick.y);
  }
  await page.waitForTimeout(400);
  await waitIdle();
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => window.__whg.getBraidStep());
  const phase = await page.evaluate(() => window.__whg.getPhase());
  console.log(`gesture ${verb}: step ${step} -> ${after} (phase ${phase})`);
  if (after === step && phase === 'braid') fail(`gesture ${verb} did not advance (step ${step})`);
}
if ((await page.evaluate(() => window.__whg.getPhase())) !== 'petal') fail('did not reach petal');
console.log('phase: petal');
await page.waitForTimeout(5200); // camera glide (slow under SwiftShader)

// --- petals: pull loops outward ---
for (let i = 0; i < 5; i++) {
  const phase = await page.evaluate(() => window.__whg.getPhase());
  if (phase !== 'petal') break;
  const target = await page.evaluate(() => {
    const g = window.__whg.game;
    for (let j = 0; j < g.hair.petalPulls.length; j++) if (g.hair.petalPulls[j] < 0.5) return j;
    return -1;
  });
  if (target < 0) break;
  const p = await screenOf(`g.hair.petalWorld(${target})`);
  await drag(p, { x: p.x + 120, y: p.y + 10 }, 10);
  const pull = await page.evaluate((j) => window.__whg.game.hair.petalPulls[j], target);
  console.log(`petal ${target}: pull=${pull.toFixed(2)}`);
  const phaseNow = await page.evaluate(() => window.__whg.getPhase());
  if (phaseNow !== 'petal') break; // 3 loops is enough by design — already moving on
  if (pull < 0.3) fail(`petal ${target} barely moved`);
  await page.waitForTimeout(900);
}
await page.waitForFunction(() => window.__whg.getPhase() === 'coil', null, { timeout: 10000 })
  .catch(() => fail('did not reach coil'));
console.log('phase: coil');
await page.waitForTimeout(5200);

// --- coil: circular strokes around the flower ---
for (let round = 0; round < 8; round++) {
  if ((await page.evaluate(() => window.__whg.getPhase())) !== 'coil') break;
  const c = await screenOf('g.hair.flowerCenter()');
  const R = 95;
  await page.mouse.move(c.x + R, c.y);
  await page.mouse.down();
  for (let i = 1; i <= 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    await page.mouse.move(c.x + Math.cos(a) * R, c.y + Math.sin(a) * R);
    await page.waitForTimeout(20);
  }
  await page.mouse.up();
  const coil = await page.evaluate(() => window.__whg.game.hair.coil);
  console.log(`coil round ${round}: ${coil.toFixed(2)}`);
}
await page.waitForFunction(() => window.__whg.getPhase() === 'gem', null, { timeout: 15000 })
  .catch(() => fail('did not reach gem'));
console.log('phase: gem');
await page.waitForTimeout(4500);

// Orientation flip mid-phase: state must survive.
await page.setViewportSize({ width: 844, height: 390 });
await page.waitForTimeout(1500);
const phaseAfterRotate = await page.evaluate(() => window.__whg.getPhase());
if (phaseAfterRotate !== 'gem') fail(`rotation lost state: ${phaseAfterRotate}`);
console.log('rotation survived: still gem');
await page.setViewportSize({ width: 390, height: 844 });
await page.waitForTimeout(1500);

// --- gem: drag to the flower's heart ---
{
  const g = await screenOf('g.gem.group.position');
  const c = await screenOf('g.hair.flowerCenter()');
  await drag(g, c, 18, 40);
}
await page.waitForFunction(() => window.__whg.getPhase() === 'reveal', null, { timeout: 20000 })
  .catch(() => fail('did not reach reveal'));
console.log('phase: reveal');

// --- replay appears and works ---
await page.waitForFunction(
  () => {
    const b = document.querySelector('button[aria-label="もういちど"]');
    return b && getComputedStyle(b).opacity > '0.5';
  },
  null,
  { timeout: 30000 }
).catch(() => fail('replay button did not appear'));
await page.click('button[aria-label="もういちど"]');
await page.waitForFunction(() => window.__whg.getPhase() === 'braid', null, { timeout: 15000 })
  .catch(() => fail('replay did not restart the loop'));
console.log('replay: back to braid — full loop OK');

await browser.close();
console.log(process.exitCode ? 'PLAYTEST FAILED' : 'PLAYTEST PASSED');
