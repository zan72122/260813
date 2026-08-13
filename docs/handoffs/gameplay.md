# Gameplay handoff (Wave 3b)

Owner: Gameplay. Exclusive paths delivered: `src/game/**`, `src/input/**`.

Status: `npx tsc --noEmit`, `npx eslint src/game src/input`, and
`npx vitest run src/game src/input` (and the full repo `npx vitest run`,
106/106) all green in the gameplay worktree. `npx vite build` succeeds
(no changes to any frozen/shared file were needed).

## Public API (frozen shape, unchanged)

```ts
// src/game/index.ts
createGame(o: { store: GameStore; bus: EventBus; anchors: AnchorRegistry; element: HTMLElement }):
  { update(dtMs: number): void; dispose(): void }
```

`src/input/**` is an internal detail instantiated from `createGame` — not
imported by anyone outside `src/game/index.ts`.

## Architecture

- `src/input/index.ts` — `createPointerInput({element, onIntent})`: real DOM
  pointerdown/move/up/cancel/leave wiring. One active pointer at a time
  (secondary pointers ignored outright); classifies the completed gesture via
  the pure `src/input/gestures.ts::classifyGesture()` (tap <350ms & <14px,
  swipe by low velocity threshold 0.15px/ms) and emits both continuous
  (`down`/`move`/`up`/`cancel`) and classified (`tap`/`swipe`) `GameIntent`s
  (see `src/game/intents.ts`) through the `onIntent` callback.
- `src/game/logic.ts` — `createGameLogic({store,bus,anchors,testMode})`: the
  actual game, **entirely DOM-free**. Routes intents + a per-frame
  `update(dtMs)` tick to one `PhaseController` per managed `GamePhase`
  (`src/game/phaseCtx.ts`), and runs the idle/assist timers
  (`assist:breathe` at 3s, `assist:point` at 5s, both scaled ×0.25 under
  `?test=1`, reset on any input). This is what `src/game/index.ts` wires to
  real DOM input; it's also exactly what the unit tests drive directly with
  synthetic `GameIntent` values, so the whole loop is provable headlessly.
- `src/game/phases/*.ts` — one controller factory per phase
  (opening/hookDown/hoist/align/bolts/rivet-relay/sling/climb/reveal), plus
  `createPlayRivetController` and a `loop`-parametrized
  `createClimbController` reused for `playRivet`/`playClimb`.
- `src/game/math.ts` — pure helpers: `clamp`, `dist`, `approachGain` (align's
  `g = clamp(d/D, 0.25, 1)`), and `SwayOscillator` (analytic damped pendulum,
  hard-clamped to ±6°, amplitude grows with input jerk, always damps).
- `src/game/anchorUtil.ts` — `anchorAllows(anchors,id,x,y,padding)`: the
  shared hit-tolerance/soft-lock-prevention rule used by every anchor-gated
  verb — **anchor never published → verb allowed** (renderer not wired up
  yet, or not yet on screen this frame), **anchor published+inactive →
  blocked**, **anchor published+active → padded-radius hit test**. This is
  why every phase still completes in isolation/unit tests with zero anchors
  registered.
- `src/game/constants.ts` — every tunable number in one place.

## Per-phase interaction notes (things not literally spelled out in
PRODUCT_SPEC.md that I had to decide)

- **"Drag anywhere" phases**: `hookDown`, `hoist`, and `climb` all react to
  raw drag deltas anywhere on screen (no anchor grab required), matching
  PRODUCT_SPEC's explicit wording for hookDown/hoist and extended to `climb`
  for the same soft-lock-prevention reason (it's the signature moment — must
  never fail to register). `align` also reads as anywhere-drag. Only `bolts`
  requires grabbing a specific anchor (`bolt0`/`bolt1`) first, since there
  are two distinct draggable objects the child must choose between.
- **`align`**: `align.dx/dy` in `GameState` represent the **cumulative
  offset the player has dragged the beam by**, not the raw remaining
  distance to the ghost (machine resets both to 0 on phase entry, which
  reads naturally as "no drag applied yet", not "beam already on target").
  The full required-offset vector (`ghost.pos - beam.pos`) is captured once
  from the anchor registry, but **lazily on the first real drag input**
  rather than at phase-entry time — the renderer publishes anchors on its
  own rAF cadence and may not have a fresh `beam`/`ghost` pair published in
  the exact tick `advance()` fires; by the time the child actually touches
  the screen it reliably does. Falls back to a fixed synthetic target
  vector/snap radius if `beam`/`ghost` are never published (keeps the verb
  completable even before the renderer is wired up, and is what the unit
  tests exercise for the anchor-free path).
- **`bolts`**: `GameState.bolts` only has a seated boolean per bolt — there's
  no field for a bolt's live position while mid-drag. Gameplay does not
  publish anything to the anchor registry for this (anchors are
  Renderer→Input one-way per the architecture doc), so **the 3D bolt mesh
  has no built-in way to visually follow the finger during the drag** in the
  current contracts. Recommend the Renderer/UX integrator either (a) keep
  the bolt static in the tray until `bolt:seated` fires and animate a snap,
  or (b) have UX's `hint-layer` DOM overlay draw a simple token following
  the pointer during the drag. Flagging this now since it's the one
  interaction where GameState genuinely can't carry the live drag visual —
  happy to discuss a payload addition to a `bolt:seated`-adjacent event if
  the Integrator wants one, but did not add one unilaterally since
  `GameEventMap` is frozen.
- **`rivetCarry`**: a wrong-direction swipe is "absorbed harmlessly" per
  spec ("worker shakes head, emit assist event") — there's no dedicated
  bus event for a rejected gesture in the frozen `GameEventMap`, so this
  re-emits `assist:breathe` targeting `'tongs'` (the correct next-worker
  anchor), which doubles as both the "no" feedback and a same-frame nudge
  toward the right gesture.
- **`playRivet` / `playClimb`**: the transition table only allows
  `playRivet/playClimb → complete` (no internal sub-phase transitions), so
  these loop entirely inside one `GamePhase` via a private sub-state machine
  in the controller closure (not in `GameState`) and drive `store.update()`
  directly instead of calling `advance()` between steps. `playClimb` reuses
  the exact same `createClimbController` as `climb` via a `loop: boolean`
  option — locking resets `climb` to the bottom and continues instead of
  advancing to `reveal`.
- **Timing scale**: every scripted-timing constant (attach beat, align hold,
  heat duration, cool duration, slack beat, settle beat, reveal dwell, and
  the two idle-assist thresholds) is run through `ctx.scaleMs()` (×0.25
  under `?test=1`). Physical-gesture constants are **not** scaled: tap/swipe
  classification thresholds (350ms/14px/velocity) and the rivetHammer
  250ms mash-debounce all model a real finger, not a scripted animation.
- **towerLevel**: bumped by the frozen `machine.ts` `PHASE_RESET['reveal']`
  on phase-entry (not something gameplay touches); the `reveal` controller
  only owns the passive dwell + `reveal:done` emit + advance to `complete`.
- **complete → replay dispatch**: per ARCHITECTURE_CONTRACT.md, UI owns the
  complete-screen menu and is expected to call the frozen `advance()`
  directly (same pattern the Wave 2 title-screen skeleton already uses for
  `title→opening`), setting `seed`/`beamShape` itself before dispatching a
  new-seed replay. Gameplay does not intercept or need a callback for this —
  our `opening`/`playRivet`/`playClimb` controllers just correctly resume
  whatever phase they're (re-)entered into, which is what the unit tests
  cover (`complete → playRivet → complete`, `complete → playClimb →
  complete`, replay-with-new-seed determinism).

## No-dead-end guarantee

Every interactive phase has a unit test (`src/game/__tests__/fullLoop.test.ts`,
`no dead ends` suite) that starts the phase **with zero anchors published**
and drives only the documented verb, asserting it still reaches the next
phase — this is the anchor-fallback rule in `anchorUtil.ts` proven per phase.
`src/game/__tests__/fullLoop.test.ts` also walks one complete
`opening → complete` loop with a full, realistic anchor layout and asserts
every phase is entered exactly once in canonical order, every one-shot bus
event (`snap:hook`, `snap:align`, `rivet:heated`, `rivet:formed`,
`rivet:cooled`, `sling:released`, `climb:locked`, `reveal:done`) fires
exactly once (no double-advance under any of the drive patterns used,
including simulated tap-mashing on the hammer and rivetCarry), and that two
harnesses built from the same seed stay in lockstep (determinism).

## Test files (69 gameplay tests + 4 input tests = 73 total; 106 with contracts')

`src/game/__tests__/`: `math.test.ts` (sway clamp/damping, approach gain),
`anchorUtil.test.ts`, `hookDown.test.ts`, `hoist.test.ts` (sway clamp during
active input), `align.test.ts` (gain deceleration + snap + fallback),
`bolts.test.ts` (seat/return/either-order/cancel/fallback), `rivet.test.ts`
(heat/carry/insert/hammer-debounce-and-no-double-advance/cool +
`playRivet` full cycle), `sling.test.ts`, `climb.test.ts` (monotonic
progress incl. release-latching + lock/settle/advance + `playClimb` loop),
`assist.test.ts` (breathe/point thresholds, once-per-streak, reset-on-input,
silent during passive phases), `fullLoop.test.ts` (full walk + no-dead-end ×
12 phases + determinism). `src/input/__tests__/gestures.test.ts` (pure
tap/swipe/drag classification boundaries).

`src/game/__tests__/harness.ts` is a shared test helper (not itself a
`*.test.ts`, so vitest's include glob doesn't collect it as a suite) that
builds a real `contracts` store/bus/anchor-registry + `createGameLogic`, and
synthesizes `GameIntent`s (`down/move/up/cancel/tap/swipe`) plus a fixed-step
`tick()` helper.

## Known issues / integration notes for Wave 4

1. **Bolt live-drag position** — see the `bolts` note above. Not a defect,
   just a gap in what `GameState`/anchors can carry; needs a Renderer/UX
   decision.
2. **`rivetCarry` wrong-swipe feedback reuses `assist:breathe`** — see note
   above; if a dedicated "rejected" cue is wanted later it needs a
   `GameEventMap` addition (Integrator-only file).
3. Gameplay never calls `Math.random()` anywhere — no randomness is needed
   for any phase's logic (physics/timers are all input- or clock-driven), so
   determinism holds trivially beyond what `contracts/machine.ts` already
   guarantees for `beamShape`.
4. `src/game/index.ts`'s `testMode` detection reads
   `URLSearchParams(window.location.search)` directly (same pattern the
   Wave 2 skeleton used) rather than receiving it as a constructor option —
   `createGame`'s signature is frozen and has no `testMode` field, so this
   matches how the frozen factory has to get that flag.
5. No `console.log`/`console.error` anywhere in `src/game/**`/`src/input/**`;
   no TODO/FIXME/placeholder/debug UI.
6. `dispose()` on both `createGame` and `createGameLogic` fully unsubscribes
   (bus listener + all five DOM pointer listeners) and holds no timers —
   verified via the full test suite constructing/discarding many harnesses
   without any teardown-related failures; no `setInterval`/`setTimeout` is
   used anywhere in gameplay (all timing is driven by the externally-supplied
   `update(dtMs)` tick), so there is nothing else to leak.

## Wave 6 audit fixes

Two independent findings, both in the `rivetCarry` handoff gesture.

### G1 [HIGH, child-ux] — swipe classification no longer averages velocity over the whole gesture

**Problem:** `src/input/gestures.ts`'s `classifyGesture` used to take a
single `{ durationMs, distPx, vx, vy }` summary computed as
`(endX - downX) / (endT - downT)` — one average velocity over the *entire*
down→up gesture. A correctly-aimed, decisive fast swipe-right could get
diluted below the swipe threshold if the gesture also contained a slow start,
a pause, or (per the finding) a stretch where events arrived in a burst after
a stall — the average speed over the whole gesture no longer reflected the
real, fast motion that happened within it.

**Fix:** `classifyGesture` now takes the full down→up pointer-event history
(`GesturePoint[]`, `{x, y, t}` with `t` = real `PointerEvent.timeStamp`) and
delegates swipe detection to `detectWindowedSwipe`, which does an O(n)
two-pointer sliding-window scan: for every sample `j`, compare it against the
oldest sample still within `SWIPE_WINDOW_MS` (600ms) of it; if the dominant-
axis displacement over that window reaches `SWIPE_WINDOW_MIN_DISPLACEMENT_PX`
(40px), it's a swipe in that direction — evaluated immediately at that
sample, independent of whatever happens before or after in the rest of the
gesture. Because the timestamps are the browser's real per-event
`PointerEvent.timeStamp` (captured at input time, not at JS-callback or
render-frame time), this is immune to a rAF/main-thread hitch: a hitch delays
*when the game renders*, never *when the browser timestamped the input*, so
a genuinely fast 40px/600ms flick is always found regardless of how choppy
playback was around it. `src/input/index.ts` now accumulates that history
(pushed on down/move/up, cleared on pointerup/cancel) instead of just
down/up; it still separately computes the whole-gesture average `vx`/`vy` for
the swipe intent's payload only (unchanged — `hoist.ts`'s sway physics reads
`intent.vy` for feel, that's a magnitude-of-force input, not a
classification decision).

Old `SWIPE_MIN_VELOCITY_PX_MS` (0.15px/ms average) is retired; the new
windowed threshold (40px/600ms ≈ 0.067px/ms in the worst case, and far more
lenient for short bursts) is at least as forgiving in every case that used
to qualify, so no previously-working swipe regresses.

Unit tests: `src/input/__tests__/gestures.test.ts` — rewrote the whole file
for the new history-based API, and added a `detectWindowedSwipe — hitchy
frame timing (G1)` block: a decisive 45px/80ms burst sandwiched between two
large dt gaps (400ms, 420ms) still registers `right`; a 40px/400ms window at
the tail of a 2200ms jank-spread gesture (whole-gesture average ≈0.02px/ms)
still registers `right`; small jitter that never crosses the threshold in
any window correctly stays `null`.

### G2 [ROBUSTNESS, product-director] — slow deliberate drag also completes the handoff

**Problem:** `rivetCarry` (and `playRivet`'s `carry` sub-phase) only reacted
to `kind: 'swipe'` intents. A 4-year-old who drags carefully and slowly
instead of flicking never produces a `swipe` intent at all (input classifies
it as `drag`, which — by design — has no dedicated `GameIntent`), so the
handoff could never fire no matter how far they dragged.

**Fix:** both `createRivetCarryController` and the `carry` case inside
`createPlayRivetController` now also track raw `down`/`move`/`up`/`cancel`
intents directly (shared via a new local `createCarryDragTracker` helper in
`src/game/phases/rivet.ts`): it remembers the x position where the finger
went down and, on every `move`, checks cumulative rightward displacement
from that baseline. Crossing `RIVET_CARRY_DRAG_HANDOFF_PX` (60px, new
constant in `src/game/constants.ts`, unscaled — it models real finger
travel like the existing tap/swipe pixel constants) fires the same handoff
path as a swipe (`doCarryHandoff`, also newly extracted and shared between
the two controllers). The baseline resets after each handoff fires, so one
continuous ~120px drag without lifting the finger can chain both handoffs
(station 0→1→2) straight through to `rivetInsert`. A leftward (or any
non-rightward) drag simply never crosses the positive threshold — harmlessly
absorbed, same spirit as a wrong-direction swipe, with no state change and no
`assist:breathe` spam from every move sample.

Unit tests, `src/game/__tests__/rivet.test.ts`:
- slow 70px rightward drag (ten 7px steps) advances station 0→1, no swipe
  intent involved;
- one continuous 130px drag chains both handoffs straight to `rivetInsert`;
- a 35px drag (under threshold) leaves station at 0;
- a slow leftward drag is absorbed harmlessly (no throw, no state change);
- `playRivet`'s `carry` sub-phase gets the same 130px-drag test, confirming
  the free-play loop is exactly as forgiving as the story flow.

### Regression check

Full `npx vitest run`: 30 files / 221 tests, all green (existing
`rivetCarry` swipe tests — including the wrong-direction-swipe-is-absorbed
test — pass unmodified; `fullLoop.test.ts`'s no-dead-end-×12-phases and
determinism tests pass unmodified). `npx tsc --noEmit` and
`npx eslint src/game src/input` both clean. `npx playwright test full-loop
--project=phone-portrait` (real synthesized pointer gestures end-to-end,
including a real swipe through `rivetCarry`): 2/2 passed.
