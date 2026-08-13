import type { GameClock } from "./types";

export type EasingFn = (t: number) => number;

export const Easing = {
  linear: (t: number): number => t,
  easeInQuad: (t: number): number => t * t,
  easeOutQuad: (t: number): number => 1 - (1 - t) * (1 - t),
  easeInOutQuad: (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  easeOutCubic: (t: number): number => 1 - Math.pow(1 - t, 3),
  easeInOutCubic: (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  easeOutBack: (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  }
} as const;

export interface Tween {
  /** 完了(または中断)で解決するPromise。中断時もrejectしない。 */
  readonly done: Promise<void>;
  cancel(): void;
  readonly cancelled: boolean;
  readonly finished: boolean;
}

/**
 * sequence/parallelがPromiseのmicrotask遅延を待たずに次ステップへ進めるよう、
 * finish/cancelの瞬間に同期的に発火する内部フック。公開Tween型には含めない。
 */
interface SettleableTween extends Tween {
  onSettle(cb: () => void): void;
}

function isSettleable(t: Tween): t is SettleableTween {
  return typeof (t as Partial<SettleableTween>).onSettle === "function";
}

/** settle済みなら同期的に、未settleならonSettle登録でcbを1回呼ぶ。 */
function attachSettle(t: Tween, cb: () => void): void {
  if (t.finished || t.cancelled) {
    cb();
    return;
  }
  if (isSettleable(t)) {
    t.onSettle(cb);
  } else {
    // 外部実装のTween(onSettle非対応)向けのフォールバック。1tick分遅れうる。
    void t.done.then(cb);
  }
}

interface SettleTracker {
  readonly done: Promise<void>;
  readonly finished: boolean;
  readonly cancelled: boolean;
  markFinished(): void;
  markCancelled(): void;
  onSettle(cb: () => void): void;
}

function createSettleTracker(): SettleTracker {
  let finished = false;
  let cancelled = false;
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const settleCbs: Array<() => void> = [];

  function settle(): void {
    resolveDone();
    for (const cb of settleCbs.splice(0)) cb();
  }

  return {
    done,
    get finished() {
      return finished;
    },
    get cancelled() {
      return cancelled;
    },
    markFinished(): void {
      if (finished || cancelled) return;
      finished = true;
      settle();
    },
    markCancelled(): void {
      if (finished || cancelled) return;
      cancelled = true;
      settle();
    },
    onSettle(cb: () => void): void {
      settleCbs.push(cb);
    }
  };
}

interface RunnerOptions {
  onUpdate?: (t: number) => void;
  onCancel?: () => void;
}

/** clockのonTickを使い、durationSeconds(scaled秒)経過でfinishする基礎ランナー。cancel時もdoneは解決する。 */
function runTimed(clock: GameClock, durationSeconds: number, opts: RunnerOptions = {}): SettleableTween {
  const tracker = createSettleTracker();
  let elapsedLocal = 0;
  let unsubscribe: (() => void) | null = null;

  const finish = (): void => {
    unsubscribe?.();
    tracker.markFinished();
  };

  if (durationSeconds <= 0) {
    opts.onUpdate?.(1);
    finish();
  } else {
    unsubscribe = clock.onTick((dt) => {
      if (tracker.finished || tracker.cancelled) return;
      elapsedLocal += dt;
      const t = Math.min(1, elapsedLocal / durationSeconds);
      opts.onUpdate?.(t);
      if (t >= 1) finish();
    });
  }

  return {
    done: tracker.done,
    cancel(): void {
      if (tracker.finished || tracker.cancelled) return;
      unsubscribe?.();
      opts.onCancel?.();
      tracker.markCancelled();
    },
    get cancelled() {
      return tracker.cancelled;
    },
    get finished() {
      return tracker.finished;
    },
    onSettle: tracker.onSettle
  };
}

export interface ToOptions<T extends Record<string, number>> {
  easing?: EasingFn;
  onUpdate?: (current: T) => void;
  onComplete?: () => void;
}

/** targetオブジェクトの数値プロパティをpropsの値へdurationSeconds(scaled秒)かけて遷移させる。 */
export function to<T extends Record<string, number>>(
  clock: GameClock,
  target: T,
  props: Partial<T>,
  durationSeconds: number,
  options: ToOptions<T> = {}
): Tween {
  const easing = options.easing ?? Easing.linear;
  const startValues: Partial<T> = {};
  const keys = Object.keys(props) as (keyof T)[];
  for (const key of keys) {
    startValues[key] = target[key];
  }

  return runTimed(clock, durationSeconds, {
    onUpdate: (t) => {
      const e = easing(t);
      for (const key of keys) {
        const from = startValues[key] as number;
        const toVal = props[key] as number;
        target[key] = (from + (toVal - from) * e) as T[keyof T];
      }
      options.onUpdate?.(target);
      if (t >= 1) options.onComplete?.();
    }
  });
}

/** 指定秒(scaled秒)待つだけのtween。 */
export function delay(clock: GameClock, durationSeconds: number, onComplete?: () => void): Tween {
  return runTimed(clock, durationSeconds, {
    onUpdate: (t) => {
      if (t >= 1) onComplete?.();
    }
  });
}

/** tween群を順番に実行。cancelされたら現在のステップを止め、以降は開始しない。 */
export function sequence(factories: Array<() => Tween>): Tween {
  const tracker = createSettleTracker();
  let current: Tween | null = null;
  let stopped = false;

  const runNext = (index: number): void => {
    if (stopped) return;
    const factory = factories[index];
    if (index >= factories.length || !factory) {
      stopped = true;
      tracker.markFinished();
      return;
    }
    current = factory();
    attachSettle(current, () => {
      if (stopped) return;
      runNext(index + 1);
    });
  };
  runNext(0);

  return {
    done: tracker.done,
    cancel(): void {
      if (stopped) return;
      stopped = true;
      current?.cancel();
      tracker.markCancelled();
    },
    get cancelled() {
      return tracker.cancelled;
    },
    get finished() {
      return tracker.finished;
    },
    onSettle: tracker.onSettle
  } as Tween;
}

/** tween群を同時実行し、全て完了(またはcancelでの中断)したら解決。 */
export function parallel(tweens: Tween[]): Tween {
  const tracker = createSettleTracker();
  let stopped = false;
  let remaining = tweens.length;

  if (remaining === 0) {
    tracker.markFinished();
  } else {
    for (const tw of tweens) {
      attachSettle(tw, () => {
        if (stopped) return;
        remaining -= 1;
        if (remaining <= 0) {
          stopped = true;
          tracker.markFinished();
        }
      });
    }
  }

  return {
    done: tracker.done,
    cancel(): void {
      if (stopped) return;
      stopped = true;
      for (const tw of tweens) tw.cancel();
      tracker.markCancelled();
    },
    get cancelled() {
      return tracker.cancelled;
    },
    get finished() {
      return tracker.finished;
    },
    onSettle: tracker.onSettle
  } as Tween;
}
