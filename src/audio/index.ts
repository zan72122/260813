// src/audio/index.ts — UX module (owner: UX, src/audio/**).
// Wave 2 note: MINIMAL-BUT-FUNCTIONAL skeleton — lazy WebAudio context,
// unlock() resumes it on first gesture, mute flag lives in the store.
// Wave 3c UX replaces internals but MUST keep createAudio()'s shape frozen.

import type { EventBus } from '../contracts/bus';
import type { GameStore } from '../contracts/store';

export interface AudioHandle {
  unlock(): Promise<void>;
  dispose(): void;
}

export function createAudio(o: { bus: EventBus; store: GameStore }): AudioHandle {
  const { store } = o;
  let ctx: AudioContext | null = null;

  function ensureContext(): AudioContext {
    if (!ctx) {
      ctx = new AudioContext();
    }
    return ctx;
  }

  async function unlock(): Promise<void> {
    const context = ensureContext();
    if (context.state === 'suspended') {
      await context.resume();
    }
    const audio = store.get().audio;
    store.set({ audio: { ...audio, unlocked: true } });
  }

  function dispose(): void {
    if (ctx) {
      void ctx.close();
      ctx = null;
    }
  }

  return { unlock, dispose };
}
