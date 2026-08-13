// 自由カメラは持たせない。決められた3つの構図をゆっくり行き来するだけ。
//   wide   : 庭 + 霧吹き の全体
//   spray  : ノズル先端・霧・虹が同時に見えるところまで少し寄る
//   reveal : 大きな虹の全景を見せるためにゆっくり引く
import { REF, RAINBOW_R, SECONDARY_R, ANTISOLAR_BELOW } from './config.js';

const SHOTS = {
  wide:   { zoom: 1.00, horizon: 0.00, follow: 0.00 },
  spray:  { zoom: 1.11, horizon: 0.025, follow: 0.16 },
  reveal: { zoom: 0.85, horizon: -0.03, follow: 0.05 },
};

export class Camera {
  constructor() {
    this.shot = 'wide';
    this.zoom = SHOTS.wide.zoom;
    this.horizonAdj = 0;
    this.follow = 0;
    this.panX = 0;          // ワールド単位
    this.width = 1; this.height = 1;
    this.scale = 1;         // 画面px / ワールド単位
    this.horizonY = 0;      // 画面px
    this.antisolar = [0, 0];// 画面px
    this.radius = RAINBOW_R;
    this.radius2 = SECONDARY_R;
    this.antisolarWorld = [0, ANTISOLAR_BELOW];
    this._shotHold = 0;
    this._drift = 0;
    this.sunAzWorld = 0;    // その回ごとの太陽方位のずれ（虹の中心も同じだけずれる）
  }

  setRound(sunAzWorld) {
    this.sunAzWorld = sunAzWorld;
    this.antisolarWorld[0] = sunAzWorld;
  }

  /** 構図の切り替え。因果の途中でぱたぱた切り替えないよう最短滞在時間を設ける。 */
  request(shot, now) {
    if (shot === this.shot) return;
    if (now - this._shotHold < 2.4 && !(shot === 'reveal')) return;
    this.shot = shot;
    this._shotHold = now;
  }

  resize(w, h) {
    this.width = w;
    this.height = h;
  }

  /** 画面の向きに合わせた地平線の基準位置。縦でも横でも弧を大きく見せる。 */
  baseHorizonFrac() {
    const a = this.width / this.height;
    const t = Math.min(1, Math.max(0, (a - 0.72) / (1.45 - 0.72)));
    return 0.565 + t * (0.715 - 0.565);
  }

  update(dt, aimWorldX, time) {
    const s = SHOTS[this.shot];
    const k = 1 - Math.exp(-dt / 0.85);
    this.zoom += (s.zoom - this.zoom) * k;
    this.horizonAdj += (s.horizon - this.horizonAdj) * k;
    this.follow += (s.follow - this.follow) * k;

    // 噴霧している側へほんの少しだけ寄る（自由カメラではなく“気配り”）
    const wantPan = (aimWorldX || 0) * this.follow;
    this.panX += (wantPan - this.panX) * (1 - Math.exp(-dt / 1.5));

    this._drift = Math.sin(time * 0.17) * 2.2; // ごくわずかな呼吸

    // 画面が大きくなっても、そのぶん丸ごと拡大はしない。
    // iPad で「電話の画面を2倍にしただけ」に見えないよう、ゆるやかに追従させる。
    const shortSide = Math.min(this.width, this.height);
    this.scale = Math.pow(shortSide / REF, 0.62) * this.zoom;
    this.horizonY = (this.baseHorizonFrac() + this.horizonAdj) * this.height + this._drift;

    this.radius = RAINBOW_R * this.scale;
    this.radius2 = SECONDARY_R * this.scale;
    this.antisolar[0] = this.width * 0.5 + (this.antisolarWorld[0] - this.panX) * this.scale;
    this.antisolar[1] = this.horizonY + ANTISOLAR_BELOW * this.scale;
  }

  worldToScreen(wx, wy, out) {
    out = out || [0, 0];
    out[0] = this.width * 0.5 + (wx - this.panX) * this.scale;
    out[1] = this.horizonY + wy * this.scale;
    return out;
  }

  screenToWorld(sx, sy, out) {
    out = out || [0, 0];
    out[0] = (sx - this.width * 0.5) / this.scale + this.panX;
    out[1] = (sy - this.horizonY) / this.scale;
    return out;
  }
}
