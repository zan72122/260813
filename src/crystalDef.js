import { makeRng } from './rng.js';

// 主役色：ピンク／シアン／紫／金／エメラルド
const PALETTE = {
  pink: [1.00, 0.28, 0.60],
  cyan: [0.22, 0.94, 0.92],
  purple: [0.58, 0.34, 1.00],
  gold: [1.00, 0.74, 0.26],
  emerald: [0.22, 0.95, 0.52],
};

// 明るさが揃わないように、色ごとに重みを変えてある
const WEIGHT = { pink: 1.00, cyan: 0.88, purple: 0.72, gold: 1.05, emerald: 0.80 };

const COMBOS = [
  ['pink', 'cyan', 'gold'],
  ['purple', 'gold', 'cyan'],
  ['emerald', 'pink', 'purple'],
  ['cyan', 'purple', 'pink'],
  ['gold', 'emerald', 'pink'],
  ['pink', 'purple', 'gold'],
  ['cyan', 'emerald', 'gold'],
];

function tint(name, scale) {
  const c = PALETTE[name];
  const w = WEIGHT[name] * scale;
  return [c[0] * w, c[1] * w, c[2] * w];
}

/**
 * 結晶ひとつぶんの個性。
 * 同心円の数・色・中心のかたち・黒い十字の太さ・傾けたときの歪みが毎回変わる。
 */
export function makeCrystalDef(seed) {
  const rng = makeRng(seed);
  const combo = COMBOS[rng.int(0, COMBOS.length - 1)];

  // 全部を同じ明るさにしない（暗い領域があるから虹が際立つ）
  const scales = [rng.range(1.05, 1.35), rng.range(0.68, 0.95), rng.range(0.45, 0.72)];

  const base = rng.range(0.90, 1.06);
  const def = {
    seed,
    rng,
    names: combo,

    tintA: tint(combo[0], scales[0]),
    tintB: tint(combo[1], scales[1]),
    tintC: tint(combo[2], scales[2]),

    // 波長ごとの周期比（干渉色の並び方）
    freq: [base * 1.00, base * rng.range(1.08, 1.16), base * rng.range(1.20, 1.34)],
    phase: [rng.range(0, 0.40), rng.range(0, 0.40), rng.range(0, 0.40)],

    ringsN: 0,   // 同心円の数（下で決める）
    rings: 0,
    cross: rng.range(0.18, 0.60),       // 黒い十字の太さ
    streakN: rng.pick([2, 3, 4, 4, 6, 8]), // 放射模様
    streakAmt: rng.range(0.025, 0.085),
    centerKind: rng.range(0.0, 1.0),    // 中心のかたち
    warpGain: rng.range(0.35, 0.90),    // 傾けたときの歪み
    bandPhase: rng.range(0, 6.28),

    restTilt: rng.range(-0.26, 0.26),   // 合ったときの結晶の傾き
    axisTilt: 0,                        // 光軸の向き（ゲーム側で決める）
    spinDir: rng.sign(),

    // 見え方の調整
    patMul: rng.range(0.92, 1.10),
    ringMulEye: rng.range(1.55, 1.95),
  };

  // ringsN ＝ 虹の目が開いたとき、中心から画面の端までに見える輪の数
  def.ringsN = rng.range(5.0, 8.5);
  def.orderMax = rng.range(12.0, 18.0);
  def.rings = def.ringsN / (Math.pow(0.39, 1.30) * def.ringMulEye);
  return def;
}

export function applyPatternUniforms(prog, def, s) {
  prog
    .f('uRings', def.rings)
    .f('uCross', def.cross)
    .f('uStreakN', def.streakN)
    .f('uStreakAmt', def.streakAmt)
    .v3('uFreq', def.freq[0], def.freq[1], def.freq[2])
    .v3('uPhase', def.phase[0], def.phase[1], def.phase[2])
    .v3('uTintA', def.tintA[0], def.tintA[1], def.tintA[2])
    .v3('uTintB', def.tintB[0], def.tintB[1], def.tintB[2])
    .v3('uTintC', def.tintC[0], def.tintC[1], def.tintC[2])
    .f('uCenterKind', def.centerKind)
    .f('uBandPhase', def.bandPhase)
    .f('uRingMul', s.ringMul)
    .f('uOrderMax', def.orderMax)
    .f('uPolAngle', s.polAngle)
    .f('uGain', s.gain)
    .f('uSpin', s.spin)
    .f('uTime', s.time)
    .f('uWarp', s.warp)
    .v2('uWarpDir', s.warpDir[0], s.warpDir[1])
    .f('uPatScale', s.patScale)
    .f('uOpen', s.open)
    .f('uBurst', s.burst);
}
