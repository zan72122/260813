// 端末性能に応じた品質段階。実測FPSを見て、重い効果から段階的に落とす。
// 一度落としたら上げない（境界での振動を避けるため）。
//
//  2 : フル      — 繊維1024x768 / 透過 / 水の屈折と玉 / 背景ボケ
//  1 : 軽量      — 繊維512x384  / 透過 / 屈折と玉なし
//  0 : 代替      — WebGL を使わず Canvas 2D 経路（旧端末・WebGL不可）

export class Quality {
  constructor() {
    this.tier = 2;
    this.frames = 0;
    this.acc = 0;
    this.lowRuns = 0;
    this.locked = false;
    this.fps = 60;
  }

  // WebGL が使えるか事前に判定する
  probe() {
    // 検証用の固定指定 ?tier=0|1|2
    const m = /[?&]tier=([012])/.exec(location.search);
    if (m) { this.tier = +m[1]; this.locked = true; return this.tier; }
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      if (!gl) { this.tier = 0; this.locked = true; return 0; }
      // テクスチャサイズが足りない端末は軽量から始める
      const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (max < 2048) this.tier = 1;
      const lose = gl.getExtension('WEBGL_lose_context');
      if (lose) lose.loseContext();
    } catch (e) {
      this.tier = 0; this.locked = true; return 0;
    }
    return this.tier;
  }

  // 毎フレーム呼ぶ。段階が下がったら true を返す。
  sample(dt) {
    if (this.locked || dt <= 0) return false;
    // 起動直後は JIT やテクスチャ転送で遅いので、そこでは判定しない
    this.warm = (this.warm || 0) + dt;
    if (this.warm < 3.5) return false;
    this.acc += dt;
    this.frames++;
    if (this.acc < 1.5) return false;
    this.fps = this.frames / this.acc;
    this.acc = 0; this.frames = 0;
    if (this.fps < 38) {
      this.lowRuns++;
      if (this.lowRuns >= 2 && this.tier > 0) {
        this.tier--;
        this.lowRuns = 0;
        if (this.tier === 0) this.locked = true;
        return true;
      }
    } else {
      this.lowRuns = 0;
    }
    return false;
  }

  fallback() { this.tier = 0; this.locked = true; }
  get useGL() { return this.tier > 0; }
}

export const quality = new Quality();
