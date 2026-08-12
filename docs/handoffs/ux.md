# UX handoff (Wave 3c)

Owner: UX. Exclusive paths delivered: `src/ui/**`, `src/audio/**`, `src/styles/**`.

Status: `npx tsc --noEmit` / `npx eslint src/ui src/audio` / `npx vitest run` all
clean (78/78 unit tests pass project-wide, 41 of them mine). `npm run build`
succeeds (bundle ≈127 KB gzip, well under the 900 KB target). The existing
Foundation e2e smoke test (`tests/e2e/smoke.spec.ts`, all 4 viewport
projects) passes twice back-to-back against a fresh build.

## Public API (unchanged factory signatures, per the frozen contract)

```ts
// src/ui/index.ts
createUi(o: { root: HTMLElement; store: GameStore; bus: EventBus; anchors: AnchorRegistry }): { dispose(): void }
// src/audio/index.ts
createAudio(o: { bus: EventBus; store: GameStore }): { unlock(): Promise<void>; dispose(): void }
```

## What's implemented

### `src/ui/index.ts`
- Loading screen (`data-testid=loading-screen`): steam-gauge SVG dial
  (needle sweep via CSS, pure DOM/CSS, visible instantly), hides once
  `phase !== 'loading'`.
- Title (`data-testid=title-start`): decorative logotype (text — allowed as
  a "decorative logotype", no operating instructions in text anywhere else)
  + one 170px brass-plate lever button. Click dispatches `title → opening`
  via `advance()`. Audio unlock is handled by `src/app/index.ts`'s existing
  global `pointerdown` listener (fires on any first pointerdown, including
  this button) — `createUi` never touches the audio handle directly since
  the frozen signature doesn't pass it one.
- Hint layer (`data-testid=hint-layer`): `src/ui/hints.ts` maps
  `(phase, state) → {anchor, gesture}` (pure, unit-tested — see the station/
  bolt-index/rivet-substate logic there). A small internal rAF loop (only
  running while a hint target exists) polls `anchors.get(id)` and places the
  pictogram via `placeHintNearAnchor` (also pure/tested) so it never covers
  the anchor and stays clamped on-screen. `assist:breathe` adds a pulsing
  `amplify` class (static brightness bump under reduced motion); `assist:point`
  plays a one-shot ghost-hand `demo` animation (skipped/flashed-static under
  reduced motion) and self-clears via a tracked `setTimeout` (no dangling
  timers).
- Success feedback: same-frame ripple/wash on `snap:hook`, `snap:align`,
  `bolt:seated` (anchored to `hole0`/`hole1` by `payload.index`),
  `rivet:inserted`, `rivet:formed`, `rivet:cooled`, `sling:released` (all
  anchored rings) and `climb:locked`/`reveal:done` (full-screen warm wash,
  no single anchor makes sense for those two). Elements are created and
  removed via tracked timeouts — no accumulation across replays.
- Complete menu: 4 big picture buttons (`replay-same` / `replay-new` /
  `play-rivet` / `play-climb`), 2×2 grid portrait / 4-across landscape.
  `replay-new` reseeds via a `mulberry32` generator (from
  `contracts/machine.ts`, **not** `Math.random`) chained off the session's
  initial seed, so `?test=1` stays fully deterministic across repeated
  presses. Back button (`back-to-complete`) shown only during
  `playRivet`/`playClimb`.
- Pause (`data-testid=pause-toggle`, 72px hit area, small visible icon):
  toggles a full-viewport overlay with a big resume button. **Integration
  note for the Wave 4 integrator / Gameplay owner** — see "Pause contract"
  below, this is the one place I had to invent something beyond the frozen
  contracts.
- Sound toggle (`data-testid=sound-toggle`): speaker pictogram (waves vs.
  strike-through), persists via `src/ui/storage.ts`'s try/catch
  `localStorage` wrapper (key `eiffel-steam-crane:muted`), reflects
  `store.audio.muted` reactively (fixed a real bug during testing — see
  "Bugs found & fixed").
- Error fallback: `[data-testid=error-fallback]` is created by
  `src/app/index.ts` (frozen — outside my paths) with a fixed generic
  sad-face SVG + reload button; I only restyled it via CSS to the
  construction-site palette (warm iron background, brass 120px reload
  button). I could **not** replace its SVG markup with a "sad little crane"
  pictogram as the task described, since that markup is hardcoded in the
  frozen `app/index.ts`. If a literal crane pictogram is wanted there, the
  Integrator should either inline one directly in `app/index.ts`, or extract
  that SVG into a small exported constant from my `pictograms.ts` that
  `app/index.ts` imports (I'd suggest the latter, but didn't do it myself
  since it would mean touching a frozen file).
- Every primary target is ≥72px CSS (`--hit-min` token), spacing ≥16px
  (`--gap-min`), safe-area respected via `env()`, portrait/landscape both
  have deliberate `@media (orientation/aspect-ratio)` layouts
  (`src/styles/layout.css` + per-component rules in `components.css`).
  All buttons are wrapped in a shared `debounced()` helper (see "Bugs found
  & fixed" — this one had a real bug too).

### `src/audio/index.ts`
100% WebAudio synthesis (oscillators + procedurally generated noise
buffers from `src/audio/noise.ts`, seeded via the frozen `mulberry32`, never
`Math.random`). One-shots (`playTone`/`playNoiseBurst`) create their node
graph per call and disconnect everything in `onended`, so replaying 20 times
leaves no dangling nodes. Continuous state-driven beds (steam hiss, climb
chug, forge crackle, cooling sizzle, soft ambient murmur) are created lazily,
gain-automated via `store.subscribe`, and torn down when their phase ends.
Sound-parameter curves (`hammerPitchForHit`, `chugIntervalSeconds`,
`steamHissGain`, `forgeCrackleGain`, `coolingSizzleGain`, …) live in
`src/audio/params.ts`, pure and unit-tested.

Bus-event → sound mapping: `snap:hook`/`snap:align` → metallic snap;
`bolt:seated` → low "kachon" thud + metallic ring; `rivet:handoff` → tong
tick; `rivet:hit` → rising-pitch hammer tink + tiny anvil ring (pitch from
`hammerPitchForHit`); `rivet:cooled` → short creak; `sling:released` → soft
cable whip; `climb:locked` → big low CLUNK; `reveal:done` → warm
three-partial struck-bell chime (deliberately not a modern app "ding").
Continuous: forge crackle gated by `phase==='rivetHeat'` (or the `playRivet`
sub-state, since that free-play phase reuses `state.rivet` without a
separate top-level phase — see `hints.ts`'s `hintForRivetSubState` for the
same pattern on the UI side) and `state.rivet.temp`; steam hiss +
chug-thump scheduling (look-ahead scheduled on the `AudioContext` clock,
*driven* by `store.subscribe` ticks rather than `setInterval`, per the "no
setInterval audio" rule) gated by `phase==='climb'/'playClimb'` and
`state.climb.lever`/`.progress`; cooling sizzle gated by `rivetCool` (or the
equivalent `playRivet` end-state) and `state.rivet.cooled`.

`unlock()` creates/resumes the `AudioContext` on the first gesture, adds a
`statechange` listener to re-resume if iOS interrupts the context outside of
a visibility change, and starts the ambient murmur bed (kept under
reduced-motion per the task's own note — "not motion"). `visibilitychange`
suspends/resumes the whole context (separate from the mute gain node, so
muting doesn't stop the context and hiding doesn't fight with the mute
preference). `dispose()` removes every listener, stops/disconnects every
node, and closes the context.

### `src/styles/**`
`base.css` stays the entry point linked from the frozen `index.html`
(`@import`s `tokens.css` / `animations.css` / `components.css` /
`layout.css` — Vite bundles these fine, verified via `npm run build`). All
mechanics required by the contract are preserved: full-viewport canvas,
`touch-action: none`, `user-select: none`, tap-highlight transparent,
safe-area padding, `#ui` overlay stacking. New: a fixed 1888
iron/brass/paper/Venice-red token palette (`tokens.css`), a
`prefers-reduced-motion` media query **and** a JS-driven `.reduced-motion`
class on `<html>` (belt-and-suspenders — the class reflects
`store.prefs.reducedMotion`, which also covers `?reduced=1` and doesn't
depend on the OS media query alone), `:focus-visible` styling, and a
`.test-fast` class (`?test=1`) that scales the CSS animation-duration tokens
to ×0.25 per the contract.

## Bugs found & fixed during testing (both real, both would have shipped silently)

1. **`debounced()` swallowed the very first click on fast page loads.** It
   initialized its internal "last call" timestamp to `0` and compared
   against `performance.now()`. On a fast-loading viewport (reproduced with
   the `tablet-landscape` Playwright project, ~300ms to reach `title`), the
   real click's `performance.now()` was itself still under the 500ms
   cooldown window measured from *navigation start*, so the very first tap
   on `title-start` (and by extension every other debounced button) was
   silently dropped — the button looked and behaved correctly in DevTools
   but a real player's first tap would have done nothing. Root-caused via
   Playwright + an `addInitScript` listener-wrapper (not left in the code)
   that proved the click handler fired but the debounce gate rejected it.
   Fixed by seeding `last = -Infinity` instead of `0`. Covered going
   forward by the existing e2e smoke test (all 4 viewports, run twice).
2. **Sound-toggle icon never updated after being clicked.** The click
   handler updated `store` and `localStorage` but never re-rendered the
   button's own SVG/class, so the speaker icon stayed in its original state
   (visually "unmuted") even after actually muting. Fixed by wiring
   `renderSoundToggle(state.audio.muted)` into the shared `store.subscribe`
   render pass (de-duped against the last-rendered value so it doesn't
   thrash the SVG on every unrelated store update). Verified end-to-end with
   a throwaway Playwright script (not committed) asserting the class list
   and `localStorage` value both flip on click.
3. **CSS specificity**: Foundation's `base.css` has `#ui > * { pointer-events:
   auto; }` (ID selector, specificity beats a plain class/attribute rule).
   My first pass at `.success-flash-layer`/`[data-testid=hint-layer]` with
   `pointer-events: none` was silently overridden by that rule, so the
   (invisible but full-viewport) hint/flash overlay layers intercepted every
   tap on the canvas and on the title button underneath them — reproduced by
   the e2e smoke test failing with Playwright's "element intercepts pointer
   events" diagnostic. Fixed by scoping my selectors to `#ui > .success-flash-
   layer` / `#ui > [data-testid=hint-layer]` so they win on specificity too.
   Left an inline CSS comment at both sites explaining why the `#ui >` prefix
   is load-bearing, so nobody "simplifies" it back into a bug later.

## Pause contract (read this if you touch phase progression)

`createUi`'s frozen signature has no way to halt the shared rAF loop (that
lives in `src/app/index.ts`, frozen for Wave 3) or to add a new store field
/ bus event (both frozen contracts). What I actually built, verified to be
sufficient for a 4-year-old player and robust regardless of where Gameplay
attaches its own pointer listeners:

- The pause overlay is a full-viewport, DOM-topmost, **translucent** (not
  fully opaque — intentional, so the scene stays visible-but-dimmed) element
  appended into `#ui`. Being topmost in a shared stacking context, it already
  wins pointer hit-testing over the canvas for any listener attached
  *directly to the canvas*.
- Belt-and-suspenders: the overlay also has its own `pointerdown` /
  `pointerup` / `pointermove` / `click` listeners that call
  `stopPropagation()` while paused, so even if Gameplay attaches its
  listeners to the shared `appRoot` element (an ancestor of both the canvas
  and this overlay, per `createGame`'s `element` param) rather than the
  canvas itself, those events never bubble up to reach it.
- `window.__uiPaused: boolean` is set as a convenience side-channel (not
  part of any frozen contract, purely additive, doesn't collide with
  `window.__game`) in case Gameplay wants to explicitly gate autonomous
  progress while paused — concretely, the one case my input-blocking doesn't
  cover is `climb`'s documented "let go and it keeps climbing" behavior
  (PRODUCT_SPEC.md's `climb` row): if the player pauses mid-climb, lever-held
  auto-progress could in principle keep advancing in the background since
  I have no way to literally stop `game.update()`. This is a narrow, static
  window (nothing else in the spec continues without input), and I did not
  want to touch frozen files to close it; flagging it explicitly here so the
  Integrator can decide whether `src/game/index.ts` should check
  `window.__uiPaused` before advancing `climb.progress` autonomously.
- Sound is intentionally **not** silenced by pausing beyond what the store's
  `audio.muted` flag already governs (the ambient bed keeps playing quietly)
  — the mute button is a separate, deliberate user choice, and pause is a
  distinct concept.

## Known issues / deliberate simplifications

- `error-fallback`'s SVG pictogram (sad crane vs. the current generic
  sad-face) needs a frozen-file change to fully satisfy "sad little crane" —
  see the note above.
- Hint-layer anchor-to-gesture mapping in `src/ui/hints.ts` is my own
  reasonable interpretation of "near the relevant anchor" per phase (e.g.
  `bolts` targets whichever of `bolt0`/`bolt1` is still unseated;
  `rivetCarry`/`playRivet`'s relay hint targets `worker{station}`) — these
  anchor choices aren't spelled out field-by-field in
  ARCHITECTURE_CONTRACT.md/PRODUCT_SPEC.md, so if Renderer's actual anchor
  placements don't match this reading, the hint will just point at whatever
  anchor.get() returns (possibly `undefined`/inactive, which hides the hint
  gracefully rather than crashing — see `tickHint()`).
- `SUCCESS_ANCHOR` similarly picks one reasonable anchor per success event;
  `climb:locked`/`reveal:done` intentionally use a full-screen wash instead
  of a single anchor since those are whole-scene milestones.
- No dedicated unit tests for `src/ui/index.ts` / `src/audio/index.ts`
  themselves (DOM/AudioContext-dependent, per the task's own guidance to
  keep that layer thin and covered by e2e instead) — all the
  logic-with-edge-cases (hint targeting/placement, pictogram builders,
  storage guard, layout classification, sound parameter curves, noise
  generation) is pure and unit-tested (41 tests across
  `src/ui/__tests__/**` and `src/audio/__tests__/**`).

## Files delivered

```
src/ui/index.ts              createUi() — DOM wiring
src/ui/hints.ts               phase/state -> hint anchor+gesture, hint placement (pure, tested)
src/ui/pictograms.ts          all inline-SVG builders (pure, tested)
src/ui/storage.ts             try/catch localStorage wrapper (pure, tested)
src/ui/layout.ts              orientation classification (pure, tested)
src/ui/__tests__/*.test.ts    25 tests
src/audio/index.ts            createAudio() — WebAudio synthesis + scheduling
src/audio/params.ts           sound parameter curves (pure, tested)
src/audio/noise.ts            deterministic noise/crackle generation (pure, tested)
src/audio/__tests__/*.test.ts 15 tests
src/styles/base.css           entry stylesheet (linked from index.html)
src/styles/tokens.css         palette + layout + motion tokens
src/styles/animations.css     keyframes (all reduced-motion-aware)
src/styles/components.css     every screen/widget's visual language
src/styles/layout.css         orientation-specific spacing beyond components.css
```
