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

## Visual repair round (VISUAL ACCEPTANCE fixes)

Two accepted visual defects fixed, `src/styles/components.css` only — no
other file in my exclusive paths changed.

### U1 — title screen hid the 3D scene (MEDIUM)

`.screen-title` used a fully opaque top-to-bottom iron gradient, so the
tower/crane behind it (PRODUCT_SPEC row `title`: "塔+クレーン+大きな▶レバー")
never showed. Reworked to:

- `.screen-title` background is now two stacked, mostly-transparent
  gradients: a radial vignette (transparent through ~42% of the distance
  to the farthest corner, darkening toward the corners) plus a thin
  top/bottom linear scrim band. The center ~50% of the frame is
  essentially untouched — the scene reads clearly through it.
- Layout switched from `flex-direction:column; gap:...` centered as one
  block to `justify-content: space-between` with exactly two children:
  the logotype (top) and `.title-plate`/start lever (bottom). This holds
  in every orientation now — the old landscape media query that flipped
  `.screen-title` to a left/right row (`flex-direction:row;
  justify-content:space-evenly`) was removed since column top/bottom reads
  correctly at all 4 target viewports without it (verified in
  screenshots below).
- `.logotype` is now a compact plaque (own translucent rounded backdrop,
  smaller clamp() font range, `pointer-events:none` since it's decorative
  and must never be the thing that eats a child's tap) instead of a bare
  full-size text block. `max-width` switched from `ch` units (calibrated
  against latin digit width, which under-measures full-width
  kana/kanji and wrapped the title mid-word — "エッフェル塔をのぼ / る" —
  on wider viewports) to `em`, sized to the actual glyph run.
- `title-plate` (the brass lever button) itself is unchanged — already
  well above the 72px hit-area minimum and it was already legible against
  the (now transparent) scene thanks to its existing strong drop shadow /
  inset highlight.
- Verified with a throwaway Playwright script at all 4 QA viewports
  (390×844, 844×390, 820×1180, 1180×820) via `?test=1&seed=42` +
  `window.__game.setPhase('title')`: tower, crane, workers and the Paris
  skyline are all clearly visible behind the title in every shot; the
  lever stays lower-center and fully on-screen; the logotype stays a
  single line and never overlaps the lever.

### U2 — error-fallback pictogram (LOW)

The generic distressed-face-reading SVG (circle + vertical stroke + dot,
built as an exclamation/warning glyph) is inline markup created by
`showErrorOverlay()` in `src/app/index.ts` — Integrator-owned, frozen, and
outside my exclusive paths (`src/ui/**`, `src/audio/**`, `src/styles/**`),
so I could not edit that string directly. Fixed it visually instead,
entirely from my own paths:

- `[data-testid='error-fallback'] svg { display: none; }` hides the old
  glyph without touching its markup.
- A new `[data-testid='error-fallback']::before` pseudo-element paints a
  small procedural "drooping crane + steam puff" pictogram as an inline
  SVG data-URI background (brass mast/boom, iron hook, three overlapping
  steam-puff circles in paper tone) — on-theme with the rest of the game's
  iron/brass/paper palette, no raster assets.
- `data-testid="error-fallback"` and the reload `<button>` (still created
  and wired by `app/index.ts`) are untouched, so reload behavior is
  unaffected.
- Verified by dispatching a synthetic `window` `error` event in the same
  throwaway Playwright harness (this is how `installErrorOverlay()` in
  `app/index.ts` triggers `showErrorOverlay()`) at all 4 viewports: the
  crane-with-steam pictogram renders above the reload button, correctly
  sized and centered, no distressed-face artifact left.

### Verification run for this round

- `npx tsc --noEmit` — clean.
- `npx eslint src/ui src/audio` — clean (`src/styles` is CSS-only and not
  part of the eslint glob, same as before this round).
- `npx vitest run src/ui src/audio` — 41/41 passing, unchanged (this round
  was CSS-only, no unit-testable logic touched).
- `npx vite build` + `vite preview` + throwaway Playwright screenshots at
  390×844 / 844×390 / 820×1180 / 1180×820 for both the `title` phase and
  the error-fallback overlay — all visually reviewed with the Read tool.
- `npx playwright test full-loop --project=phone-portrait` — 2/2 passing
  (title → opening → … → complete gesture loop, and the replay/playRivet/
  playClimb loop from complete), zero console errors. No anchor geometry
  was touched this round (CSS-only), so no anchors() re-check was needed
  beyond what this E2E run already exercises.
```

## Wave 6 audit fixes

Five independent audit findings (U1–U5), all in my exclusive paths
(`src/ui/**`, `src/styles/**`; U5 also `src/ui/**`). No other owner's files
touched.

### U1 [CRITICAL, blind-visual] — complete screen was a full-screen card-grid dashboard

`VISUAL_ACCEPTANCE.md` explicitly bans full-screen card-grid dashboards
("カード羅列は不合格"), and `.complete-menu` was exactly that: `position:
absolute; inset: 0` with an opaque top-to-bottom iron gradient, hiding the
finished tower/crane diorama completely — the single worst blind-visual
failure mode named in the doc.

Fix, entirely in `src/styles/components.css` + `src/styles/layout.css` +
`src/ui/index.ts`:

- `.complete-menu` is now a transparent, click-through full-viewport layer
  (`#ui > .complete-menu { pointer-events: none; }`, same override pattern
  already used for `.hint-layer`/`.success-flash-layer`) that only
  positions its one child at the bottom of the frame
  (`align-items: flex-end`).
- The four replay buttons now live inside a new `.complete-board` — a
  weathered-timber signboard rail (gradient wood background, dark bolted
  frame, drop-shadow) that is the *only* opaque, pointer-events:auto part
  of the screen. `board.append(...)` replaces the old `grid.append(...)`
  in `src/ui/index.ts`; the four buttons keep their existing
  `data-testid`s (`replay-same`, `replay-new`, `play-rivet`, `play-climb`)
  and `.menu-button hit-area` sizing (still ≥72px, unchanged brass-bordered
  iron-plate look already used for pause/back/sound controls elsewhere) —
  reachable in ≤1 tap each from `complete`.
- Layout: portrait keeps the board narrow (`max-width: 280px`) so the four
  plates wrap into the same 2x2 arrangement as before; landscape widens it
  (`max-width: min(90vw, 560px)`, `640px` on ≥700px-wide tablets) into a
  single row, per `docs/PRODUCT_SPEC.md`'s "bottom or side band appropriate
  to orientation" guidance — both keep the tower/crane visible above and
  around the board rather than covered by it. The stale `.menu-grid`
  landscape/short-landscape overrides were removed/retargeted at
  `.complete-board`; `.menu-button`'s own colors/shape are unchanged from
  before this round (still a dark iron+brass plate, not restyled to brass,
  since brass would have killed the `currentColor`-based icon contrast for
  the beam/crane pictograms).
- Verified with a throwaway Playwright script at `390×844` and `1180×820`
  (`?test=1&seed=42`, `window.__game.setPhase('complete')`, waiting for the
  staggered `plate-appear` entrance animation to finish before
  screenshotting): the tower, crane, workers and Paris skyline are all
  clearly visible above/around the board in both screenshots; all four
  plates render at full size and legibility inside the board; sound/pause
  corner controls remain reachable (they sit outside `.complete-board`,
  at the pre-existing `--z-pause` layer above `--z-menu`).

### U2 [HIGH, code-perf] — complete-menu buttons could silently swallow a tap

Root cause: every button's click handler was wrapped in an inline
cooldown-gated guard (`debounced()`, local to `createUi()`, never
extracted or unit-tested) that, when a tap landed inside its cooldown
window (500ms for most buttons), did *nothing at all* — no state change,
no visual response. To a 4-year-old that reads as a dead, unresponsive
button, not "you already did that" — exactly the failure the finding
describes ("a click can be eaten leaving the player stranded on
'complete'").

Fix: extracted the guard into a new pure, unit-tested module,
`src/ui/interaction.ts`:

- `createClickGuard(cooldownMs)` — the same time-gated latch as before,
  now standalone and testable with an injected clock.
- `guardedHandler(fn, { cooldownMs, onTap, now })` — wraps `fn` so `onTap`
  fires on **every** invocation, unconditionally, *before* the guard is
  even consulted; only the guarded action itself (`fn`) can be gated. This
  is the actual fix: a tap can no longer be indistinguishable from a dead
  button, because it always produces immediate feedback.
- `debounce(fn, waitMs)` — a separate plain trailing debounce, unrelated to
  the click guard, added for U5 (see below).

`src/ui/index.ts` now wires every `hit-area` button (title-start,
sound-toggle, pause-toggle, resume, back-to-complete, and all four
complete-menu plates) through a small `tapHandler(el, fn, cooldownMs)`
helper that calls `guardedHandler` with `onTap: () => pulse(el)` — `pulse`
adds (with a forced reflow so repeats restart it) a new `.tap-pulse` class
that plays a quick scale-down/up animation (`tap-pulse-anim` in
`src/styles/animations.css`, using `var(--dur-fast)` so it respects
`reduced-motion`/`test-fast` like every other animation in the game).
Every physical tap on every button now visibly pulses, whether or not the
guarded action fires.

The buttons' actions themselves were already effectively idempotent (they
all call `advance()`, which the frozen state machine already no-ops for an
invalid/already-left phase), so no gameplay-affecting logic changed —
only the guard's honesty about giving feedback.

New tests: `src/ui/__tests__/interaction.test.ts` (10 tests) — cover
`createClickGuard`'s first-call/gate/re-arm behavior, `guardedHandler`'s
"onTap always fires, fn only fires outside cooldown" contract (the direct
regression test for this finding), and `debounce`'s coalescing + `cancel()`.

### U3 [CRITICAL, child-ux] — rivetCarry assist hint never showed

Root cause confirmed by reading both sides of the anchor contract:
`src/scene/index.ts`'s `activePhaseSet` publishes **only** `'tongs'` as
active during `rivetCarry` (`rivetCarry: new Set(['tongs'])`), and
Gameplay's own `targetAnchor()` for this step (`src/game/phases/rivet.ts`)
also returns `'tongs'` — but `src/ui/hints.ts`'s `hintForPhase('rivetCarry',
...)` targeted `workerAnchorForStation(state.rivet.station)` (a
`worker0..3` anchor), which the renderer never marks active during this
phase. The hint layer's old logic (`if (anchor && anchor.active) show else
hide`) then hid the hint permanently for the entire carry step — a child
with no reading ability and no prior knowledge of "swipe right" had zero
guidance, forever, exactly as reported.

Fix, `src/ui/hints.ts`:

- `hintForPhase('rivetCarry', ...)` and the `playRivet` free-play
  sub-state helper (`hintForRivetSubState`, the `station < 3` branch) now
  both target `'tongs'` directly, consistent with gameplay/renderer. The
  now-unused `workerAnchorForStation`/`WORKER_ANCHORS` helpers were
  removed (dead code).
- **General fallback**, per the finding's explicit ask ("add a general
  fallback in the hint layer... nearest active anchor... rather than
  hiding it"): a new pure function, `resolveHintAnchor(targetId,
  allAnchors)`. If the target anchor is active, it's used as-is. If it's
  inactive (or was never published at all), it falls back to the nearest
  *active* anchor by squared screen distance to the target's last known
  position — the renderer publishes a position for anchors even when it
  marks them inactive, so "nearest" is meaningful for any anchor that has
  ever been seen. If the target has never been published (no position to
  measure against), it falls back to the first active anchor. Only when
  *nothing* is active does it return `null`.
- A new `safeHintPosition(viewport, size)` covers the `null` case: an
  absolute on-screen fallback (horizontally centered, vertically clear of
  both the top corner controls and the bottom thumb strip) so the hint
  layer literally never has a "nothing to render" state once a phase has
  declared it wants a hint.
- `src/ui/index.ts`'s `tickHint()` now calls `resolveHintAnchor` every
  frame instead of a raw `anchors.get(...).active` check, and always adds
  `.visible` (there is no more "else hide" branch) — the hint layer can no
  longer silently go dark for a live phase.

Tests: `src/ui/__tests__/hints.test.ts` — the existing "follows the relay
station for rivetCarry across all four workers" test was **retargeted**
(not deleted) to assert `anchor: 'tongs'` at every station, with a comment
explaining why; the `playRivet` sub-state test's carry-step expectation
was updated the same way. Four new tests cover `resolveHintAnchor`
(active-passthrough, nearest-active-fallback, first-active-when-no-position,
null-when-nothing-active) and two cover `safeHintPosition`.

### U4 [LOW, blind-visual] — hint pictogram could sit in the bottom thumb-rest strip

`placeHintNearAnchor` already flipped above/below to avoid covering the
anchor, but its viewport clamp only kept an 8px margin from the screen
edges — an anchor near the bottom of the frame (a very plausible spot,
e.g. `climbLever`/`hammerSpot` on a short viewport) could still push the
hint's bottom edge to within a few px of the physical screen edge, right
where a child's resting thumb or the phone's home-indicator lives.

Fix, `src/ui/hints.ts`'s `placeHintNearAnchor`: replaced the flat 8px edge
margin (vertically) with a "safe strip" of `size.h / 2 + 76` px reserved at
both the top (clear of the sound/pause corner buttons) and bottom (clear of
the thumb-rest strip), degrading gracefully to half the viewport height on
very short screens so it never locks up (`minY <= maxY` always holds). The
horizontal margin was bumped from 8px to 12px for consistency. New test:
"keeps clear of the bottom thumb-rest strip even when the anchor sits at
the very bottom edge". All four pre-existing `placeHintNearAnchor` tests
still pass unchanged (verified the new margins don't shift their
assertions).

### U5 [LOW, code-perf] — orientation-class listener wasn't debounced

`docs/ARCHITECTURE_CONTRACT.md`: "resize/orientationchange は debounce
200ms". `applyOrientationClass` was wired directly to both `resize` and
`orientationchange` with no debounce, re-classifying (and writing two
DOM classList operations) on every single event during a drag-resize or a
device rotation's intermediate frames.

Fix: `src/ui/interaction.ts`'s new `debounce(fn, waitMs)` (plain trailing
debounce, `cancel()`-able) wraps `applyOrientationClass` at
`ORIENTATION_DEBOUNCE_MS = 200`. The *initial* classification at `createUi()`
startup still runs synchronously/immediately (there's no "rapid repeat" to
coalesce on first layout — debouncing it would only add a needless 200ms
of wrong-orientation-class flash). `dispose()` now also calls
`.cancel()` on the debounced listener so a pending 200ms timer can't fire
into a torn-down UI. Tests: `debounce`'s two tests in
`src/ui/__tests__/interaction.test.ts` (coalesces rapid calls; `cancel()`
prevents a pending call).

### Verification run for this round

- `npx tsc --noEmit` — clean.
- `npx eslint src/ui src/audio` (and `npx eslint src` for the whole repo,
  as an extra check since this round touched shared-ish patterns) — clean.
- `npx vitest run` — 227/227 passing project-wide (31 files), including
  the new `src/ui/__tests__/interaction.test.ts` (10 tests) and the
  retargeted/expanded `src/ui/__tests__/hints.test.ts` (16 tests, up from
  9).
- `npx vite build` + `vite preview --port 4402` + throwaway Playwright
  scripts (`--use-angle=swiftshader --enable-unsafe-swiftshader`) against
  `?test=1&seed=42`, driving `window.__game.setPhase(...)`, screenshotting
  at `390×844` and `1180×820` for `complete` (U1: tower/crane/Paris
  skyline visible around the bottom board in both orientations, all four
  plates legible) and `rivetCarry` (U3: hint pictogram now visible, swipe-
  right hand+arrow rendered near the tongs/forge area) — all reviewed with
  the Read tool. Also re-shot `title` at both viewports to confirm no
  regression from the prior visual-repair round.
- `npx playwright test full-loop --project=phone-portrait` — 2/2 passing
  (title → opening → … → complete real-gesture loop, and the replay-same/
  replay-new/playRivet/playClimb loop from complete — all four exercised
  through the new `.complete-board` markup), zero console errors.
- `npx playwright test resilience --project=phone-portrait` — 5/5 passing
  (not in the required checklist, but run anyway since (a) exercises an
  orientation change mid-loop, directly touching the U5 debounce path, and
  it passed with no stalls).
