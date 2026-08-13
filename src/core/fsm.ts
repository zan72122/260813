import type { GamePhase, GameStateMachine } from "./types";

// 正当な遷移表。free(自由遊び)はhideと同フェーズを再利用するためfreePlayフラグで扱う。
const TRANSITIONS: Record<GamePhase, GamePhase[]> = {
  boot: ["title"],
  title: ["intro", "hide"], // 2回目以降はintroをスキップしてhideへ
  intro: ["hide"],
  hide: ["gate"],
  gate: ["seek"],
  seek: ["album"],
  album: ["hide", "title"]
};

class Fsm implements GameStateMachine {
  private currentPhase: GamePhase = "boot";
  private isFreePlay = false;
  private listeners: Set<(phase: GamePhase, prev: GamePhase) => void> = new Set();

  get phase(): GamePhase {
    return this.currentPhase;
  }

  get freePlay(): boolean {
    return this.isFreePlay;
  }

  setFreePlay(on: boolean): void {
    this.isFreePlay = on;
  }

  canTransition(to: GamePhase): boolean {
    const allowed = TRANSITIONS[this.currentPhase];
    return allowed.includes(to);
  }

  transition(to: GamePhase): boolean {
    if (!this.canTransition(to)) {
      console.warn(`[fsm] invalid transition: ${this.currentPhase} -> ${to} (ignored)`);
      return false;
    }
    const prev = this.currentPhase;
    this.currentPhase = to;
    for (const cb of Array.from(this.listeners)) {
      cb(this.currentPhase, prev);
    }
    return true;
  }

  onChange(cb: (phase: GamePhase, prev: GamePhase) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }
}

export function createFsm(): GameStateMachine & { setFreePlay(on: boolean): void } {
  return new Fsm();
}
