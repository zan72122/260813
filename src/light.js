// 画面全体で共有する 1 つのライトモデル。
// 2D レイヤー（背景・小物）と WebGL レイヤー（Hero 素材）が同じ値を読むので、
// ハイライトの向きと影の向きが物体間で必ず一致する。
//
// 座標系: X = 右, Y = 上, Z = 手前。カメラは仰角 θ（sinθ = view.k）の正射影。

// キーライト: 左手前の上、窓から差す暖かい光
export const KEY_DIR = normalize([-0.52, 0.74, 0.42]);
export const KEY_COLOR = [1.0, 0.93, 0.82];
export const KEY_INTENSITY = 3.6;

// フィル: 右奥からの弱い冷たい反射
export const FILL_DIR = normalize([0.66, 0.28, -0.7]);
export const FILL_COLOR = [0.72, 0.8, 0.94];
export const FILL_INTENSITY = 0.62;

// 台からの照り返し（下から）
export const BOUNCE_DIR = normalize([0.1, -1.0, 0.25]);
export const BOUNCE_COLOR = [1.0, 0.82, 0.62];
export const BOUNCE_INTENSITY = 0.40;

// 露出。HDR で 1.0 を超えた値をブルームに溢れさせるための基準。
export const EXPOSURE = 1.0;

// 環境マップに焼く輝度の上限（RGBA8 に格納するためのスケール）
export const ENV_SCALE = 9.0;

function normalize(v) {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

// --- 2D レイヤー用のヘルパ ---------------------------------------------------
// キーライトを画面に投影した向き（小物のハイライトと影をこれに合わせる）。
// k は view.k（= sinθ）。
export function keyDirScreen(k) {
  const hf = Math.sqrt(Math.max(0.05, 1 - k * k));
  return {
    x: KEY_DIR[0],
    // 画面 y は下向き。高さ成分は hf、奥行き成分は k で潰れる。
    y: -(KEY_DIR[1] * hf + KEY_DIR[2] * k),
  };
}

// 接地影を落とす方向と長さ（キーライトの逆側）。
export function shadowOffset(k, height) {
  const d = keyDirScreen(k);
  const l = Math.hypot(d.x, d.y) || 1;
  return { x: (-d.x / l) * height * 0.34, y: (-d.y / l) * height * 0.1 };
}
