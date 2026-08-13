import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StressField, type Anchor, type Beam } from '../../src/sim/stress.ts';

/** 橋げたと同じ配置（支えは左右2つ、中立軸は板のまん中） */
const ANCHORS: Anchor[] = [
  { x: 350, y: 508 },
  { x: 850, y: 508 },
];
const BEAM: Beam = { x0: 350, x1: 850, yc: 469 };

test('力がかかっていなければ、どこもまっ黒（フリンジ次数 0）', () => {
  const f = new StressField();
  f.update([], ANCHORS);
  assert.equal(f.sample(600, 470), 0);
  assert.equal(f.sample(350, 508), 0);

  // 大きさ 0 の荷重も無視される
  f.update([{ x: 600, y: 470, f: 0 }], ANCHORS);
  assert.equal(f.sample(600, 470), 0);
});

test('押した所がいちばん明るく、離れるほど暗くなる', () => {
  const f = new StressField();
  f.update([{ x: 600, y: 470, f: 4 }], ANCHORS);
  const at0 = f.sample(600, 470);
  const at60 = f.sample(660, 470);
  const at200 = f.sample(800, 470);
  assert.ok(at0 > at60, `${at0} > ${at60}`);
  assert.ok(at60 > at200, `${at60} > ${at200}`);
  assert.ok(at0 > 3, `接触点はまぶしい: ${at0}`);
});

test('まん中を押すと、縞は左右対称になる', () => {
  const f = new StressField();
  f.update([{ x: 600, y: 470, f: 4 }], ANCHORS);
  assert.ok(Math.abs(f.sample(500, 470) - f.sample(700, 470)) < 1e-9);
  assert.ok(Math.abs(f.sample(350, 508) - f.sample(850, 508)) < 1e-9);
});

test('支点にも縞が出る。近い支えほど強く受け持つ（てこ）', () => {
  const f = new StressField();
  f.update([{ x: 420, y: 470, f: 4 }], ANCHORS);
  const left = f.sample(350, 508);
  const right = f.sample(850, 508);
  assert.ok(left > 0.5, `近い支えに縞: ${left}`);
  assert.ok(left > right * 3, `近い支えのほうがずっと強い: ${left} vs ${right}`);
});

test('支えを動かすと縞のかたちが変わる', () => {
  const f = new StressField();
  const load = [{ x: 600, y: 470, f: 4 }];
  f.update(load, ANCHORS);
  const wide = f.sample(500, 490);
  f.update(load, [
    { x: 500, y: 508 },
    { x: 700, y: 508 },
  ]);
  const narrow = f.sample(500, 490);
  assert.ok(Math.abs(wide - narrow) > 0.2, `${wide} vs ${narrow}`);
});

test('はりの曲げ：中立軸だけ黒くのこり、上下に縞がたまる', () => {
  const f = new StressField();
  const loads = [{ x: 600, y: 440, f: 4 }];

  f.update(loads, ANCHORS, null);
  const plainBottom = f.sample(500, 500);
  const plainAxis = f.sample(500, BEAM.yc);
  const plainOutside = f.sample(300, 500);

  f.update(loads, ANCHORS, BEAM);
  const bentBottom = f.sample(500, 500);
  const bentAxis = f.sample(500, BEAM.yc);
  const bentOutside = f.sample(300, 500);

  // 中立軸から離れた所は曲げのぶんだけ明るくなる
  assert.ok(bentBottom - plainBottom > 0.05, `曲げの寄与: ${bentBottom - plainBottom}`);
  // 中立軸ぴったりでは曲げの寄与はゼロ
  assert.ok(Math.abs(bentAxis - plainAxis) < 1e-9);
  // 支点の外（片持ち部分）では曲げモーメントがゼロ
  assert.ok(Math.abs(bentOutside - plainOutside) < 1e-9);
});

test('曲げモーメントは支点で0・荷重点で最大', () => {
  const f = new StressField();
  const loads = [{ x: 600, y: 440, f: 4 }];
  const bend = (x: number): number => {
    f.update(loads, ANCHORS, BEAM);
    const withBeam = f.sample(x, 500);
    f.update(loads, ANCHORS, null);
    return withBeam - f.sample(x, 500);
  };
  const atSupport = bend(350);
  const atQuarter = bend(475);
  const atLoad = bend(600);
  assert.ok(Math.abs(atSupport) < 1e-9, `支点では0: ${atSupport}`);
  assert.ok(atLoad > atQuarter, `荷重点で最大: ${atLoad} > ${atQuarter}`);
  assert.ok(atQuarter > 0);
});

test('おもりを足すと縞はふえる（重ねあわせ）', () => {
  const f = new StressField();
  f.update([{ x: 600, y: 470, f: 2 }], ANCHORS);
  const one = f.sample(600, 490);
  f.update(
    [
      { x: 600, y: 470, f: 2 },
      { x: 700, y: 470, f: 2 },
    ],
    ANCHORS,
  );
  const two = f.sample(600, 490);
  assert.ok(two > one, `${two} > ${one}`);
});
