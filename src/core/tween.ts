import { clamp01, type Ease, linear } from './ease';

interface Tween {
  t: number;
  duration: number;
  ease: Ease;
  update: (v: number) => void;
  done?: () => void;
  alive: boolean;
}

/**
 * Minimal tween pool — the whole piece runs on a handful of eased scalars.
 * No external animation library; the timing vocabulary stays auditable.
 */
export class Tweens {
  private list: Tween[] = [];

  run(duration: number, update: (v: number) => void, ease: Ease = linear, done?: () => void): Tween {
    const tw: Tween = { t: 0, duration: Math.max(duration, 0.0001), ease, update, done, alive: true };
    this.list.push(tw);
    update(ease(0));
    return tw;
  }

  /** Await-able variant for sequencing shots and gestures. */
  play(duration: number, update: (v: number) => void, ease: Ease = linear): Promise<void> {
    return new Promise((resolve) => this.run(duration, update, ease, resolve));
  }

  wait(duration: number): Promise<void> {
    return this.play(duration, () => {});
  }

  tick(dt: number): void {
    for (const tw of this.list) {
      if (!tw.alive) continue;
      tw.t += dt;
      const raw = clamp01(tw.t / tw.duration);
      tw.update(tw.ease(raw));
      if (raw >= 1) {
        tw.alive = false;
        tw.done?.();
      }
    }
    this.list = this.list.filter((tw) => tw.alive);
  }
}
