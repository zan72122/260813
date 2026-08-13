/**
 * Tiny dependency-free tween/easing manager. All active tweens live in one
 * flat array updated once per frame; no per-frame allocations after a tween
 * is created (the update loop reuses the same array and mutates in place).
 */

export type Easing = (t: number) => number;

export const Easing = {
  linear: (t: number): number => t,
  cubicOut: (t: number): number => 1 - Math.pow(1 - t, 3),
  cubicInOut: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  backOut: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
  elasticOut: (t: number): number => {
    if (t === 0 || t === 1) return t;
    const c4 = (2 * Math.PI) / 3;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
  },
  sineInOut: (t: number): number => -(Math.cos(Math.PI * t) - 1) / 2,
};

export interface ActiveTweenHandle {
  elapsed: number;
  duration: number;
  easing: Easing;
  onUpdate: (t: number) => void;
  onComplete?: () => void;
  alive: boolean;
}

type ActiveTween = ActiveTweenHandle;

export class TweenManager {
  private tweens: ActiveTween[] = [];
  // B4 fix (fix-round-1): per-target tween cancellation. Without this, two
  // tweens driving the same object's position (e.g. a reject-return float
  // racing a settle-in-place) can run concurrently and fight every frame —
  // whichever's onUpdate runs last that frame "wins", producing a visible
  // jerk. Passing the same `key` to `add()` cancels any tween already
  // registered under it before the new one starts.
  private keyed = new Map<string, ActiveTween>();

  add(duration: number, easing: Easing, onUpdate: (t: number) => void, onComplete?: () => void, key?: string): ActiveTween {
    if (key !== undefined) this.cancelKey(key);
    const tween: ActiveTween = { elapsed: 0, duration: Math.max(duration, 0.0001), easing, onUpdate, onComplete, alive: true };
    this.tweens.push(tween);
    if (key !== undefined) this.keyed.set(key, tween);
    return tween;
  }

  cancel(tween: ActiveTween): void {
    tween.alive = false;
  }

  /** Cancels whatever tween is currently registered under `key` (see `add`'s key param). No-op if none is active. */
  cancelKey(key: string): void {
    const prev = this.keyed.get(key);
    if (prev) prev.alive = false;
  }

  update(dtSeconds: number): void {
    if (this.tweens.length === 0) return;
    let writeIndex = 0;
    for (let i = 0; i < this.tweens.length; i++) {
      const tw = this.tweens[i]!;
      if (!tw.alive) continue;
      tw.elapsed += dtSeconds;
      const t = Math.min(1, tw.elapsed / tw.duration);
      tw.onUpdate(tw.easing(t));
      if (t >= 1) {
        tw.alive = false;
        tw.onComplete?.();
      } else {
        this.tweens[writeIndex++] = tw;
      }
    }
    this.tweens.length = writeIndex;
  }

  get activeCount(): number {
    return this.tweens.length;
  }

  clear(): void {
    this.tweens.length = 0;
    this.keyed.clear();
  }
}
