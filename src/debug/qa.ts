import type { BehaviorId, DebugApi, GamePhase, Quality } from "../core/types";

// 後工程(S3b/S4等)が実装を差し込むためのハンドラ集合。
// 未登録のハンドラはno-op+console.warnにフォールバックする（スタブ化しない）。
export interface DebugHandlers {
  getState: () => unknown;
  setTimeScale: (v: number) => void;
  setQuality: (v: Quality) => void;
  jumpTo: (phase: GamePhase) => void;
  playBehavior: (id: BehaviorId) => Promise<void>;
  reset: (seed?: number) => void;
  screenshotReady: () => boolean;
}

export interface QaDebugApi extends DebugApi {
  registerHandlers(partial: Partial<DebugHandlers>): void;
  markReady(): void;
}

class DebugController implements QaDebugApi {
  ready = false;
  private readonly qaMode: boolean;
  private handlers: Partial<DebugHandlers> = {};

  constructor(qaMode: boolean) {
    this.qaMode = qaMode;
  }

  registerHandlers(partial: Partial<DebugHandlers>): void {
    Object.assign(this.handlers, partial);
  }

  markReady(): void {
    this.ready = true;
  }

  getState(): unknown {
    if (this.handlers.getState) return this.handlers.getState();
    return { ready: this.ready };
  }

  setTimeScale(v: number): void {
    if (!this.qaMode) {
      console.warn("[qa] setTimeScale is only available with ?qa=1");
      return;
    }
    if (this.handlers.setTimeScale) {
      this.handlers.setTimeScale(v);
      return;
    }
    console.warn("[qa] setTimeScale: no handler registered yet (no-op)");
  }

  setQuality(v: Quality): void {
    if (!this.qaMode) {
      console.warn("[qa] setQuality is only available with ?qa=1");
      return;
    }
    if (this.handlers.setQuality) {
      this.handlers.setQuality(v);
      return;
    }
    console.warn("[qa] setQuality: no handler registered yet (no-op)");
  }

  jumpTo(phase: GamePhase): void {
    if (!this.qaMode) {
      console.warn("[qa] jumpTo is only available with ?qa=1");
      return;
    }
    if (this.handlers.jumpTo) {
      this.handlers.jumpTo(phase);
      return;
    }
    console.warn(`[qa] jumpTo(${phase}): no handler registered yet (no-op)`);
  }

  playBehavior(id: BehaviorId): Promise<void> {
    if (!this.qaMode) {
      console.warn("[qa] playBehavior is only available with ?qa=1");
      return Promise.resolve();
    }
    if (this.handlers.playBehavior) {
      return this.handlers.playBehavior(id);
    }
    console.warn(`[qa] playBehavior(${id}): no handler registered yet (no-op)`);
    return Promise.resolve();
  }

  reset(seed?: number): void {
    if (!this.qaMode) {
      console.warn("[qa] reset is only available with ?qa=1");
      return;
    }
    if (this.handlers.reset) {
      this.handlers.reset(seed);
      return;
    }
    console.warn("[qa] reset: no handler registered yet (no-op)");
  }

  screenshotReady(): boolean {
    if (this.handlers.screenshotReady) return this.handlers.screenshotReady();
    return true;
  }
}

declare global {
  interface Window {
    __ELEPHANT_GAME_DEBUG__?: DebugApi;
  }
}

/**
 * window.__ELEPHANT_GAME_DEBUG__ を設置する。
 * qaMode=false でも ready/getState は動作するが、その他は警告付きno-opになる（本番でも壊れない）。
 * 戻り値のcontrollerはmain.ts等から registerHandlers()/markReady() で使う。
 */
export function installDebugApi(qaMode: boolean): QaDebugApi {
  const controller = new DebugController(qaMode);
  window.__ELEPHANT_GAME_DEBUG__ = controller;
  return controller;
}
