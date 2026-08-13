# Renderer handoff (Wave 3a)

Owner: Renderer. Paths: `src/core/**`, `src/render/**`, `src/scene/**`, `src/visual/**`.

Status: `npx tsc --noEmit`, `npx eslint src/core src/render src/scene src/visual`, and
`npx vitest run src/core src/render src/scene src/visual` all pass (65 unit tests, 0
errors). `npx vite build` succeeds, bundle ≈141 KB gzip (well under the 900 KB target;
`three` is still the only runtime dependency). Manually smoke-tested the built app with
a headless Playwright script against 2 viewports × 15 phases (via `window.__game`) —
zero console/page errors, `renderer.getStats()` stayed at 58–74 draw calls / ~4.4k–5.4k
triangles across all phases (budget: ≤90 normal / ≤110 climb draw calls, ≤250k
triangles), so there's large headroom for Gameplay/UX's own draw calls.

**Note on this worktree**: the branch this workflow gave me (`wf_1dc4fa45-8c8-1`) was
missing the Wave 2 foundation commit (`docs/`, `src/contracts/**`, scaffold) — only the
repo's very first commit was present. I merged
`origin/claude/steam-crane-tower-game-ez5x7n` (the foundation branch) into this worktree
before starting so the frozen contracts/scaffold were available; flagging this in case
the integrator needs to know the worktree's history looks like a merge rather than a
linear sequence of Renderer-only commits.

## Public API (frozen contract, implemented exactly)

```ts
// src/core/index.ts
createRenderer({ canvas, store, bus, anchors }) => {
  ready: Promise<void>; start(): void; stop(): void; resize(): void;
  setQuality(q: 'low'|'mid'|'high'): void; isSettled(): boolean;
  getStats(): { drawCalls, triangles, fps }; dispose(): void;
}
```

## File map

```
src/core/index.ts        WebGLRenderer (antialias off, high-performance, sRGB, ACESFilmic),
                          its own rAF loop, resize, context-loss/-restore, adaptive-quality
                          wiring, anchor-projection pass. Thin: all content built elsewhere.

src/render/quality.ts        Pure adaptive-quality step machine (EMA frame time, >24ms for
                              ~3s steps high->mid->low, never up; QUALITY_SETTINGS per tier).
src/render/anchorProject.ts  Pure world->CSS-px projection + a projected-radius helper.
src/render/cameraCompose.ts  Pure per-aspect (portrait/landscape) camera shot table
                              (spherical distance/elevation/azimuth/blend/fov per
                              CameraCueName) + easing/duration math.
src/render/camera.ts         CameraDirector: GamePhase -> CameraCueName (bus 'cam:cue'
                              can override mid-phase), composes a transform from live
                              scene focus points every frame, approaches it via
                              exponential smoothing (reads as an eased ~1.2s transition,
                              ×0.25 in test mode, near-cut under reducedMotion, and keeps
                              "following" moving subjects without re-triggering).
src/render/index.ts          Re-exports the above for src/core/index.ts.

src/scene/curve.ts        Pure leg-profile math (inward-curving radius(t), offset,
                           tangent) — the single source of truth for leg shape, lattice
                           placement, and the crane's rail path.
src/scene/beamShapes.ts   Pure per-BeamShape ('girder'|'xpanel'|'curved') member-list +
                           rivet-joint generator.
src/scene/cableMath.ts    Pure CatmullRom cable-curve sampling + an endpoints-changed
                           epsilon check (cable.ts only rebuilds TubeGeometry when this
                           is true).
src/scene/tower.ts        4 curved legs (merged, 1 draw call, REBUILT — not just the
                           lattice — on towerLevel change so the tower visibly grows,
                           with a small fixed protrusion above the last complete row
                           for the "unfinished top" read), X-lattice bracing + gusset
                           dots (InstancedMesh).
src/scene/crane.ts        Hierarchical rig: carriage+wheels -> superstructure (boiler,
                           chimney, brass band, cable drum+wound-cable rings) -> boom
                           (lattice, InstancedMesh-free merged geometry) -> sheave ->
                           hookBlock (NOT parented under the crane group — its world
                           pose is fully driven by scene/index.ts's hook/hoist/align/
                           sway math so it doesn't inherit the crane's rail-following
                           yaw+lean). Exposes `driverSlot` (crane-driver worker parents
                           here so it free-rides the climb) and world anchors.
src/scene/beam.ts         The real beam + ghost silhouette + 2 bolts/holes + rivet hole
                           + slot-attach point, all positioned from one `placeSlot()`
                           call per frame plus a local bolt seat-progress lerp (state
                           only carries booleans for bolts, so the 0..1 seat animation
                           lives here, reset implicitly since it just tracks toward the
                           boolean target every frame).
src/scene/rivet.ts        The rivet (emissive color via visual/rivetColor.ts, head
                           squash->round-swap morph driven by hits/3) + forge/brazier
                           with emissive coals + a small flickering point light.
src/scene/workers.ts      4-role rivet team (heater/catcher/holder/striker) + crane
                           driver: 2 draw calls each (merged static body + one
                           shoulder-pivoted tool arm), role-distinct tools/silhouettes.
src/scene/backdrop.ts     Sky handled by core (scene.background/fog); Seine ribbon,
                           instanced Haussmann blocks, Trocadero silhouette, 1-2 arched
                           bridges, instanced cloud sprites. setDetail() thins instance
                           counts for adaptive quality.
src/scene/yard.ts         Timber deck, spare-beam stack, instanced crates.
src/scene/cable.ts        THREE TubeGeometry wrapper over cableMath.ts.
src/scene/index.ts        Orchestrator: builds/owns every rig above, maps GameState ->
                           every world transform each frame (see "State mapping" below),
                           publishes `points` (named world-space focus points for the
                           camera) and `anchorWorld` (world positions the core layer
                           projects to screen + publishes via AnchorRegistry).

src/visual/textures.ts    Procedural canvas textures (iron/timber/haussmann/sky/soft-
                           circle/spark), all ≤256px, seeded PRNG only.
src/visual/materials.ts   Shared MaterialSet built once from the texture set; every
                           rig pulls from here (no per-rig material duplication).
src/visual/rivetColor.ts  Pure temp/cooled -> {color, emissive, emissiveIntensity} ramp.
src/visual/steam.ts       Pooled InstancedMesh billboard steam puffs (≤120, cap
                           adjustable), reducedMotion halves+slows bursts.
src/visual/sparks.ts      Pooled InstancedMesh streak sparks (≤40) for hammer hits.
src/visual/shadow.ts      Cheap blob-shadow decals (no shadow maps), 1 draw call.
```

## GameState -> visuals mapping (the parts worth knowing about)

- **Tower**: `state.towerLevel` rebuilds legs+lattice+gussets (rare — only 9 possible
  values). Legs themselves grow with level (previously a bug during development: they
  used to always span full max height regardless of level, which also produced a
  degenerate establish-camera framing since the "topOfLeg" focus point ended up
  extremely close to a still-mostly-unbuilt leg's base — fixed by rebuilding leg
  geometry to `builtHeight + a small fixed protrusion`).
- **Hook/beam**: before `hook.attached`, the hook free-hangs under the sheave by
  `hook.depth`. Once attached and not yet `align.snapped`, the beam hangs directly
  under the hook (hoist height + pendulum `sway` + `align.dx/dy`). Once `align.snapped`
  is true, the beam **freezes exactly at the slot** (same transform as the ghost) for
  the rest of the build (bolts/rivet*/sling) — this is a deliberate simplification: the
  contract doesn't specify continued hook/beam coupling after snap, and freezing avoids
  needing extra state. The hook itself stays visually taut against the beam's
  slot-attach point until `sling.released`, then eases (locally-tracked lerp, not part
  of GameState) up to an idle drop under the sheave.
- **Bolts**: `state.bolts` is `[boolean, boolean]`; the 0..1 seat animation between
  "tray" and "hole" is a **local** value in scene/index.ts that eases toward whichever
  boolean is current every frame (₍testMode₎ snaps instantly). `beam.boltCurrentPosition(i)`
  is exposed so the anchor registry publishes the bolt's *current* draggable position,
  not always its rest position.
- **Rivet**: color/emissive is a pure function of `rivet.temp`/`rivet.cooled`
  (visual/rivetColor.ts, unit-tested). Head "forms" by squashing a flat-cylinder
  geometry toward round proportions as `hits/3` rises, swapping to a true
  SphereGeometry at 1.0. Position moves between forge -> catcher's tongs -> holder's
  position -> the hole based on `rivet.station`, snapping to the hole once
  `rivet.inserted`.
- **Climb**: crane height = `tower.builtHeight + climb.progress * LEVEL_HEIGHT` (only
  while `phase` is `climb`/`playClimb`; 0 elsewhere) — this means the crane visually
  arrives exactly at the *new* top just as `reveal` grows the tower to match, with no
  seam. Wheel spin rate follows `climb.lever`; steam valve bursts scale with it too.
- **Anchors**: every `AnchorId` from the frozen list is published every frame with a
  live world position; only the `active` flag is gated by phase (see
  `ANCHOR_ACTIVE_BY_PHASE` in scene/index.ts) so a phase only advertises the one verb
  it wants hit-tested. Screen radius is `max(projected world radius, 48px)` per the
  "generous radius ≥48px" requirement. `AnchorId: 'lever'` is the decorative
  title-screen start lever (distinct from `'climbLever'`) — inferred from
  PRODUCT_SPEC's "大きな▶レバー" title description since the frozen AnchorId list
  has both a generic `lever` and a `climbLever`, and nothing else in the spec needs a
  second lever.

## Known gaps / flagged decisions for the integrator

1. **`assist:breathe` / `assist:point` bus events are not consumed by the Renderer.**
   Re-reading the task split: SCENE's requirement is "worker poses driven by rivet
   station/hits" (implemented) and "worker anchor points published for assist
   pointing" (implemented — worker0-3 are always live). I read the idle-breathing
   *visual* (a halo/scale pulse at the target anchor) as belonging to UI's hint-layer,
   which already has the anchor's screen position+radius from the registry and can
   draw a DOM/canvas pulse without any 3D involvement. If Gameplay/UX expect the
   Renderer to *also* scale a 3D mesh at the target anchor on `assist:breathe`, that's
   not implemented — flag if needed, it's a small addition (the ghost's own pulse
   already demonstrates the pattern in scene/index.ts).
2. **Mid-session reseed (`state.seed` changing via the "different beam" replay
   option) does not re-seed worker cloth colors or backdrop cloud/building layout** —
   those are seeded once at `createSceneRig(seed)` construction. Only
   `state.beamShape` (re-picked from the new seed by Gameplay/machine.ts) and
   `state.towerLevel`-driven geometry react live. Rebuilding the whole scene rig on
   every replay felt wasteful/risky (would need careful dispose-and-rebuild of every
   sub-rig mid-game) for a cosmetic detail; flagging in case product wants it.
3. **Visual staging is "reasonably good," not exhaustively art-directed.** I iterated
   the camera composition table (src/render/cameraCompose.ts) against real screenshots
   twice (once to fix a degenerate establish shot caused by the leg-height bug above,
   once to fix the rivetMacro shot clipping into a worker's body) but did not do a full
   pass tuning every phase × both aspects against VISUAL_ACCEPTANCE.md's checklist
   pixel-by-pixel. The shot table is a plain data structure
   (`CAMERA_COMPOSITIONS.{portrait,landscape}[cue]`) — safe for QA/integrator to hand-
   tune distance/elevation/azimuth/fov per cue without touching any logic.
4. **`core/index.ts`'s `dprCapForCanvas()`** treats "large canvas" (tablet) as
   `max(cssWidth,cssHeight) >= 900px` — PERFORMANCE_BUDGET.md doesn't give an exact
   breakpoint for phone vs. "tablet相当巨大canvas", so I picked one; easy to adjust.
5. **No shadow maps** (per budget) — blob shadows only (`visual/shadow.ts`), 1 draw
   call, positioned under crane/beam/4 workers/crates/start-lever.
6. **`window.__game.setPhase()`** (used by tests to jump phases directly) bypasses
   `advance()`, so it doesn't reset sub-state or emit `phase:enter` — the Renderer
   handles this fine (everything is a pure function of current `GameState`, no phase-
   transition-edge assumptions), but align/hoist/bolts/etc. sub-state can look
   "stale" relative to the jumped-to phase in ad-hoc manual testing (this is a
   pre-existing characteristic of `setPhase`, not something the Renderer needs to work
   around beyond already being purely state-driven).

## Testing

Unit tests (DOM/GPU-free, `src/**/__tests__/*.test.ts`, 65 total): leg-curve profile
math, beam-shape member/rivet generation, cable-curve sampling + rebuild-epsilon,
rivet color ramp, adaptive-quality step machine, anchor screen-projection (real
`THREE.PerspectiveCamera` math, no DOM), and the camera composition table/easing.

Manual verification beyond `npm test`: built the app (`vite build`), served it
(`vite preview`), and drove it with a throwaway headless-Chromium script (not
committed — used the repo's existing Playwright/swiftshader setup) that loads
`?test=1&seed=42`, waits for `title`, force-jumps through all 14 phases at 2
viewports, screenshots each, and asserts zero console/page errors +
`window.__game.stats()` within budget. That script is not part of this delivery
(FILE_OWNERSHIP reserves `tests/**` for Foundation/Integrator) — if useful, ask and
I can describe/reconstruct it, but nothing was added under `tests/`.

## Visual repair round (post-Wave-4 QA failure fixes)

Fixed the six director-flagged failures in `docs/VISUAL_ACCEPTANCE.md`'s
checklist, verified against `artifacts/qa/{phone-portrait,tablet-landscape}/*`
(regenerated via the real-gesture `tests/e2e/qa-screens.spec.ts`, not just
`setPhase` probes) plus ~15 throwaway Playwright screenshot rounds in
`/tmp` during iteration.

**Salvage**: a prior interrupted attempt at
`.claude/worktrees/wf_8429f10f-160-1/src/{core,scene,visual}` had 9 files
diverged from main (tower.ts lattice-pylon rewrite, backdrop/yard ground
plane, steam normal-blending cap, sky gradient texture wiring, worker
repositioning). Diffed it, judged the approach directly on-target for
D1/D2/D5, and copied it into main as the starting point rather than
reimplementing from scratch. It built and typechecked clean but had not been
visually validated — the copy surfaced one real bug (below) and the rivet
station camera needed a full re-tune the salvage hadn't done, both fixed
here.

### D1/D2 — tower + ground (mostly from the salvaged tower.ts/backdrop.ts/yard.ts)

- `tower.ts`: 4 legs rebuilt as tapered square-cross-section lattice pylons —
  real corner chords (16, one geometry with the leg webs and the operating
  leg's twin climb rails, still 1 draw call), a procedural X-lattice
  cross-hatch **texture** (`visual/textures.ts`'s `makeLatticeIronTexture`,
  `materials.legLattice`) for the panel read, and real horizontal ring-girder
  belts (InstancedMesh, `placeRingGirder`) only at completed level
  boundaries. The old leg-to-leg full-span thin diagonal tangle is gone —
  `placeFaceDiagonal` only ever spans two corners of the *same* leg within
  one panel row. `BASE_HEIGHT` raised from an effective ~2.4 to 11.5 world
  units so towerLevel 0 already reads as a real structure.
- `backdrop.ts` / `yard.ts`: added a real `ground` plane (Champ-de-Mars
  earth/grass texture, y=0, fades into the existing fog) and shrank the
  yard deck from 30×24 to 24×19 so it reads as a bounded work yard sitting
  *on* the ground instead of a world-spanning floor. River/buildings/bridges
  were already grounded in the pre-repair code (`RIVER_Z`/building `y=h/2`);
  the ground plane is what was missing underneath them.
- `core/index.ts`: wired the already-defined-but-unused `makeSkyTexture()`
  into `scene.background` (was a flat `Color` before) for a horizon-haze
  gradient consistent with the ground fog color.

**Bug found and fixed** (pre-existing, not part of the salvage diff):
`rivet.forgeGroup`'s position was never set after being added to the scene
graph in `scene/index.ts` — it sat at the group's default `(0,0,0)`, i.e. on
the ground at the world origin, instead of tracking `points.forge` up on the
working platform. One-line fix: `rivet.forgeGroup.position.copy(points.forge)`
each frame, right before `points.rivetHole` is refreshed.

### D3 — steam crane

Salvaged crane.ts tweaks kept: bulkier boiler/chimney proportions and a
second brass boiler band (was one) so the crane doesn't read as a sliver
against the now much taller/thicker legs. Twin climb rails (thin rods,
`RAIL_RADIUS`=0.045, `RAIL_INSET`=0.35 toward the axis to sit under the
carriage) were added to the operating leg's merged geometry in `tower.ts`.
Not further re-tuned beyond the salvage's version — lower priority than
D1/D2/D4 given the effort budget; flagging as the thinnest of the six if
another pass happens.

### D4 — rivet station camera + team layout (the hardest fix this round)

The salvage's worker repositioning (semicircle around the plate,
`hammerSpot` unified with `beam.rivetHolePosition` instead of a separate
~1-unit-off approximation) was sound, but raising the tower's `BASE_HEIGHT`
moved the whole rivet station onto a narrower, more-converged part of the
leg curve, and the existing `rivetMacro` camera numbers (untouched by the
salvage) hadn't been re-tuned for that — first rebuild produced a rivet-macro
shot dominated edge-to-edge by a tower leg at point-blank range.

Root-caused numerically rather than by eyeballing: added a temporary
`window.__debugCam` hook to `render/camera.ts` (removed before finishing),
pulled the real op/target/camera world points, and wrote a throwaway node
script (`/tmp`, not committed) that ports `legRadiusAt`/`legOffsetAt` and
computes, for a grid of `{distance, elevation, azimuth, blend}`, the
worst-case angular offset between the camera's view axis and *all four* tower
legs (sampled across their full height). This showed the rivet station's own
anchor points sit close enough to the operating leg's centerline (by design —
that's literally where the new beam rivets onto the existing structure) that
no camera angle alone gets more than ~15-22° of separation from *some* leg at
macro-shot distances.

Fixed with two changes together:
1. **Scene**: widened the platform (`4.2×2.1` → `5.8×3.2`) and scaled the
   forge/heater/catcher/holder local offsets ~1.5x outward (striker kept
   closer, ~1.3x, since the hammer still has to reach `hammerSpot`) so the
   team has real separation from the leg/crane cluster instead of being
   crammed within ~1.5 world units of it.
2. **Camera**: re-solved `rivetMacro` for both aspects (`cameraCompose.ts`)
   against the widened layout — portrait
   `{distance:5.6, elevation:1.2, azimuth:0.25, blend:0.62, fov:54}`, landscape
   `{distance:5.2, elevation:1.1, azimuth:0.25, blend:0.62, fov:50}` — a
   higher, more overhead angle that reads as "looking down onto the work
   platform" rather than "into the leg". `align`'s distance was bumped
   3.6%/(unchanged landscape) only as far as needed to keep the
   `cameraCompose.test.ts` "rivetMacro is the closest shot" invariant
   (portrait `align` 5.2→5.7; landscape untouched, 6.0 already ≥ 5.2).

Verified against the real-gesture `qa-screens.spec.ts` capture (not just
`setPhase`): `rivet-macro.png` now clearly shows the glowing forge, workers
facing the camera (not backs), and the tongs/hammer anchors, in both
viewports. Not a pixel-perfect "forge left / hole dead-center" composition
in every rivet sub-phase (rivetCarry/rivetInsert/rivetHammer share one
static-ish camera cue per `PHASE_CUE_MAP` — re-aiming per relay station
would be a further improvement, not attempted this round), but the specific
failure mode (worker backs, invisible forge, hole on a worker's back) is
gone.

### D5 — steam/flash tame-down (from the salvaged steam.ts)

`AdditiveBlending` (white stacks toward pure white as puffs overlap — the
literal cause of the completion.png whiteout) replaced with `NormalBlending`
at a capped `opacity: 0.5`, puff size range cut roughly in half
(`0.5-1.2` → `0.22-0.48`), and a proper rise-then-shrink scale curve instead
of grow-only. Also reduced climb valve burst frequency/count in
`scene/index.ts` (was up to ~2 puffs/30ms ≈ 60+/s at full throttle; now 1
puff per 130-260ms). Verified: no white-out in any climb/reveal screenshot,
including a 40-frame sustained-climb probe.

### D6 — reveal growth

Not touched directly (tower rebuild was already correct — `heightForLevel`
is a pure function of `towerLevel`), but re-verified after all the above
changes with a dedicated before/after check: dispatched the real transition
chain (`title→opening→…→climb→reveal`, using `dispatch()`/`advance()` so
`PHASE_RESET.reveal`'s `towerLevel + 1` actually fires, not `setPhase`) and
screenshotted `towerLevel=0` vs the post-`reveal` `towerLevel=1` state side
by side — an extra completed ring-girder band and taller legs are clearly
visible.

### Validation actually run

- `npx tsc --noEmit` — 0 errors.
- `npx eslint src/core src/render src/scene src/visual` — 0 errors.
- `npx vitest run` — 212/212 passed (30 files), including the untouched
  `cameraCompose.test.ts` invariants (rivetMacro still the closest shot,
  align/wide-shot distance orderings preserved) and `curve.test.ts`/
  `beamShapes.test.ts` (leg profile / beam geometry math, unaffected by the
  visual-only tower/camera constant changes).
- `npx playwright test full-loop resilience --project=phone-portrait
  --project=tablet-landscape` — 14/14 passed (anchors stayed reachable
  through real pointer gestures across the whole loop + all 5 resilience
  scenarios, so the enlarged platform / re-tuned camera didn't push any
  interactive anchor off-screen or unreachable).
- `npx playwright test qa-screens --project=phone-portrait
  --project=tablet-landscape` — 2/2 passed; regenerated the actual
  `artifacts/qa/**/*.png` deliverables via real gameplay gestures (not
  `setPhase`) as the authoritative before/after evidence.
- `window.__game.stats()` swept across all 18 phases × both viewports:
  worst observed 78 draw calls (budget ≤90 normal / ≤110 climb) and ~16.9k
  triangles (budget ≤250k) — large headroom, no regression from the added
  corner-chord/rail/ring-girder geometry (still merged into the tower's
  single draw call) or the enlarged platform.
- Preview server (`vite preview --port 4399`) killed after iteration.

### Known remaining gaps (flagging, not blocking)

1. D3 (steam crane read) got the smallest re-tune this round — wheels/twin
   rails exist geometrically but aren't a strong visual read at typical
   camera distances; a dedicated close-in "runner on rails" establishing
   beat during `climb` would sell it better.
2. `rivetMacro`'s single static-ish camera cue across all 5 rivet sub-phases
   means the actual point of action (forge → tongs → hole) isn't always
   dead-center for every sub-phase, only reliably on-screen (verified via
   `window.__game.anchors()` staying within viewport bounds with margin,
   plus the full-loop E2E passing real taps against them).
3. Did not re-tune `hoist`/`bolts`/`sling` camera cues — they weren't called
   out as failing and weren't touched beyond whatever incidental effect the
   taller `BASE_HEIGHT` has (they use the same `topOfLeg`-derived focus
   points as before, just at a higher absolute height); worth a director
   pass if time allows.
