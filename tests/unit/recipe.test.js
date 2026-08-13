// レシピ → 結晶 の純関数テスト。ブラウザなしで速く回る。
// 「操作を変えたら 結果が変わる」ことを、ここで機械的に押さえておく。

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSpec, emptyRecipe, COLORS, SHAPES, RARES, MAX_SEEDS } from '../../src/recipe.js';

const ring = (n, r = 0.45) =>
  Array.from({ length: n }, (_, i) => ({
    x: Math.cos((i / n) * Math.PI * 2) * r,
    z: Math.sin((i / n) * Math.PI * 2) * r,
  }));

const make = (patch) => buildSpec({ ...emptyRecipe(1234), ...patch });

test('おなじレシピなら、いつでも おなじ結晶', () => {
  const r = { seed: 42, amount: 3, seeds: ring(2), coolSpeed: 0.3, pour: 0.8, pullTemp: 0.55 };
  const a = buildSpec(r);
  const b = buildSpec(r);
  assert.deepEqual(a.crystals, b.crystals);
  assert.equal(a.key, b.key);
  assert.equal(a.waterline, b.waterline);
});

test('かけらの数を変えると 大きさが変わる', () => {
  const base = { seeds: [{ x: 0, z: 0 }], coolSpeed: 0.5, pour: 1, pullTemp: 0.5 };
  const small = make({ ...base, amount: 1 });
  const big = make({ ...base, amount: 5 });
  assert.ok(big.height > small.height * 1.4, `${big.height} vs ${small.height}`);
  assert.ok(big.width > small.width * 1.3, `${big.width} vs ${small.width}`);
});

test('冷やす速さを変えると 段の細かさが変わる', () => {
  const base = { amount: 4, seeds: [{ x: 0, z: 0 }], pour: 1, pullTemp: 0.5 };
  const slow = make({ ...base, coolSpeed: 0.05 });
  const fast = make({ ...base, coolSpeed: 0.95 });
  assert.ok(fast.maxLayers > slow.maxLayers, `fast=${fast.maxLayers} slow=${slow.maxLayers}`);
  // 急冷ほど 枠が細い＝空洞が深い
  assert.ok(fast.crystals[0].frameRatio < slow.crystals[0].frameRatio);
});

test('たねの数だけ 結晶ができる', () => {
  for (let n = 1; n <= MAX_SEEDS; n++) {
    const spec = make({ amount: 5, seeds: ring(n), coolSpeed: 0.5, pour: 1, pullTemp: 0.5 });
    assert.equal(spec.crystals.length, n);
  }
});

test('たねが近いと 取り合って小さくなる', () => {
  const far = make({ amount: 4, seeds: ring(2, 0.6), coolSpeed: 0.5, pour: 1, pullTemp: 0.5 });
  const near = make({ amount: 4, seeds: ring(2, 0.1), coolSpeed: 0.5, pour: 1, pullTemp: 0.5 });
  assert.ok(near.crystals[0].size < far.crystals[0].size);
});

test('引き上げ温度が 色を決める（6色ぜんぶ出せる）', () => {
  const got = new Set();
  for (let i = 0; i < 6; i++) {
    const spec = make({
      amount: 3,
      seeds: [{ x: 0, z: 0 }],
      coolSpeed: 0.5,
      pour: 1,
      pullTemp: i / 6 + 0.08,
    });
    got.add(spec.color);
  }
  assert.deepEqual([...got].sort(), [...COLORS].sort());
});

test('流す量が 虹の高さ（液面線）を決める', () => {
  const base = { amount: 3, seeds: [{ x: 0, z: 0 }], coolSpeed: 0.5, pullTemp: 0.8 };
  const half = make({ ...base, pour: 0.5 });
  const all = make({ ...base, pour: 1 });
  assert.ok(half.waterline > all.waterline);
  assert.equal(all.waterline, 0);
  assert.ok(half.waterline < half.height, 'ぜんぶ沈んでいたら 虹が見えない');
});

test('かたちが 4種類ぜんぶ 出せる', () => {
  const got = {
    tsumiki: make({ amount: 2, seeds: [{ x: 0, z: 0 }], coolSpeed: 0.05, pour: 1, pullTemp: 0.5 }),
    futago: make({ amount: 3, seeds: ring(2, 0.12), coolSpeed: 0.3, pour: 1, pullTemp: 0.5 }),
    takusan: make({ amount: 4, seeds: ring(3, 0.5), coolSpeed: 0.5, pour: 1, pullTemp: 0.5 }),
    tongari: make({ amount: 3, seeds: [{ x: 0, z: 0 }], coolSpeed: 0.98, pour: 1, pullTemp: 0.5 }),
  };
  for (const [want, spec] of Object.entries(got)) {
    assert.equal(spec.shape, want, `${want} のはずが ${spec.shape}`);
  }
  assert.deepEqual(Object.keys(got).sort(), [...SHAPES].sort());
});

test('レアは 運ではなく 操作の組み合わせで 出る（4種ぜんぶ）', () => {
  const cases = {
    oukan: { amount: 4, seeds: ring(5, 0.45), coolSpeed: 0.2, pour: 1, pullTemp: 0.5 },
    nijinoshin: { amount: 3, seeds: [{ x: 0, z: 0 }], coolSpeed: 0.5, pour: 0.52, pullTemp: 0.8 },
    tamagoishi: { amount: 5, seeds: [{ x: 0, z: 0 }], coolSpeed: 0.85, pour: 1, pullTemp: 0.3 },
    kyodaibashira: { amount: 5, seeds: [{ x: 0, z: 0 }], coolSpeed: 0.1, pour: 1, pullTemp: 0.3 },
  };
  for (const [want, recipe] of Object.entries(cases)) {
    const spec = make(recipe);
    assert.equal(spec.rare, want, `${want} のはずが ${spec.rare}`);
    assert.equal(spec.stars, 3);
    // 何度やっても おなじレアが出る＝親が教えられる
    assert.equal(make(recipe).rare, want);
  }
  assert.deepEqual(Object.keys(cases).sort(), [...RARES].sort());
});

test('ふつうに遊べば レアにはならない', () => {
  const spec = make({
    amount: 2,
    seeds: [{ x: 0.1, z: 0 }],
    coolSpeed: 0.5,
    pour: 0.9,
    pullTemp: 0.3,
  });
  assert.equal(spec.rare, null);
  assert.ok(spec.stars >= 1 && spec.stars <= 2);
});

test('どんな でたらめな入力でも こわれない（しっぱいなし）', () => {
  let rnd = 7;
  const next = () => (rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < 300; i++) {
    const n = Math.floor(next() * 7); // わざと 0 や 6 も入れる
    const spec = buildSpec({
      seed: Math.floor(next() * 1e9),
      amount: Math.floor(next() * 8) - 1,
      seeds: Array.from({ length: n }, () => ({ x: next() * 4 - 2, z: next() * 4 - 2 })),
      coolSpeed: next() * 2 - 0.5,
      pour: next() * 2 - 0.5,
      pullTemp: next() * 2 - 0.5,
    });
    assert.ok(spec.crystals.length >= 1 && spec.crystals.length <= MAX_SEEDS);
    assert.ok(spec.height > 0 && Number.isFinite(spec.height));
    assert.ok(spec.width > 0 && Number.isFinite(spec.width));
    assert.ok(COLORS.includes(spec.color));
    assert.ok(SHAPES.includes(spec.shape));
    assert.ok(spec.stars >= 1 && spec.stars <= 3);
    for (const c of spec.crystals) {
      assert.ok(c.layers >= 4 && c.layers <= 16, `layers=${c.layers}`);
      assert.ok(c.size > 0.05 && c.size < 0.5, `size=${c.size}`);
      assert.ok(Math.hypot(c.x, c.z) + c.size < 1.2, 'るつぼから はみ出さない');
    }
  }
});

test('遊び方を変えれば 結果も変わる（同じ石ばかりにならない）', () => {
  const plays = [
    { amount: 1, seeds: [{ x: 0, z: 0 }], coolSpeed: 0.1, pour: 1.0, pullTemp: 0.1 },
    { amount: 3, seeds: ring(2, 0.15), coolSpeed: 0.5, pour: 0.7, pullTemp: 0.4 },
    { amount: 5, seeds: ring(4, 0.45), coolSpeed: 0.9, pour: 0.5, pullTemp: 0.9 },
    { amount: 2, seeds: ring(3, 0.55), coolSpeed: 0.3, pour: 0.85, pullTemp: 0.65 },
    { amount: 4, seeds: [{ x: 0.2, z: 0.2 }], coolSpeed: 0.95, pour: 1.0, pullTemp: 0.25 },
  ];
  const keys = new Set(plays.map((p) => make(p).key));
  assert.equal(keys.size, plays.length, `かぶった: ${[...keys].join(', ')}`);
});
