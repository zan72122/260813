/**
 * 疑似応力場。
 *
 * 本物の有限要素解析はしない。かわりに光弾性写真の「見え方」を作る3つの成分を足す:
 *   1) 荷重点まわりの集中応力      … 半無限体に点荷重を載せたときの 1/r 減衰（Flamant 的）
 *   2) 支点（反力）まわりの集中応力 … 反力は荷重を支点までの距離で配分する
 *   3) 荷重点→支点をむすぶ「力の流れ」… 主応力線に沿った帯。橋やアーチの縞はこれで出る
 *
 * 出力はフリンジ次数 N（縞の本数）。0 で真っ黒、増えるほど虹色が重なっていく。
 */

export interface Load {
  x: number;
  y: number;
  /** 力の大きさ（無次元、0〜約6） */
  f: number;
}

export interface Anchor {
  x: number;
  y: number;
  /** 支えの強さ。大きいほど力を受け持つ */
  weight?: number;
}

interface Reaction {
  x: number;
  y: number;
  f: number;
}

interface FlowPath {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  f: number;
}

/** 荷重点の芯の太さ。小さいほど接触点がまぶしくなる */
const CORE = 18;
/** 集中応力の強さ */
const K_POINT = 20;
/** 支点まわりは荷重点よりひかえめに */
const K_SUPPORT = 0.72;
/** 力の流れの帯の強さ */
const K_FLOW = 0.5;
/** 帯の幅の2乗 */
const FLOW_W2 = 58 * 58;
/**
 * 集中応力がとどく範囲の2乗。
 * 1/r の減衰だけだと模型ぜんぶが光ってしまい「押した所に虹」が伝わらないので、
 * ゆるやかな包絡線をかけて指のまわりに集める。
 */
const REACH2 = 175 * 175;
/** 曲げによる縞の強さ（σ = M·y/I のかわり） */
const K_BEND = 7.6e-5;
/** これより遠い寄与は無視する（内側ループの早期脱出） */
const CUTOFF2 = 900 * 900;

/** はりの曲げを足したいときの形（橋げた用） */
export interface Beam {
  /** 左右の支点の x */
  x0: number;
  x1: number;
  /** 中立軸（ここだけ黒い線がのこる） */
  yc: number;
}

export class StressField {
  private loads: Load[] = [];
  private reactions: Reaction[] = [];
  private flows: FlowPath[] = [];
  private beam: Beam | null = null;
  /** はりの曲げモーメント（[定数項, x の係数] を区間ごとに持つのは大げさなので直接計算する） */
  private beamForces: { x: number; f: number }[] = [];

  /** 毎フレーム、荷重と支点から場を組み立てる。 */
  update(loads: Load[], anchors: Anchor[], beam: Beam | null = null): void {
    this.loads = loads.filter((l) => l.f > 0.001);
    this.reactions.length = 0;
    this.flows.length = 0;
    this.beam = beam;
    this.beamForces.length = 0;

    if (this.loads.length === 0 || anchors.length === 0) return;

    if (beam) this.buildBeam(beam);

    const acc = new Float64Array(anchors.length);

    for (const load of this.loads) {
      // 支点までの距離の2乗の逆数で反力を配分する（近い支えほど多く受け持つ）
      let sum = 0;
      const w = new Float64Array(anchors.length);
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        const dx = a.x - load.x;
        const dy = a.y - load.y;
        const d2 = dx * dx + dy * dy + 400;
        w[i] = ((a.weight ?? 1) * 1e5) / d2;
        sum += w[i];
      }
      if (sum <= 0) continue;

      // 力の流れは、いちばん受け持ちの大きい支点2つぶんだけ描く
      let best = -1;
      let second = -1;
      for (let i = 0; i < anchors.length; i++) {
        if (best < 0 || w[i] > w[best]) {
          second = best;
          best = i;
        } else if (second < 0 || w[i] > w[second]) {
          second = i;
        }
      }

      for (let i = 0; i < anchors.length; i++) {
        const r = (load.f * w[i]) / sum;
        acc[i] += r;
        if (i === best || i === second) {
          this.flows.push({
            ax: load.x,
            ay: load.y,
            bx: anchors[i].x,
            by: anchors[i].y,
            f: r,
          });
        }
      }
    }

    for (let i = 0; i < anchors.length; i++) {
      if (acc[i] > 0.001) {
        this.reactions.push({ x: anchors[i].x, y: anchors[i].y, f: acc[i] });
      }
    }
  }

  /**
   * 単純ばりのつりあい（てこの原理）で反力を求めておく。
   * 曲げモーメント図は、これらの力の「左側だけ」を足し合わせれば出る。
   */
  private buildBeam(beam: Beam): void {
    const span = beam.x1 - beam.x0;
    if (Math.abs(span) < 1) return;
    let rL = 0;
    let rR = 0;
    for (const l of this.loads) {
      rL += (l.f * (beam.x1 - l.x)) / span;
      rR += (l.f * (l.x - beam.x0)) / span;
      this.beamForces.push({ x: l.x, f: -l.f });
    }
    this.beamForces.push({ x: beam.x0, f: rL });
    this.beamForces.push({ x: beam.x1, f: rR });
  }

  /** その場所のフリンジ次数（縞の本数）。 */
  sample(x: number, y: number): number {
    let n = 0;

    for (let i = 0; i < this.loads.length; i++) {
      const l = this.loads[i];
      const dx = x - l.x;
      const dy = y - l.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > CUTOFF2) continue;
      n += ((l.f * K_POINT) / (Math.sqrt(d2) + CORE)) * (1 / (1 + d2 / REACH2));
    }

    for (let i = 0; i < this.reactions.length; i++) {
      const r = this.reactions[i];
      const dx = x - r.x;
      const dy = y - r.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > CUTOFF2) continue;
      n += ((r.f * K_POINT * K_SUPPORT) / (Math.sqrt(d2) + CORE)) * (1 / (1 + d2 / REACH2));
    }

    for (let i = 0; i < this.flows.length; i++) {
      const p = this.flows[i];
      const d2 = segDistSq(x, y, p.ax, p.ay, p.bx, p.by);
      if (d2 > CUTOFF2) continue;
      n += (p.f * K_FLOW) / (1 + d2 / FLOW_W2);
    }

    // はりの曲げ：上下に縞がたまり、まん中（中立軸）だけ黒くのこる
    if (this.beam && this.beamForces.length > 0) {
      let m = 0;
      for (let i = 0; i < this.beamForces.length; i++) {
        const bf = this.beamForces[i];
        if (bf.x < x) m += bf.f * (x - bf.x);
      }
      n += K_BEND * Math.abs(m) * Math.abs(y - this.beam.yc);
    }

    return n;
  }
}

function segDistSq(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy;
  let t = len2 > 1e-9 ? (wx * vx + wy * vy) / len2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = wx - vx * t;
  const dy = wy - vy * t;
  return dx * dx + dy * dy;
}
