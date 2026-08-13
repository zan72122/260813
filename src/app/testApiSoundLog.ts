/**
 * QA-only sound-cue ring buffer (integrator-owned, `src/app/**`). NOT part
 * of the frozen `EiffelTestAPI` shape (`src/contracts/testing.ts`) — a
 * bonus property attached alongside it, the same "duck-typed extra beyond
 * the frozen contract" pattern the Wave-3 owners already use for
 * `EiffelGameLogic.scrubToT` / `EiffelSceneWorld.getDrawCalls`/
 * `isCameraSettled`. Lets e2e assert cues that have no other externally
 * observable side effect (e.g. `brakeLock`/`doorOpen`) without needing a
 * real (or mocked) `AudioContext` in the test.
 *
 * True fixed-slot circular buffer (write index + count, no `Array#splice`):
 * a long throttle hold can push many hundreds of entries per second (loop
 * cues re-fire on a cadence — see `src/game/stateMachine.ts`), and an
 * earlier `push`-then-`splice(0, 1)` implementation paid an O(cap) shift on
 * every push once full. That's needless main-thread cost in a hot path this
 * module's own doc says nothing should add to (PERFORMANCE_BUDGET
 * "Main-thread per-frame allocations in sim/render hot path: none").
 */

import type { SoundCueId } from '../contracts/events.ts';

/** Cap so a long throttle/lever hold can't grow this unbounded. */
const SOUND_CUE_LOG_CAP = 500;

export class SoundCueLog {
  private readonly slots: (SoundCueId | undefined)[] = new Array<SoundCueId | undefined>(SOUND_CUE_LOG_CAP);
  private writeIndex = 0;
  private count = 0;

  push(cue: SoundCueId): void {
    this.slots[this.writeIndex] = cue;
    this.writeIndex = (this.writeIndex + 1) % SOUND_CUE_LOG_CAP;
    if (this.count < SOUND_CUE_LOG_CAP) this.count += 1;
  }

  /** Snapshot of the most recent (up to `SOUND_CUE_LOG_CAP`) cues, oldest first. */
  snapshot(): readonly SoundCueId[] {
    const out: SoundCueId[] = [];
    const start = this.count < SOUND_CUE_LOG_CAP ? 0 : this.writeIndex;
    for (let i = 0; i < this.count; i += 1) {
      const cue = this.slots[(start + i) % SOUND_CUE_LOG_CAP];
      if (cue !== undefined) out.push(cue);
    }
    return out;
  }
}
