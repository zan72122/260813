import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FRINGE_LUT, LUT_LAST, LUT_MAX_ORDER, LUT_SCALE } from '../../src/render/lut.ts';

/** フリンジ次数 N の色を引く（描画側と同じ計算） */
function colorAt(n: number): [number, number, number] {
  let i = (n * LUT_SCALE) | 0;
  i = Math.max(0, Math.min(LUT_LAST / 3, i));
  return [FRINGE_LUT[i * 3], FRINGE_LUT[i * 3 + 1], FRINGE_LUT[i * 3 + 2]];
}

const brightness = (c: [number, number, number]): number => Math.max(c[0], c[1], c[2]);
const saturation = (c: [number, number, number]): number =>
  Math.max(c[0], c[1], c[2]) - Math.min(c[0], c[1], c[2]);

test('力ゼロはまっ黒（直交ニコルで消える）', () => {
  assert.deepEqual(colorAt(0), [0, 0, 0]);
  assert.ok(brightness(colorAt(0.02)) < 6);
});

test('次数が上がると色がつき、虹が何周もする', () => {
  // 1次のうちに、青→緑→黄→赤 と一周ぶんの色みが出る
  const hues = [0.4, 0.6, 0.82, 1.0].map(colorAt);
  for (const c of hues) assert.ok(saturation(c) > 90, `色がついている: ${c}`);
  // 青っぽい → 赤っぽい へ入れかわる
  assert.ok(hues[0][2] > hues[0][0], '0.4次は青より');
  assert.ok(hues[3][0] > hues[3][2], '1.0次は赤より');
  // 2周目にも赤がもどってくる（周期性）
  assert.ok(colorAt(2.05)[0] > colorAt(2.05)[2]);
});

test('高い次数ほど淡くなる（実物と同じ）', () => {
  assert.ok(saturation(colorAt(4)) < saturation(colorAt(1)));
  assert.ok(brightness(colorAt(4)) > 180, '高次は白っぽく明るい');
});

test('LUT からはみ出さない', () => {
  assert.equal(FRINGE_LUT.length, LUT_LAST + 3);
  for (const n of [-5, 0, LUT_MAX_ORDER, 99]) {
    const c = colorAt(n);
    for (const ch of c) assert.ok(Number.isFinite(ch) && ch >= 0 && ch <= 255);
  }
  assert.deepEqual(colorAt(99), colorAt(LUT_MAX_ORDER));
});
