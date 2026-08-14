// 水シミュレーションの単体テスト（ブラウザ不要）。
// ゲームの主張「同じ雨・ひとつの介入・ちがう結果」をここで守る。

import test from 'node:test';
import assert from 'node:assert/strict';

import { createCity, TT, idx, canDig, digAt, clearDig } from '../../src/city.js';
import { createSim, resetWater, stepSim, openDrain, setWall, RUN_TICKS } from '../../src/sim.js';

function freshCity() {
  const city = createCity();
  const sim = createSim(city);
  return { city, sim };
}

function restore(city, sim) {
  clearDig(city);
  for (const d of city.drains) {
    d.state = d.id === 'plaza' ? 'clogged' : d.id === 'big' ? 'closed' : 'open';
    d.flow = 0;
    if (d.id === 'plaza') d.leaves = 9;
  }
  setWall(sim, null);
  resetWater(sim);
}

function runTicks(sim, n) {
  for (let i = 0; i < n; i++) stepSim(sim);
  return sim;
}

function landWater(sim) {
  let s = 0;
  for (let i = 0; i < sim.d.length; i++) if (sim.city.type[i] !== TT.RIVER) s += sim.d[i];
  return s;
}

test('街の形: ひろばが街でいちばん低く、地下入口のふちはひろばの底より高い', () => {
  const { city } = freshCity();
  const low = city.ground[idx(city.low.x, city.low.y)];
  const lip = city.ground[idx(city.entrance.x0 - 1, city.entrance.y0)];
  assert.equal(city.type[idx(city.entrance.x0 - 1, city.entrance.y0)], TT.LIP);
  assert.ok(lip > low, `ふち(${lip}) はひろばの底(${low}) より高いはず`);

  // ひろばの外の道路はひろばより高い
  const road = city.ground[idx(city.low.x, city.plaza.y0 - 4)];
  assert.ok(road > low + 0.1, '道路はひろばより高いはず');

  // 建物は水が入れない
  const b = city.buildings[0];
  assert.equal(city.solid[idx(b.x0, b.y0)], 1);
});

test('排水口は 3 つ。最初は「詰まり」「ふた」「あいてる」', () => {
  const { city } = freshCity();
  assert.equal(city.drains.length, 3);
  assert.equal(city.drains.find((d) => d.id === 'plaza').state, 'clogged');
  assert.equal(city.drains.find((d) => d.id === 'big').state, 'closed');
  assert.equal(city.drains.find((d) => d.id === 'north').state, 'open');
});

test('水はこわれない: 負の水深も NaN も出ない', () => {
  const { sim } = freshCity();
  runTicks(sim, 700);
  for (let i = 0; i < sim.d.length; i++) {
    assert.ok(Number.isFinite(sim.d[i]), `d[${i}] が有限でない`);
    assert.ok(sim.d[i] >= 0, `d[${i}] が負`);
  }
  assert.ok(Number.isFinite(sim.stats.under));
});

test('水は高い所から低い所へ行く: ひろばの底に集まる', () => {
  const { city, sim } = freshCity();
  runTicks(sim, 900);
  const atHigh = sim.d[idx(80, 10)];   // 街の高い角の街区
  assert.ok(sim.stats.plaza > 0.08, `ひろばに水がたまるはず (${sim.stats.plaza})`);
  assert.ok(sim.stats.plaza > atHigh * 5, 'ひろばの水は高い所よりずっと深いはず');
  assert.ok(city.ground[idx(city.low.x, city.low.y)] < city.ground[idx(80, 10)],
    'ひろばの底は街の高い所より低いはず');
});

test('同じ雨は何度でも同じ: 2 回まわして結果が一致する', () => {
  const { city, sim } = freshCity();
  restore(city, sim);
  runTicks(sim, 800);
  const a = { under: sim.stats.under, land: landWater(sim), d: Float32Array.from(sim.d) };

  restore(city, sim);
  runTicks(sim, 800);
  const b = { under: sim.stats.under, land: landWater(sim), d: sim.d };

  assert.equal(a.under, b.under);
  assert.equal(a.land, b.land);
  for (let i = 0; i < a.d.length; i += 37) assert.equal(a.d[i], b.d[i], `セル ${i} がちがう`);
});

test('何もしないと、水は地下入口へ入ってしまう', () => {
  const { city, sim } = freshCity();
  restore(city, sim);
  runTicks(sim, RUN_TICKS);
  assert.ok(sim.stats.under > 25, `地下に入る水 (${sim.stats.under}) が少なすぎる`);
  assert.ok(sim.flags.overflow > 0, '越流のタイミングが記録されるはず');
  assert.ok(sim.flags.overflow > 300 && sim.flags.overflow < 1100,
    `越流は途中で起きてほしい (t=${sim.flags.overflow})`);
});

test('詰まった排水口をそうじすると、同じ雨でも地下が守られる', () => {
  const { city, sim } = freshCity();
  restore(city, sim);
  runTicks(sim, RUN_TICKS);
  const before = sim.stats.under;

  restore(city, sim);
  openDrain(sim, 'plaza');   // ← たったひとつの介入
  resetWater(sim);
  runTicks(sim, RUN_TICKS);
  const after = sim.stats.under;

  assert.ok(after < before * 0.05,
    `そうじ後 (${after.toFixed(1)}) は そうじ前 (${before.toFixed(1)}) のほぼゼロであってほしい`);
  assert.ok(sim.stats.drained > 40, '排水口がたくさん飲みこむはず');
});

test('大きな排水口のふたを開けても、水の行き先は変わる', () => {
  const { city, sim } = freshCity();
  restore(city, sim);
  runTicks(sim, RUN_TICKS);
  const before = sim.stats.under;

  restore(city, sim);
  openDrain(sim, 'big');
  resetWater(sim);
  runTicks(sim, RUN_TICKS);

  assert.ok(sim.stats.under < before * 0.8, '地下へ行く水が減るはず');
  assert.ok(sim.stats.drained > 20, '大きな排水口が水を横取りするはず');
});

test('壁を置くと、濡れる場所そのものが変わる', () => {
  const { city, sim } = freshCity();
  restore(city, sim);
  runTicks(sim, RUN_TICKS);
  const beforeWet = sim.stats.wet;
  const beforeUnder = sim.stats.under;

  restore(city, sim);
  setWall(sim, { x: 40, y: 51, horizontal: true, len: 11 }); // ひろばの入口をふさぐ
  resetWater(sim);
  runTicks(sim, RUN_TICKS);

  assert.ok(sim.stats.under < beforeUnder * 0.9, '地下へ行く水が減るはず');
  assert.ok(sim.stats.wet > beforeWet * 1.15,
    `せき止められた水は別の所へ行くはず (${beforeWet} → ${sim.stats.wet})`);
});

test('RESET は水だけ消す。介入（排水口・壁）はのこる', () => {
  const { city, sim } = freshCity();
  restore(city, sim);
  openDrain(sim, 'plaza');
  setWall(sim, { x: 40, y: 51, horizontal: true, len: 11 });
  runTicks(sim, 300);
  assert.ok(landWater(sim) > 1);

  resetWater(sim);
  assert.equal(sim.tick, 0);
  assert.ok(landWater(sim) < 0.001, '陸の水はゼロになるはず');
  assert.equal(city.drains.find((d) => d.id === 'plaza').state, 'open');
  assert.equal(city.walls.length, 1);
});

test('川はいつも流れていて、浮いたものが乗る', () => {
  const { city, sim } = freshCity();
  restore(city, sim);
  let river = 0;
  for (let i = 0; i < sim.d.length; i++) if (city.type[i] === TT.RIVER) river += sim.d[i];
  assert.ok(river > 50, '最初から川には水がある');
  assert.ok(sim.floaters.length > 10, '流れを見せる浮遊物がある');
});

test('1 tick の計算が十分に速い（モバイルで 60fps を保つため）', () => {
  const { city, sim } = freshCity();
  restore(city, sim);
  runTicks(sim, 600);            // 水が多い状態にしてから測る
  const t0 = performance.now();
  runTicks(sim, 200);
  const per = (performance.now() - t0) / 200;
  assert.ok(per < 4, `1 tick あたり ${per.toFixed(2)}ms は遅すぎる`);
});

// ---------------- 分岐点を増やしたぶんのテスト ----------------

test('みぞをほると、水は掘った線にそって流れ、地下へ行く水が減る', () => {
  const { city, sim } = freshCity();
  restore(city, sim);
  runTicks(sim, RUN_TICKS);
  const before = sim.stats.under;

  restore(city, sim);
  // ひろばへ向かう道の水を、みぞで横取りして川のほうへ流す
  let dug = 0;
  for (let k = 0; k <= 66; k++) dug += digAt(city, 44 - k * 0.45, 51 - k * 0.03, 2.4);
  assert.ok(dug > 80, `みぞがほれているはず (${dug} セル)`);
  resetWater(sim);
  runTicks(sim, RUN_TICKS);

  assert.ok(sim.stats.under < before * 0.5,
    `みぞで半分以下になってほしい (${before.toFixed(1)} → ${sim.stats.under.toFixed(1)})`);
});

test('ほれるのは地面だけ。建物・川・地下入口はほれない', () => {
  const { city } = freshCity();
  const b = city.buildings[0];
  assert.equal(canDig(city, b.x0 + 1, b.y0 + 1), false, '建物はほれない');
  assert.equal(canDig(city, city.river.x0 + 2, 40), false, '川はほれない');
  assert.equal(canDig(city, city.entrance.x0 + 1, city.entrance.y0 + 1), false, '地下入口はほれない');
  assert.equal(canDig(city, city.low.x, city.plaza.y0 - 4), true, '道路はほれる');
});

test('スコップには限りがあり、使うと減る。もどせば戻る', () => {
  const { city } = freshCity();
  clearDig(city);
  const start = city.digLeft;
  const n = digAt(city, 40, 30, 2.0);
  assert.ok(n > 0);
  assert.equal(city.digLeft, start - n);
  clearDig(city);
  assert.equal(city.digLeft, start);
  assert.equal(city.dig.indexOf(1), -1, 'みぞは消えているはず');
});

test('裏目: 壁で入口をふさぐと地下は守られるが、こうえんの前が水びたしになる', () => {
  const { city, sim } = freshCity();
  restore(city, sim);
  runTicks(sim, RUN_TICKS);
  const base = { under: sim.stats.watch.under, play: sim.stats.watch.play };

  restore(city, sim);
  setWall(sim, { x: 40, y: 51, horizontal: true, len: 11 });
  resetWater(sim);
  runTicks(sim, RUN_TICKS);

  assert.ok(sim.stats.watch.under < base.under * 0.6,
    `地下は守られるはず (${base.under.toFixed(2)} → ${sim.stats.watch.under.toFixed(2)})`);
  assert.ok(base.play < 0.1 && sim.stats.watch.play > 0.4,
    `こうえんは、壁を置いたときだけ沈むはず (${base.play.toFixed(2)} → ${sim.stats.watch.play.toFixed(2)})`);
});

test('土のうは 3 つまで置ける。2 つで両方の入口をふさぐと地下は守りきれる', () => {
  const { city, sim } = freshCity();
  restore(city, sim);
  setWall(sim, { x: 40, y: 51, horizontal: true, len: 11 });
  setWall(sim, { x: 41, y: 76, horizontal: true, len: 11 });
  assert.equal(city.walls.length, 2);
  resetWater(sim);
  runTicks(sim, RUN_TICKS);
  assert.ok(sim.stats.watch.under < 0.05,
    `両方ふさげば地下は無事のはず (${sim.stats.watch.under.toFixed(2)})`);

  for (let k = 0; k < 4; k++) setWall(sim, { x: 30 + k, y: 30, horizontal: true, len: 11 });
  assert.equal(city.walls.length, 3, '3 つをこえては置けない');
});

test('排水口はふたを開け閉めできる（何度でも試せる）', () => {
  const { city, sim } = freshCity();
  restore(city, sim);
  const big = city.drains.find((d) => d.id === 'big');
  assert.equal(big.state, 'closed');
  openDrain(sim, 'big');
  assert.equal(big.state, 'open');
  big.state = 'closed';
  assert.equal(big.state, 'closed');
  openDrain(sim, 'big');
  assert.equal(big.state, 'open');
});
