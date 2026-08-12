/**
 * `src/input` public entry point (Gameplay owner — see docs/FILE_OWNERSHIP.md).
 *
 * ```ts
 * import { attachInput, replayInjector } from '../input';
 *
 * const handle = attachInput({
 *   root: canvas,               // or any wrapping root element covering it
 *   handles: handleRegistry,    // the same HandleRegistry the renderer writes to every frame
 *   sink: game,                 // a GameController (src/game) — or any { applyIntent(Intent) }
 *   getState: () => game.getState(), // optional; currently only gates new grabs while paused
 * });
 *
 * // ...later, on teardown:
 * handle.dispose();
 *
 * // If the UX owner's DOM "もう一回" overlay button isn't wired through the
 * // canvas gesture pipeline, wire its onclick directly instead:
 * replayButtonEl.addEventListener('click', replayInjector(game));
 * ```
 *
 * `attachInput` depends only on the HandleRegistry contract
 * (contracts/handles.ts) for where things are on screen — never on
 * Three.js or any render-owner module — and never bypasses `sink.applyIntent`,
 * so gameplay behavior driven by real gestures is always the same code path
 * `TestApi.drive.*` (src/game/testDrive.ts) exercises.
 */
export { attachInput, replayInjector } from './attachInput';
export type { AttachInputOptions, EventTargetLike, InputHandle, IntentSink } from './types';
