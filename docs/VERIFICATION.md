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

## Fix round 1

Applied after three independent fresh-context reviews were triaged into a
single blockers/majors/minors list (B1-B7, M1-M11, m1-m3) plus 3 new e2e
tests (T1-T3). All items implemented on branch
`claude/henshin-hoikushitsu-impl-f82vcb`, verified in this same container on
2026-08-13.

### What changed (by item)

**Blockers**
- **B1** — portrait `SHOTS` camera table in `src/scene/camera.ts` rebuilt
  from scratch for all 5 shots, with separate phone/tablet presets
  (`Record<ShotName, Record<DeviceClass, Record<Orientation, ShotPreset>>>`).
  Lower vertical FOV and shallower pitch fix the vertical blowout portrait
  previously had. Landscape presets untouched. A regression this surfaced
  (chair-stack tap target pushed off-screen in the `transform` shot) was
  found and fixed during verification by re-deriving `transform.phone/tablet
  .portrait` with wider FOV and a shifted target x.
- **B2** — `createSymbolAtlas` (`src/scene/materials/textures.ts`) now draws
  a cream backdrop disc with a dark outline behind every icon, and
  `baskets.ts` adds a large up-facing symbol plane on the basket's interior
  floor, merged into the existing symbol mesh — readable from the overhead
  cleanup camera.
- **B3** — `toys.ts` renders `toy.def.symbol` as a decal (shares
  `BASKET_SYMBOL_ATLAS`) and colors each toy's accent to match its correct
  basket via `BASKET_COLORS`, imported from `baskets.ts`.
- **B4** — `fsm.ts`'s `attemptStoreToy()` only emits `toyRejected` when a
  basket is actually nearby (`nearest && nearest.withinRadius`); dead-space
  drops now settle in place instead of tweening back to spawn.
  `TweenManager.add()` gained an optional `key` that cancels any prior tween
  registered under the same key, and toy-position tweens are now keyed —
  fixes the race where a fast second drop could fight an in-flight return
  tween.
- **B5** — the `.version-tag` overlay div and its `__APP_VERSION__` read
  were removed from `Overlay.ts`/`style.css`.
- **B6** — `BlobShadowManager` (`shadows.ts`) gained `free(index)` and a
  `usedCount` getter; the pool is freed on toy/basket disposal instead of
  only ever growing.
- **B7** — `SceneRoot.onSeedChanged()` now disposes the old `ToySystem` /
  `BasketSystem` / `MatSystem` (each gained a `dispose()`) before rebuilding;
  `SceneRoot.dispose()` walks every subsystem. Procedural canvas textures
  (wood grain, fabric weave, symbol atlas, blob shadow) are now created once
  at module level instead of per-seed.

**Majors**
- **M1** — `SceneRoot` gained `basketsVisible` + `setBasketsVisible(visible,
  animate)`, wired into phase changes and free-play mode so baskets fade
  out/in instead of staying visible through phases where they're irrelevant.
- **M2** — `lighting.ts`'s `NAP` preset rewritten from cold navy to dim warm
  amber, plus a new rim light (`LightingRig.rim`) for separation.
- **M3** — wood-grain and blob-shadow procedural texture contrast raised
  (`materials/textures.ts`); curtain material darkened/more opaque
  (`curtain.ts`). Chose strengthening blob shadows + contrast over enabling
  a real shadow map (stays inside the draw-call/perf budget on
  software-rendered WebGL).
- **M4** — `replaySameDay` icon in `ui/icons.ts` redrawn with a bold 15px
  stroke arc and a real arrowhead instead of a plain circle.
- **M5** — the 3s wiggle/pulse hint block in `SceneRoot.updateHints()` is
  now gated behind `if (!this.reducedMotion)`.
- **M6** — lunch `transform` camera pitch raised and `SEAT_OFFSETS`
  staggered in `furniture.ts` so all 4 chairs/children are visible instead
  of 2.
- **M7** — `stackRotationY(index)` alternates yaw per stacked chair so the
  stack reads as individual chairs, not a plain block tower.
- **M8** — `SceneRoot` gained `setupContextLossHandling()` /
  `showContextLossOverlay()`, listening for `webglcontextlost`/
  `webglcontextrestored` and showing a recovery overlay
  (`.context-loss-overlay` in `style.css`).
- **M9** — `PointerController` gained a dedicated `onCancel` handler (was
  previously routed through `onUp`), so a `pointercancel` mid-drag is always
  treated as incomplete rather than potentially completing the gesture.
- **M10** — hoisted scratch `Vector3`/`Vector2`/`Quaternion` objects to
  module level in `mats.ts`, `furniture.ts`, and `baskets.ts`'s
  `setAttention` (runs per basket per pointermove while dragging) —
  removed per-frame allocations in these hot paths.
- **M11** — clouds in `room.ts` rebuilt from 3-4 merged squashed lumps
  instead of plain spheres; toys gained a `plushLumpGeometry` for fabric
  items so toy families are silhouette-differentiated.

**Meaningful minors**
- **m1** — `AudioEngine.setMuted()` ramps gain over ~30ms via Web Audio
  scheduling instead of a hard step, removing the mute click/pop.
- **m2** — `overview.phone/tablet.landscape` camera nudged (+0.35 x) so the
  title block tower no longer sits on the play-button centerline.
- **m3** — `.replay-card` restyled in `style.css` as a wooden picture tile
  (gradient + inset bevel shadows), tap targets kept ≥72px.

**e2e additions**
- **T1** `e2e/shuffle-leak.spec.ts` — loops `replayShuffle()` x8 (9 full
  play-loop passes total: 1 warmup + 8 measured), asserts `shadowSlotsUsed`
  stays a constant value across all 8 shuffles (was unbounded growth
  pre-B6) and JS heap growth (CDP `Runtime.getHeapUsage`, forced GC before
  each sample) stays under a generous 15% threshold after warmup.
- **T2** `e2e/pointercancel.spec.ts` — starts a real table drag, dispatches
  a synthetic `pointercancel`, asserts the drag objective stays incomplete
  and the table tweens back to its stored position.
- **T3** `e2e/reduced-motion.spec.ts` — two tests. Asserts the eating
  vignette's auto-advance wall-clock is shortened under reduced motion, and
  that a real wipe gesture spawns zero sparkles under reduced motion vs.
  spawning some without it (control test).

### Re-run results

All commands re-run for real in this container against the fixed code:

```
npm run lint        — PASS (0 errors, 0 warnings)
npm run typecheck   — PASS (tsc --noEmit, 0 errors)
npm run test        — PASS, 39/39 (5 test files, unchanged from baseline —
                       fix round 1 touched no unit-tested game-logic module
                       signatures other than fsm.ts's attemptStoreToy, whose
                       existing fsm.test.ts coverage still passes)
npm run build        — PASS
npm run test:e2e     — PASS, 54 passed, 10 skipped, 0 failed (41.5m total),
                       all 4 projects (mobile-portrait 393×852,
                       mobile-landscape 852×393, tablet-portrait 834×1194,
                       tablet-landscape 1194×834), single worker
```

The 10 skips are the same intentional scoping as the original verification
pass (see "npm run test:e2e" section above) plus the new specs following
the same phone/tablet full-loop-vs-screenshot split; no new unexplained
skips were introduced. `test-results/` contains no failure subdirectories
after the run (only `.last-run.json`), confirming zero failures across the
full battery.

New spec files added this round: `e2e/shuffle-leak.spec.ts`,
`e2e/pointercancel.spec.ts`, `e2e/reduced-motion.spec.ts` (2 tests) — 4 new
e2e tests × 4 projects = 16 new test instances, all passing.

### New measured numbers

- **Draw calls (peak)**: **112**, sampled at `TITLE` phase on
  `mobile-landscape` — the true peak across all 4 viewports. Under the
  ≤120 hard cap in CLAUDE.md/DECISIONS.md #10, and below the fix-round-1
  reviewer's noted starting point of 119. Per-viewport peaks:
  mobile-portrait 88, mobile-landscape 112, tablet-portrait 90,
  tablet-landscape 110. Full mobile-landscape sample sequence (the peak
  viewport): `TITLE:112, PLAY_CLEANUP:110→91, LUNCH_SETUP:82×2,
  LUNCH_CLEANUP:82×2, NAP_SETUP:82×2, WAKE_RESTORE:82×2, REPLAY:82`.
  During development, adding B2's up-facing basket symbol and B3's toy
  decal temporarily pushed this to 125 (over budget); fixed by merging
  same-material basket meshes (body+rim+bottom into one geometry, the two
  symbol decals into another) via the existing `mergeGeometries` helper,
  landing at 2 draw calls per basket instead of a naive 5.
- **T1 heap/shadow-slot leak check** (`shuffle-leak.spec.ts`, all 4
  projects): `shadowSlotSamples` flat at `[7,7,7,7,7,7,7,7]` across 8
  reshuffles on every viewport (pre-B6 this grew unbounded, 7/14/21/…,
  overflowing the fixed 48-slot `InstancedMesh` pool around the 7th
  shuffle). Heap growth after a warmup pass, per viewport: mobile-portrait
  **10.4-10.5%** (two runs), mobile-landscape **8.0%**, tablet-portrait
  **8.2%**, tablet-landscape **8.6%** — all comfortably under the 15%
  threshold. `heapAfterWarmup`/`heapAfterShuffles` land around 6.0-6.8MB
  across all runs.
- **T3 reduced-motion timing** (`reduced-motion.spec.ts`, all 4 projects):
  eating vignette auto-advance wall-clock ranged **6109-6349ms** under
  reduced motion across viewports vs. the full ~8.4s (8000ms
  `VIGNETTE_MS` + 400ms furniture-ready delay) without it — consistent
  with the spec's `VIGNETTE_MS * 0.6` reduction. Sparkle count delta: 0
  under reduced motion during a real wipe gesture on every viewport, >0 in
  the un-reduced control on every viewport.
- **T2 pointercancel**: passes on all 4 viewports — table returns to its
  stored y position and `tableOut` stays `false` after a mid-drag
  `pointercancel`.

### Screenshot set regenerated

The full named screenshot set under `artifacts/screenshots/` was
regenerated in this run (same filenames as the original verification
pass, all with fresh 2026-08-13 timestamps), including every portrait
shot (`title.png`, `cleanup.png`, `drag-mid.png`, `lunch-set-start.png`,
`lunch-set.png`, `eating.png`, `lunch-cleanup-done.png`, `wipe.png`,
`mat-unroll-mid.png`, `mat-unroll-done.png`, `nap.png`, `stars.png`,
`wake.png`, `replay.png`, `restored.png`) plus the `-landscape` and
`-tablet-portrait`/`-tablet-landscape` variants and the seed-2/seed-3
title+cleanup shots — visually re-confirming the B1 portrait camera
rework and the M2 nap/stars amber-lighting fix.

### Files removed

- `.shot.mjs` — ad hoc diagnostic script used during B1 camera-value
  derivation and screenshot spot-checks; deleted before the final commit
  of this round (not part of the shipped codebase, same pattern as the
  original verification pass).
