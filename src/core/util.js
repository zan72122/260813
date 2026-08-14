export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (t) => t * t * (3 - 2 * t);
export const invLerp = (a, b, v) => clamp01((v - a) / (b - a || 1));

/** Frame-rate independent approach: moves `a` toward `b`, `rate` = how much of the gap per second. */
export const approach = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));

export const Ease = {
  linear: (t) => t,
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2),
  out: (t) => 1 - (1 - t) ** 3,
  outQuad: (t) => 1 - (1 - t) ** 2,
  in: (t) => t * t * t,
  outBack: (t) => 1 + 2.2 * (t - 1) ** 3 + 1.2 * (t - 1) ** 2,
  outElastic: (t) =>
    t === 0 || t === 1 ? t : 2 ** (-9 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
  outBounce: (t) => {
    const n = 7.5625;
    const d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
};

/** Minimal tween runner. No allocations per frame, no dependencies. */
export class Tweener {
  constructor() {
    this.items = [];
  }

  /** @param {{dur:number, delay?:number, ease?:(t:number)=>number, update?:(k:number)=>void, done?:()=>void}} o */
  add(o) {
    o.t = -(o.delay || 0);
    o.ease = o.ease || Ease.inOut;
    this.items.push(o);
    return o;
  }

  /** Convenience: run a callback after `delay` seconds. */
  wait(delay, done) {
    return this.add({ dur: 0.0001, delay, done });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const o = this.items[i];
      o.t += dt;
      if (o.t < 0) continue;
      const k = o.dur <= 0 ? 1 : clamp01(o.t / o.dur);
      if (o.update) o.update(o.ease(k), k);
      if (k >= 1) {
        this.items.splice(i, 1);
        if (o.done) o.done();
      }
    }
  }

  clear() {
    this.items.length = 0;
  }
}

/** Deterministic PRNG so the factory looks the same on every run (and in tests). */
export function makeRandom(seed = 1337) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
