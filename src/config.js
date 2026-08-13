// ゲーム全体の調整値。
// ワールド単位: 画面の短辺 = REF ワールド単位（ズーム1.0のとき）。
// y は下向き（画面と同じ向き）。地平線はワールド y = 0。

export const REF = 400;

// --- 虹の幾何（角度の関係は本物どおり、見え方だけ子ども向けに広く） ---
export const RAINBOW_DEG = 42.0;        // 主虹の視半径
export const SECONDARY_DEG = 51.0;      // 副虹の視半径
export const SUN_ELEV_DEG = 14.0;       // 太陽高度（背後にある）→ 対日点は地平線の下 14°
export const PX_PER_DEG = (REF * 0.78) / RAINBOW_DEG; // ワールド単位/度
export const RAINBOW_R = RAINBOW_DEG * PX_PER_DEG;
export const SECONDARY_R = SECONDARY_DEG * PX_PER_DEG;
export const ANTISOLAR_BELOW = SUN_ELEV_DEG * PX_PER_DEG; // 地平線より下（ワールド y）

// 4歳児が角度を探せなくても成功するように、当たり判定を実際よりずっと広く取る。
export const BAND_TOLERANCE = 0.26;     // 主虹半径に対する許容（±26%）

// --- 虹の蓄積 ---
export const ARC_BINS = 192;            // 弧を角度で分割する数（0..180°）
export const ARC_GAIN = 0.62;           // 霧1粒あたりの色の育ち方
export const ARC_DECAY_TAU = 34.0;      // 秒。ゆっくり薄れる
export const ARC_DIFFUSE = 5.5;         // 隣のビンへにじむ速さ（弧がつながる）

// --- 霧 ---
export const SPRAY_RATE_NEAR = 110;      // 個/秒
export const SPRAY_RATE_FAR = 30;
export const DROPLET_RATE = 6;
export const MIST_SPEED = 470;          // ワールド単位/秒
export const MIST_SPREAD = 0.40;        // ラジアン
export const MIST_DRAG = 2.4;
export const MIST_GRAVITY = 78;
export const MIST_LIFE = [1.6, 2.5];
export const FAR_LIFE = [2.1, 3.3];

// ノズル先端は指よりこれだけ上（ワールド単位）。指で虹が隠れないように。
export const NOZZLE_OFFSET_Y = 122;
export const NOZZLE_OFFSET_X = 6;

// --- 進行の段階 ---
export const STAGE = { EMPTY: 0, MIST: 1, FAINT: 2, GROWING: 3, BIG: 4 };

// --- 画面まわり ---
export const MAX_DPR = 2.0;
export const MAX_PIXELS = 1.75e6;       // 描画バッファ面積の上限（塗りつぶし負荷対策）

export const PARTICLE_CAPS = {
  near: 460,
  far: 190,
  droplet: 56,
  sparkle: 130,
};
