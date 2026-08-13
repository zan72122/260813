// 無操作タイマー: 3〜5秒(difficultyで変化、易しいほど長く待つ)入力が無ければ hint:show をemitする。
// 入力(タッチ/ドラッグ/スワイプ)のたびにreset()を呼んでタイマーを仕切り直す。
import type { EventBus, SpotKind } from "../core/types";

export interface HintTimerOptions {
  events: EventBus;
  /** 発火するたびに秒数を問い合わせる(呼び出し側の現在状況=難易度に応じて変えられるように関数化)。 */
  getDelaySeconds: () => number;
  /** hint:showのpayload用。呼び出し側の現在の対象スポット(無ければnull)。 */
  getSpotId: () => SpotKind | null;
}

export interface HintTimer {
  /** タイマーを開始する(画面mount時に呼ぶ)。 */
  start(): void;
  /** 停止する(画面unmount時に呼ぶ)。 */
  stop(): void;
  /** 入力があった時に呼ぶ。動作中なら仕切り直す。 */
  reset(): void;
  dispose(): void;
}

const MIN_DELAY = 3;
const MAX_DELAY = 5;

/** difficulty(1..3、易しい→難しい)を3〜5秒の待ち時間へ変換。難しいほど早くヒントを出す。 */
export function difficultyToDelaySeconds(difficulty: number): number {
  const clamped = Math.min(3, Math.max(1, difficulty));
  // difficulty 1 -> 5秒, 2 -> 4秒, 3 -> 3秒
  return MAX_DELAY - ((clamped - 1) / 2) * (MAX_DELAY - MIN_DELAY);
}

export function createHintTimer(opts: HintTimerOptions): HintTimer {
  let timerId: ReturnType<typeof setTimeout> | null = null;
  let active = false;

  function clearTimer(): void {
    if (timerId !== null) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  function schedule(): void {
    clearTimer();
    if (!active) return;
    const seconds = Math.min(MAX_DELAY, Math.max(MIN_DELAY, opts.getDelaySeconds()));
    timerId = setTimeout(() => {
      if (!active) return;
      opts.events.emit("hint:show", { spotId: opts.getSpotId() });
      // 引き続き無操作なら、一定間隔でヒントを繰り返す(1回きりで諦めない)。
      schedule();
    }, seconds * 1000);
  }

  return {
    start(): void {
      active = true;
      schedule();
    },
    stop(): void {
      active = false;
      clearTimer();
    },
    reset(): void {
      if (active) schedule();
    },
    dispose(): void {
      active = false;
      clearTimer();
    }
  };
}
