/**
 * Public entry point for the audio domain. Single factory: `createAudio`.
 *
 * All sound is procedurally synthesized via WebAudio — there are no audio
 * files anywhere in this module (see ARCHITECTURE_CONTRACT.md). The engine
 * subscribes directly to the shared `EventBus` (contracts/events.ts); the
 * integrator does not need to forward individual game events to it.
 *
 * Usage (Wave 4 integration):
 * ```ts
 * import { createAudio } from './audio';
 * const audio = createAudio({ bus, getState: () => gameState });
 * // ... on the very first user gesture (pointerdown/tap), before anything
 * // else that depends on sound:
 * canvasOrStartBadge.addEventListener('pointerdown', () => { void audio.unlock(); }, { once: true });
 * // Sound toggle UI (src/ui's HUD speaker button) calls:
 * audio.setEnabled(false); // instant-mute, smoothly ramped to avoid a click
 * // Teardown (e.g. hot-reload/tests):
 * audio.dispose();
 * ```
 *
 * `unlock()` is idempotent and safe to call multiple times/from multiple
 * listeners — only the first call actually constructs the AudioContext and
 * resumes it (required by iOS Safari's user-gesture policy). It resolves
 * once the context is running and the ambient bed + all event subscriptions
 * are live.
 *
 * `setEnabled(on)` may be called before `unlock()` — the desired state is
 * remembered and applied the moment the context is created.
 *
 * Pause/resume: this module listens for the shared `pauseChanged` event on
 * the bus AND the page's own `visibilitychange` (tab hidden / app
 * backgrounded) to suspend audibility — the integrator does not need to
 * call anything extra for either case. On `visibilitychange` to hidden
 * this also fully `ctx.suspend()`s the underlying AudioContext (after the
 * mute ramp finishes) and stops the ambient bed's background scheduling —
 * not just muting the gain — so a backgrounded tab doesn't keep the audio
 * thread (and its `setTimeout`-scheduled ambient clangs) running for
 * nothing; both resume automatically on return to visibility, with an
 * automatic fallback to the next real `pointerdown` if the browser refuses
 * a gesture-less `resume()` (iOS Safari).
 *
 * Replay: this module also listens for `replayRequested` (and, as a second
 * safety net, `phaseChanged` to `establish`) to stop any continuous voice
 * (a leg's sand loop, a leg's near-target resonance swell) left running
 * from the run that was just reset — the integrator does not need to call
 * anything extra for this either.
 */
export type { AudioEngineHandle as AudioHandle, AudioEngineOptions as CreateAudioOptions } from './engine';
export { createAudioEngine as createAudio } from './engine';

// Re-exported for callers that want the pure routing table directly (e.g.
// a future owner building a visual "cue debug" overlay) without pulling in
// the WebAudio engine.
export { routeEvent } from './cueRouter';
export type { CueDescriptor, CueKind } from './cueRouter';
export type { AudioContextFactory, MinimalAudioContext } from './context';
