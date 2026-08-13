# VERIFICATION — evidence log

Only record what was actually executed, with real results. Update as verification runs.

## Environment

- Container: Linux (Claude Code remote), Node v22.22.2, npm 10.9.7
- Playwright 1.56.1; Chromium 1194 preinstalled at /opt/pw-browsers.
  WebKit binary: not preinstalled (no `playwright install` was run per environment
  instructions). Only Chromium was exercised — real Safari/WebKit and real
  iPhone/iPad hardware are both untested (known limitations of this container).
- **No GPU in this container** — Chromium falls back to software WebGL
  (SwiftShader). This does not affect correctness (draw calls, FSM state,
  screenshots are all identical in substance to what hardware WebGL would
  produce) but it makes every synthesized pointer round-trip in Playwright
  materially slower than on a real device (empirically ~0.3-0.5s of wall clock
  per `mouse.move` step, confirmed by isolated timing: three consecutive real
  toy-drag gestures took 5523ms/5200ms/5312ms each with no growth over time —
  i.e. genuinely slow rendering, not a leak). `e2e/full-loop.spec.ts` accounts
  for this explicitly (see "e2e test run" below and the README's "Known
  environment limitation" section).

## Runs

All commands below were executed for real in this container on 2026-08-13,
against the code on branch `claude/henshin-hoikushitsu-impl-f82vcb` at commit
range starting `5fe42c2`.

### `npm run lint` — PASS

`eslint .` — 0 errors, 0 warnings.

### `npm run typecheck` — PASS

`tsc --noEmit` (strict mode) — 0 errors.

### `npm run test` (Vitest, unit tests for `src/game/`) — PASS, 39/39

```
✓ tests/seeds.test.ts (6 tests)
✓ tests/fsm.test.ts (11 tests)
✓ tests/rng.test.ts (6 tests)
✓ tests/objectives.test.ts (8 tests)
✓ tests/intent.test.ts (8 tests)

Test Files  5 passed (5)
     Tests  39 passed (39)
```

Covers: mulberry32 RNG determinism/uniformity, seed→layout determinism and
the 3 curated seeds' mutual distinctness, capture-radius math (including the
exact `radius × 2.2` boundary), every per-phase objective reducer
(store/wipe/place/unroll/roll-back, including the float-precision "snap to
1" behavior described below), and the full FSM phase-loop traversal
(TITLE→…→REPLAY→PLAY_CLEANUP, replay-same-day keeping the seed, shuffle
changing it, free-play reachable and returning to REPLAY, illegal-transition
rejection, progress reset on replay).

### `npm run build` — PASS

```
tsc --noEmit && vite build
dist/index.html                   0.82 kB │ gzip:   0.54 kB
dist/assets/index-Bko28SU9.css    3.61 kB │ gzip:   1.09 kB
dist/assets/index-ByxmX2YZ.js   622.56 kB │ gzip: 161.52 kB │ map: 3,100.31 kB
✓ built in 2.16s
```

### `npm run test:e2e` (Playwright, against the production build via preview) — PASS

Full run, all 4 projects (mobile-portrait 393×852, mobile-landscape 852×393,
tablet-portrait 834×1194, tablet-landscape 1194×834), single worker:

```
38 passed, 10 skipped (23.8m total)
```

The 10 skips are intentional scoping, not failures:
- `full-loop.spec.ts`'s expensive real-gesture test (`test.setTimeout(600_000)`)
  is restricted to the two phone projects (`mobile-portrait`, `mobile-landscape`)
  — it produces the primary named screenshot set (bare names) on portrait and
  the `-landscape` suffixed set on landscape. Running it a 3rd/4th time on the
  tablet projects would only re-prove the same interaction code path at a
  different aspect ratio for ~5 more minutes each with no new coverage, so
  tablet screenshot coverage comes from `screenshots.spec.ts` instead (below).
  → 2 skips on tablet-portrait/tablet-landscape.
- `screenshots.spec.ts`'s "tablet title + cleanup" test is restricted to the
  2 tablet projects → 2 skips on the phone projects.
- `screenshots.spec.ts`'s seed-2/seed-3 screenshot tests are restricted to
  `mobile-portrait` (one representative viewport is enough to show seed
  variation — this is also independently proven headlessly by
  `persistence-seed.spec.ts`'s "3 curated seeds produce visibly different
  ... layouts" test, which runs on all 4 projects) → 2×3 = 6 skips.

Per-spec results (all passed on every project unless noted as scope-restricted above):

| Spec | What it checks | Acceptance rows |
|---|---|---|
| `full-loop.spec.ts` ("full play loop…") | Title→PLAY_CLEANUP→LUNCH_SETUP→LUNCH_CLEANUP→NAP_SETUP→WAKE_RESTORE→REPLAY via **real synthesized pointer gestures** (drag/tap/swipe/trace) for every signature-moment interaction type at least once per phase (see note below); zero console errors; replay-same-day reachable in 1 tap from REPLAY | A1, A2, A4, B1-B6, C1, C4, C5, C7, D5 |
| `full-loop.spec.ts` ("replay shuffle…") | Shuffle picks a new seed and returns to PLAY_CLEANUP; free-play mode reachable, morphs playroom/lunch/nap in any order with no gating, exits back to REPLAY | A5 |
| `console-errors.spec.ts` | Zero console errors/pageerrors across a full harness-driven loop, all 4 viewports | D5 |
| `orientation.spec.ts` | Storing 2/7 toys, rotating portrait→landscape mid-`PLAY_CLEANUP`, phase + stored-toy progress both survive, and a further real toy-drag still works post-rotation | D1, D2 |
| `persistence-seed.spec.ts` (4 tests) | Reload → TITLE with a working play button; mute toggle (clicked for real, not via harness) persists across reload and the game stays fully playable muted; same `?seed=` reproduces an identical `SeedConfig` snapshot on reload; the 3 curated seeds produce 3 distinct snapshots (toy start positions, basket↔symbol assignment, weather, mat colorways) | A6, D3, E2 |
| `draw-calls.spec.ts` | `renderer.info.render.calls` sampled at TITLE and both before/after every phase transition, asserted ≤130 at every sample | F2 |
| `screenshots.spec.ts` | Tablet title/cleanup screenshots (2 projects); seed 2 & 3 title/cleanup screenshots | A6 (visual) |

**Note on `full-loop.spec.ts`'s gesture strategy:** every gesture *type*
(drag, tap, long-swipe/scrub, trace) is performed with a real synthesized
Pointer/mouse event sequence at least once per phase — e.g. one toy is
dragged into its basket with a live mid-drag screenshot, the table is
dragged out, a chair is tapped, the tray cart is dragged, one tray is
dragged back, the table is wiped with an 11-point trace, one mat is carried
and swiped to fully unrolled (with a live mid-swipe screenshot), the curtain
is dragged closed then later dragged open, one mat is swiped back to rolled.
The *repetitive* remainder of each phase's objective (the other 6 toys, the
other 3 chairs/trays/mats) is finished through
`window.__game.forceCompleteCurrentPhaseVisuals()` — a harness method added
specifically for this purpose that runs through the **same FSM setters and
visual-update code** a real gesture triggers (`furniture.animateTableTo`,
`mats.setStateInstant`/`showBedding`, `fsm.attemptStoreToy`, etc.), not a
raw FSM-only shortcut. This was a deliberate, measured trade-off recorded
here rather than silently: an isolated timing check showed 3 consecutive
real toy-drags took ~5.2-5.5s each with no growth over time (i.e. this
sandbox's software rendering is simply slow, not leaking), and a fully
repeated real-gesture pass (~40 drags) was empirically ~9-10 minutes per
viewport and added no additional interaction-correctness coverage beyond
one real demonstration per gesture type. The originally-required raw
harness-only fast-forward (`completeCurrentObjective()` + `advancePhase()`,
still exposed and exercised by `console-errors.spec.ts`,
`draw-calls.spec.ts`, and `orientation.spec.ts`) does **not** update scene
visuals, so it was insufficient on its own for a test that also needs to
screenshot correct-looking furniture/mat state — hence the new
`forceCompleteCurrentPhaseVisuals()` harness addition.

### Draw calls measured (via `renderer.info.render.calls` through the harness)

| Viewport | Peak observed |
|---|---|
| mobile-portrait (393×852) | 95 |
| mobile-landscape (852×393) | 117 |
| tablet-portrait (834×1194) | 117 |
| tablet-landscape (1194×834) | 117 |
| **Max across all 48 samples, all viewports** | **117** |

All comfortably under the 130 hard cap; landscape/tablet framings run closer
to the ~120 soft target than portrait (wider FOV shots put more of the room
— more toys/baskets/furniture at once — in frame simultaneously). No sample
in any run exceeded 117.

## Real bugs found and fixed during verification

Manual smoke-testing (real synthesized pointer gestures against a running
`vite preview` server, before the formal e2e suite was authored) surfaced
several real defects that unit tests alone could not catch, all fixed on
this branch:

1. **Lighting was never added to the scene.** `LightingRig`'s `THREE.Group`
   (containing the key/hemisphere/fill lights) was built but never passed to
   `scene.add()` — every material rendered fully unlit (black). Confirmed by
   screenshot before/after; cranking light intensity had zero visual effect
   until the fix, proving it wasn't an exposure problem.
2. **No tone mapping with physically-based light units** produced a
   near-black render even after the lighting fix — added
   `ACESFilmicToneMapping` + exposure tuning.
3. **CSS pointer-events layering bug**: hidden overlay layers (`.title-layer`,
   `.replay-layer`, `.freeplay-layer`) and their buttons both set
   `pointer-events: auto`, so buttons stayed clickable even while their
   parent layer was invisible (a real drag once mis-fired `replaySameDay()`
   mid-`PLAY_CLEANUP`). Fixed with a `visibility` + `pointer-events:none`-on-
   container pattern (`visibility` cannot be re-enabled by a hidden
   ancestor's descendant, unlike `pointer-events`).
4. **`padding: 18%` on `.replay-card`** resolved against the *flex
   container's* width (a CSS quirk — percentage padding always uses the
   containing block's width, not the element's own), consuming the entire
   ~140px card and leaving the SVG icon a literal 0×0px box. Screenshots were
   showing blank replay cards. Fixed with fixed-px padding.
5. **Raycast proxy overlap**: nap-mat pick spheres (radius 0.16, spaced only
   0.16 apart) and stacked tray/wipe proxies overlapped enough that
   `Raycaster.intersectObjects` sometimes picked the wrong target — trays
   were miscounted, mats sometimes failed to be grabbable. Fixed by
   widening spacing/shrinking radii and sequencing wipe-proxy availability
   after all trays return.
6. **Tray-return "already returned" state used a count-based heuristic**
   (`i < 4 - traysReturned`) instead of tracking which specific tray index
   had been returned, so `getPickables()` kept resetting an
   already-returned tray's proxy back to its seat position. Fixed with an
   explicit `trayReturned: boolean[]`.
7. **Camera never stopped mid-tween when locked.** `CameraDirector.setLocked`
   set a flag that blocked *new* tweens but didn't cancel an *in-progress*
   one, violating the interaction spec's "camera locked during any drag"
   rule and causing real flakiness when a gesture started during a
   still-animating shot transition. Fixed by having `setLocked(true)` cancel
   the camera's own active tween via the shared `TweenManager`.
8. **Mat-unroll bedding never credited to FSM state through real play.**
   `SceneRoot`'s real-gesture handler showed the bedding *visually*
   (`mats.showBedding`) once progress reached 1, but never called
   `fsm.placeBeddingItem()` — only the test harness's
   `completeCurrentObjective()` did. Since `isNapFurnitureReady()` requires
   `beddingPlaced >= 4`, the nap vignette (and therefore the whole
   NAP_SETUP → WAKE_RESTORE transition) could never fire through real
   play. This was a genuine gameplay-blocking bug, not a test artifact —
   fixed by calling `fsm.placeBeddingItem()` in the real-gesture handler too.
9. **Local vs. FSM-stored unroll-progress mismatch.** The bug above was
   compounded by `SceneRoot` comparing its own locally-computed
   (un-snapped) swipe progress against `1` to decide whether a mat had just
   finished unrolling, while `objectives.ts`'s reducer snaps any value
   `>0.97` up to exactly `1` internally. The two could disagree by a few
   hundredths, silently skipping the "just finished" transition. Fixed by
   reading back the FSM's own stored (snapped) value for that comparison.
10. **Float-precision "stuck just under 1.0."** Both `wipeProgress`
    (summing `1/15` per grid cell) and mat `unrollProgress` could land at
    e.g. `0.9999999999999999` due to binary floating-point rounding,
    permanently failing a strict `>= 1` completion gate. Fixed by snapping
    values `>0.97`/`>0.999` up to exactly `1` in the respective reducers —
    also a deliberate "generous" design choice consistent with the game's
    forgiving intent-inference philosophy, not just a technical patch.
11. **Camera framing didn't fit the interactive layout at portrait aspect
    ratios.** Several early camera-shot presets (cleanup, transform/lunch,
    mat/nap) and a few world positions (basket slots, table/cart/chair-stack
    alcoves, the nap mat stack, mat-marker spacing) were tuned by eye without
    checking screen-space bounds; on the narrowest viewport (393px) some
    baskets/handles/markers projected off-screen. Fixed by recalculating
    camera FOV/position and tightening world-space layout, then verifying
    with the harness's `screenPositionOf*` projections across all 4
    viewports before relying on them in the e2e suite.

## Acceptance matrix status

Rows verified ✅ by the runs above: A1, A2, A3 (grep for TODO/FIXME/placeholder
across `src/` — none found), A4, A5, A6, B1-B6, C1, C4, C5, C6 (no
timers/scores/stars/fail-states exist anywhere in the code), C7, D1, D2, D3,
D4 (`env(safe-area-inset-*)` used on every screen-edge-anchored UI element),
D5, D6, E1 (`AudioEngine.resume()` is only ever called from the pointerdown
handler), E2, E3 (`prefers-reduced-motion` media query read at startup, OR'd
with the persisted toggle, both wired to `SceneRoot.setReducedMotion`), E5
(`src/game/persistence.ts` only ever reads/writes 3 keys: mute, reduced
motion, last seed), F1 (`AdaptiveQuality` caps DPR at `min(devicePixelRatio,
2)` and steps 2→1.5→1 after 20 sustained frames >40ms — the step-down logic
itself is unit-testable but was not driven to actually trigger in this
container, since a forced-slow-frame harness hook wasn't built), F2, F4
(`visibilitychange` cancels/resumes the `requestAnimationFrame` loop in
`main.ts`), F5, F6.

Not independently exercised in this container (honest gaps, not claimed as
passing):

- **C2** (padded raycast in 3D) — proxy sphere radii are generous by
  construction (documented per-system in code) and picking worked reliably
  across the full real-gesture e2e run, but there is no automated assertion
  of the literal geometric padding ratio.
- **C3** (3s wiggle / 7s ghost-trail hints) — implemented
  (`SceneRoot.updateHints`) and manually inspected via source review, but no
  e2e test drives real idle time (the harness deliberately disables hints
  under `?test=1` to keep other tests deterministic) to assert the wiggle/
  chime and ghost-trail actually fire at the 3s/7s marks.
- **E4** (no flashing >3Hz) — no strobing effects exist in the code (visual
  review), but not machine-verified via a frame-capture analysis.
- **F1**'s DPR step-down and **F3** (no per-frame allocations) — spot-checked
  by code review (render loop reuses scratch `Vector3`/`Matrix4` objects,
  `TweenManager` compacts in place); one known small exception is
  `SceneRoot.computeHintTarget()`, which can allocate a `Vector3` while idle
  hints are being evaluated (bounded to idle periods, not during active
  drag/render-heavy frames) — not a violation of the render hot path but
  not literally zero-allocation either.
- **WebKit/Safari** — not installed in this container (see Environment);
  Chromium-only per DECISIONS.md #12's documented environment constraint.
- **Real iPhone/iPad hardware** — none available in this container.
