/**
 * `src/game` public entry point (Gameplay owner — see docs/FILE_OWNERSHIP.md).
 *
 * Wave 4 Integrator: the only export you should need is `createGame`. It
 * hands you a fully self-contained gameplay runtime — call `tick(dt)` once
 * per fixed engine step, feed it Intents (directly, or via
 * `src/input`'s `attachInput({ sink: controller, ... })`), and subscribe to
 * `bus` for every `GameEvent`/`cameraCue` you need to drive rendering, UI
 * and audio. Nothing outside this module needs to know how phases, seeds,
 * or cinematic pacing work internally.
 *
 * ```ts
 * import { createGame } from '../game';
 * import { TypedEventBus } from '../contracts/events';
 *
 * const bus = new TypedEventBus();
 * const game = createGame({ bus, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches });
 *
 * bus.on('cameraCue', ({ cue }) => cameraDirector.apply(cue));
 * bus.on('sandFlow', ({ leg, rate }) => sandVisual.setRate(leg, rate));
 * // ...subscribe to whichever GameEvent types your area cares about.
 *
 * function frame(dt: number) {
 *   game.tick(dt);
 *   renderer.render(game.getState());
 * }
 * ```
 *
 * ## Contract
 *
 * - `tick(dt: number): void` — advances gameplay logic by `dt` seconds.
 *   Call this once per fixed engine step (ARCHITECTURE_CONTRACT's 1/60s
 *   accumulator, or driven directly by `TestApi.step()` under
 *   `?fixedStep=1`). A single `tick` call may: drain queued intents,
 *   integrate a held sand-gate lever, advance an in-flight cinematic timer,
 *   and emit any number of `GameEvent`s on `bus` as a result — always
 *   synchronously, before `tick` returns. Calling `tick` while paused
 *   (see `pause()`) is a no-op.
 *
 * - `applyIntent(intent: Intent): void` — records one `Intent`
 *   (contracts/intents.ts) for processing on the *next* `tick()` call; it
 *   never mutates gameplay state or emits events synchronously. This is
 *   the single entry point real input (`src/input`'s `attachInput`) and
 *   `TestApi.drive.*` (`src/game/testDrive.ts`) both funnel through, so
 *   gameplay behavior under a Playwright-driven test is provably identical
 *   to a real finger. Safe to call from anywhere, at any rate, in any
 *   order, at any game phase — every intent the current phase doesn't
 *   accept is a safe no-op (this is the state machine's own no-softlock
 *   guarantee, see stateMachine.ts §9, and this controller never weakens
 *   it).
 *
 * - `getState(): GameState` — a deep copy of the current state. Safe to
 *   hold onto; mutating the returned object never affects the live game.
 *
 * - `pause()` / `resume()` — freezes/resumes gameplay *logic* only
 *   (subsequent `tick()` calls become no-ops while paused; the renderer is
 *   expected to keep rendering the frozen state on its own). Emits
 *   `pauseChanged` on an actual state change. Safe to call at any phase,
 *   any number of times; a cinematic in progress simply holds and resumes
 *   exactly where it left off (no lost time, no skipped events).
 *
 * - `setSound(on: boolean): void` — sets the sound preference, emitting
 *   `soundToggled` on an actual change. (There is no `Intent` for this —
 *   sound is a user preference, not a gameplay action, mirroring how
 *   `pause`/`resume` sit outside the `Intent` union per stateMachine.ts
 *   §5.)
 *
 * - `replay(): void` — requests a same-seed reset, processed on the next
 *   `tick()` (identical to `applyIntent({type:'replay'})` — both exist
 *   because `replay` is both a first-class controller capability *and* a
 *   valid `Intent` a `replayButton` handle can trigger through
 *   `src/input`). Emits `replayRequested` immediately when processed, then
 *   every event a fresh game start would emit (`phaseChanged` back to
 *   `establish`, a fresh `cameraCue`, etc.) as the reset state diffs
 *   against whatever preceded it. `soundOn`/`reducedMotion` survive;
 *   `paused`/`elapsed` reset (stateMachine.ts §6). The seed is unchanged —
 *   `replay()` always reproduces the identical run.
 *
 * - `seed: number` (readonly) — the seed this run actually started with:
 *   the explicit `seed` option if one was given, else the `?seed=` URL
 *   parameter (browser only), else a freshly drawn random seed. Stable for
 *   the controller's lifetime, including across `replay()`.
 *
 * ## Events and camera cues
 *
 * Every `GameEvent` variant in contracts/events.ts is emitted at the
 * correct moment (see controller.ts's module doc for the full design
 * rationale), including the ones the pure reducer itself never rests on
 * long enough to observe directly (`snapped`'s "slow-mo" beat, the
 * `orbitToNext` hold between legs, the four `revealBeat`s + `settled`
 * during `finalReveal`) — this controller layers its own internally-paced
 * cinematic timers on top of the pure state machine to give every one of
 * those moments real screen time, entirely deterministically (driven only
 * by the `dt` your engine loop passes into `tick`, never wall-clock time or
 * `Math.random`), and always still reachable regardless of how intents are
 * spammed, reordered, or interleaved with noise (see
 * tests/unit/game-no-softlock.test.ts).
 *
 * `cameraCue` events are emitted on `bus` exactly like any other
 * `GameEvent` (`{ type: 'cameraCue', cue: CameraCue }`) — there is no
 * separate camera channel to subscribe to.
 *
 * ## Test driving
 *
 * `createTestDrive(controller)` (testDrive.ts) maps `TestApi.drive.*` onto
 * `controller.applyIntent` and exposes `alignmentError`/`locked` — see that
 * module's doc comment. Re-exported here for convenience.
 */
export type { GameController, GameControllerOptions } from './controller';
export { createGameController as createGame } from './controller';
export { createTestDrive } from './testDrive';
export { resolveSeed } from './seed';
