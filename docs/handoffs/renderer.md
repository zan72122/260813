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

## Wave 6 audit fixes

Ten findings from three independent reviewers (R1-R10 in the task brief),
covering silhouette/backdrop/framing/perf issues screenshot-verified against
`docs/VISUAL_ACCEPTANCE.md` and `docs/PERFORMANCE_BUDGET.md`.

**Salvage**: a prior interrupted attempt at
`.claude/worktrees/wf_d81d3a58-f0b-1/src/{core,render,scene}` had 14 files
diverged from main (`core/index.ts`; `render/{anchorProject,camera,
cameraCompose}.ts`; `scene/{backdrop,beam,crane,curve,index,rivet,tower,
workers}.ts`; `visual/{materials,steam}.ts`). Diffed every file against main
before touching anything: each hunk mapped cleanly onto one of R1-R10 (curved
leg exponent for R1, mansard roofs + Trocadero dome for R2, towerAxis-anchored
hoist camera for R3, craneBase climb framing for R4, tongs geometry for R5,
boiler/chimney material split for R6, light intensity + hole rim for R7,
PointLight removal for R8, anchor/beam/wheel-spin allocation cleanup for R9,
`camera.updateMatrixWorld(true)` for R10), typechecked/linted/tested clean,
and was directly on-target — copied wholesale as the starting point rather
than reimplementing. Nothing was discarded; everything from the salvage
survived into the final diff (though several numeric constants were
re-tuned further, see below).

### R1 — Eiffel Tower silhouette

`scene/curve.ts`: `legRadiusAt`'s taper exponent 1.55→2.35 (concentrates the
inward curve near the base, where a static establish shot actually shows it,
instead of only becoming visible near the unreachable apex) plus
`BASE_RADIUS`/`APEX_RADIUS` widened slightly. `scene/tower.ts`:
`LEG_PROTRUSION` 2.0→3.4 plus a sparse "next tier being built" pass (2 of 4
face diagonals per leg + one partial ring-girder fragment) in the bare
protrusion above the last completed level, so the unfinished top reads as
mid-assembly rather than bare rods. `render/cameraCompose.ts`: `establish`/
`reveal`/`complete` pulled back further (distance 21→34 portrait, 24→38
landscape) with a raised `lookAtHeightOffset` so the pulled-back frame has
headroom for the taller protrusion + sky instead of just the platform.

### R2 — Paris backdrop

`scene/backdrop.ts`: each Haussmann building instance gained a second
InstancedMesh — a 6-triangle two-slope prism roof (`makeGableRoofGeometry`)
in a new dark-zinc material (`visual/materials.ts`'s `roofZinc`, `#3d4148`,
metalness 0.3) stacked on the cream wall body. The Trocadero silhouette
gained a rotunda drum + a real hemispherical dome (`domeGold` material) —
the signature Moorish-Byzantine landmark read, not just twin flat towers.
Both stay instanced; triangle cost is 48 walls × 12 tri + 48 roofs × 6 tri,
negligible against the 250k budget (worst observed ~20.9k total, see below).

### R3 — Hoist framing + transition occlusion (the hard one — see below)

`render/camera.ts`'s `focusFor`: `approach`/`hoist` cues now orbit
`points.towerAxis` (the tower's own central axis — always at azimuth radius
0, i.e. as far from every leg's curve as this scene gets) instead of
`points.hook`/`points.beam` (which sit almost exactly on the operating leg's
own radius, since the crane rides that leg — the literal cause of "a leg
fills the whole frame"). `cameraCompose.ts`: `approach`/`hoist` widened
(portrait distance 8→21/fov 52→74, landscape 9→26/fov 46→68) so the full
hookDown→hoist vertical arc (hook near the yard up to the platform) stays in
frame from a single static shot, verified via `window.__game.anchors()`
across the whole arc at both extremes. Because `approach` and `hoist` are
now identical shots, the hookDown→hoist phase transition is a literal no-op
for the camera — nothing to occlude, verified with a sequential-screenshot
sweep across that transition (never more than the identical framing before
and after).

Widening `hoist` this much broke `align` — see "The align regression" below
for the full story; the short version is `cameraCompose.ts`'s `align` shot
also needed widening (portrait distance 5.7→16/fov 50→78, landscape
6→21/fov 44→76) so the beam anchor can't itself land off-canvas once it can
drift farther from the ghost slot before align begins, and `render/
camera.ts` gained a small hard-cut-on-entering-`align` (skip the eased
transition for just that one cue change) as a secondary hardening.

### R4 — Climb read

`camera.ts`'s `focusFor('climb')`: `op`/`target` both now `points.craneBase`
(the carriage/wheels) instead of splitting between the wheels and the
sheave — the old split shot's own focus point sat between them, which read
as "looking up at the boiler from underneath" and cropped the wheels/rails
entirely. `cameraCompose.ts`'s `climb` shot: elevation raised off near-zero
(0.06→0.2 portrait) so the wheels-on-rails read isn't dead-level foreshortened.
`scene/crane.ts`: wheels enlarged (0.18→0.26 radius) and switched to brass
(was the carriage's own dark iron, disappearing into its silhouette).
`visual/steam.ts`: climb puff size 0.22-0.48→0.28-0.58, opacity cap
0.5→0.55 (still `NormalBlending`, so still can't wash to white regardless of
overlap count — this is the ceiling PERFORMANCE_BUDGET and R4 both allow).
`scene/index.ts`: climb valve bursts 1→2 puffs/chuff, emitted from the
crane's actual `chimneyWorld` anchor (was a crude fixed y-offset off the
crane group's own position, which visibly missed the chimney tip once any
lean was involved) instead of near the base. Tower `+1` level read is
already handled by the pre-existing `heightForLevel`/ring-girder logic
(untouched); re-verified with a `towerLevel=0` vs. post-`reveal` `towerLevel=
1` screenshot pair under near-identical `establish`/`reveal` camera framing.

### R5 — Rivet team tools

`scene/workers.ts`: catcher's and heater's tools rebuilt from a single
bare rod into `buildTongsGeometry` — two prongs sharing a shoulder pivot,
spread apart toward the tip, reading as an open pincer. The striker's
sledgehammer geometry already existed pre-Wave-6; what didn't exist was a
readable *strike beat* — `scene/index.ts` now subscribes to the real
`rivet:hit` bus event (already emitted by `game/phases/rivet.ts`, frozen
contract) and drives the striker's arm through a swing→impact→recover pose
(`hammerPose`/`hammerReach`) timed off `simTimeMs - lastHitSimTimeMs`,
replacing a purely continuous idle-sway animation that had no relationship
to actual hits landing.

### R6 — Opening crane read

`scene/crane.ts`: boiler switched to the lighter/warmer `iron` material
(was sharing `ironDark` with the chimney, the literal cause of "stacked dark
mass"); a brass collar (`chimneyCollar`) now marks a visible seam between
boiler and chimney instead of a silent overlap; the cable drum gained brass
end-caps so it reads as a distinct wound-cable spool rather than another
dark cylinder blending into the boiler beside it. Idle steam wisp (R4's fix
above) now also fixes R6's "chimney" requirement by emitting from the real
`chimneyWorld` anchor at title/opening, not just during climb.

### R7 — Align/bolts brightness

`core/index.ts`: `HemisphereLight` intensity 0.85→1.05 (ground-bounce color
warmed `#5a4636`→`#6f5a46` too) and `DirectionalLight` 1.35→1.55 — still
exactly the 2 lights the budget allows, only their intensity changed.
`scene/beam.ts`: each bolt hole gained a thin brass rim ring
(`holeRimMesh`) just outside the existing dark hole ring, so both bolts and
holes have a real material-contrast edge against the leg's own dark iron
rather than relying on ambient light alone.

### R8 — Forge PointLight (budget violation)

`scene/rivet.ts`: the forge's `PointLight(0xff5a1a, 1.2, 2.5, 2)` — the
scene's only 3rd live light — removed outright. Replaced with the coals'
own emissive material (self-lit regardless of scene lights, `MeshStandard
Material.emissive` unaffected either way) plus a small additive-blended
billboard glow sprite (`visual/textures.ts`'s existing `softCircle` texture,
camera-facing via a per-frame quaternion computed from world-space camera
direction) standing in for the bloom/spill a real forge would cast, at zero
lights. Verified: `grep -rn "new .*Light" src/scene` returns nothing;
`core/index.ts` is the only place any `Light` is ever constructed, and it
constructs exactly 2 (hemisphere + directional).

### R9 — Per-frame GC allocations

- `render/anchorProject.ts`: `projectToScreenInto`/`projectedRadius` now
  write into caller-provided scratch objects; `projectToScreen` kept as a
  thin allocating wrapper for tests/one-off callers.
- `core/index.ts`'s `publishAnchors()`: one persistent `Anchor` object per
  `AnchorId` (lazily created, reused every frame after) instead of a fresh
  object literal every anchor every frame — `AnchorRegistry.set()` stores
  by reference (frozen contract), so this is safe as long as each id gets
  its own scratch (a single shared scratch would alias every anchor to the
  same final values, which this avoids).
- `scene/beam.ts`: `boltCurrentPosition()` used to `.clone().lerp()` a
  fresh `Vector3` on every call (including from the per-frame anchor
  publish path); now precomputed once per frame into a persistent
  `boltCurrentWorld` pair inside `refreshBoltsAndHoles()` and returned by
  reference. `placeSlot()`'s `slotWorld = slotPos.clone()` similarly
  replaced with `slotWorld.copy(slotPos)`.
- `scene/crane.ts`: `setWheelSpin()`'s `.forEach(([x,z], i) => {...})` —
  which reallocates the callback closure every call, and this runs every
  frame — replaced with a manual indexed loop. `setCarriage()`'s
  `new Vector3()`/`new Quaternion()` per call replaced with module-level
  scratch objects (`inwardScratch`, `posScratch`, `leanQuat`, `zAxis`).
- `scene/curve.ts`: `legOffsetAt`/`legTangentAt` returned a fresh object
  literal every call; added non-allocating `legOffsetInto`/`legTangentInto`
  variants (write into a caller-provided `out`) and switched the two true
  per-frame hot-path callers — `crane.ts`'s `setCarriage` (every frame) and
  `tower.ts`'s `topOfLeg` (every frame, called once from `scene/index.ts`'s
  hook/beam/slot positioning block) — to the new variants. The original
  allocating versions are kept for cold-path callers (geometry rebuilds,
  which only run on `towerLevel` change, not every frame) and tests.

No remaining steady-state per-frame allocations were found in the render
hot path (`core/index.ts`'s `frame()` → `sceneRig.update()` →
`cameraDirector.update()` → `publishAnchors()` → `renderer.render()`) by
manual audit; the leak/replay E2E scenario (`resilience.spec.ts`'s
scenario (a), 20+ effective replay cycles via orientation-change-mid-replay)
passed with no scene.children/listener/timer growth.

### R10 — Anchor projection ordering after camera update

`core/index.ts` already called `cameraDirector.update()` → `publishAnchors()`
→ `renderer.render()` in that order (the ordering itself predates Wave 6).
The actual bug: `camera.position`/`camera.lookAt()` mutate the camera's
*local* transform, but THREE.js normally defers recomputing
`matrixWorld`/`matrixWorldInverse` (what `Vector3.project()` actually reads)
until the next `renderer.render()` scene-graph traversal — so
`publishAnchors()`, running *before* that render call, was reading a
one-frame-stale camera transform every time the camera cut (phase change or
a `cam:cue` override). Fixed with one line: `camera.updateMatrixWorld(true)`
immediately after `camera.lookAt()`/`updateProjectionMatrix()` in `render/
camera.ts`'s `update()`, forcing the recompute synchronously before
`publishAnchors()` ever runs.

### The align regression (R3's real cost, and how it was actually fixed)

Widening the `hoist` camera for R3 (above) broke `full-loop`'s real-gesture
E2E for `tablet-landscape` outright: `driveAlignToSnap` timed out with
"align: never snapped" on every run. This took the bulk of this round's
iteration budget to root-cause correctly, because several plausible-looking
fixes (all implemented, all kept as real hardening, none alone sufficient)
turned out not to be the actual cause:

- Camera "settling" lag after the hoist→align cue change — measured for
  real: under this environment's swiftshader-backed rendering, the camera's
  exponential ease's *simulated*-time "finish" (~300ms under `?test=1`)
  could take **several real seconds** to visibly catch up, because
  `?test=1` advances simulated time by a fixed 16.67ms per rendered frame
  regardless of real elapsed time, and real frame delivery was only ~4-11fps
  under contention. Mitigated with a hard cut-to-target the instant the cue
  becomes `align` (`render/camera.ts`), plus a synchronous
  `bus.on('phase:enter', ...)` re-publish in `core/index.ts` (re-runs
  `sceneRig.update`/`cameraDirector.update`/`publishAnchors` with `dtMs=0`
  the instant a phase changes, before any subsequent input event can read
  stale anchors) — both real improvements, kept, **neither fixed the
  failure alone or together**.
- A progressive camera ease from the wide hoist shot toward align's framing
  over the last 30% of the hoist drag (`hoistDesiredTransform` in
  `camera.ts`) — sound in principle, but `game/phases/hoist.ts` advances
  `hoist.height` per drag *intent*, and a single Playwright gesture's
  sub-moves can cross the completion threshold mid-gesture with zero
  rendered frames in between, so there was no real time for the progressive
  ease to do anything. Kept (harmless, and a real production drag is far
  more granular than a scripted `steps:8` gesture), **did not fix it**.

The actual root cause, found by directly inspecting `window.__game.
anchors()` at the moment align begins: with the widened hoist shot, the
beam can end up meaningfully farther from the ghost slot in world space by
the time hoisting finishes. `align`'s own camera cue is a fixed, tight
orbit (untouched by any of the above) — at the old distance/fov, the beam
anchor could itself project **off the canvas** (`beam.y` observed beyond
the viewport height). A drag gesture that starts at an anchor position
outside the viewport never registers, so `driveAlignToSnap`'s very first
attempt was a no-op, and the whole 25-attempt budget exhausted without a
single real drag reaching the game. The fix was simply widening `align`'s
own distance/fov (portrait 5.7/50°→16/78°, landscape 6/44°→21/76°) enough
that both beam and ghost stay on-screen through the whole drag regardless
of where hoisting drops the beam — confirmed by rerunning
`window.__game.anchors()` mid-drag (beam consistently in-bounds) and then
the real `full-loop`/`resilience` E2E suite for both projects passing
reliably (14/14, twice in a row, including under the 2-worker concurrent
load the final validation command actually runs with — the specific
tuning was pushed a further margin past the first passing values once a
14/14 run under full 2-worker contention still showed one flaky failure on
the very first pass, to build in headroom against exactly that kind of
resource contention).

### Validation actually run

- `npx tsc --noEmit` — 0 errors.
- `npx eslint src/core src/render src/scene src/visual` — 0 errors.
- `npx vitest run` — 236/236 passed (31 files), including the
  `cameraCompose.test.ts`/`curve.test.ts`/`anchorProject.test.ts` invariants
  (rivetMacro still the closest shot, leg-curve monotonicity/concavity,
  screen-projection math) unaffected by the constant re-tunes since those
  tests assert relationships (`rivetMacro <= all other distances`,
  `legRadiusAt` monotonic/concave), not specific numbers, or exercise the
  new non-allocating `legOffsetInto`/`legTangentInto` transparently through
  the existing `legOffsetAt`/`legTangentAt` wrappers.
- `npx playwright test full-loop resilience --project=phone-portrait
  --project=tablet-landscape` — **14/14 passed** (4.6m), including under
  the default 2-worker concurrent load (both projects' full-loop +
  5-scenario resilience suites running simultaneously) — this is the
  specific condition that exposed the align regression above, so it's the
  one that matters.
- `window.__game.stats()` swept across 9 phases × both viewports: worst
  observed 86 draw calls (budget ≤90 normal / ≤110 climb — climb-mid itself
  measured 69-76) and ~20.9k triangles (budget ≤250k), large headroom.
  Lights confirmed at exactly 2 (hemisphere + directional) by direct source
  inspection: `grep -rn "new .*Light" src/scene` returns nothing (R8's
  PointLight is gone), `core/index.ts` is the only constructor site.
- Bundle: `vite build` → 580 KB / **153 KB gzip** (target < 900 KB gzip),
  `three` still the only runtime dependency.
- Preview servers (`vite preview`, ports 4399/4400 across iteration)
  killed after finishing; verified with `ps aux` — no stray processes.

### Known remaining gaps (flagging, not blocking)

1. `align`'s camera is now noticeably wider than before (portrait fov
   50°→78°) to guarantee beam+ghost never go off-canvas regardless of where
   hoisting drops the beam — this trades a little of the "close-up
   precision" framing VISUAL_ACCEPTANCE asks for in exchange for reliably
   *working*; screenshots still read the hole/bolt/forge clearly (R7's
   brightness bump helps here too), but a director pass with more precise
   per-drag-distance framing (rather than a fixed worst-case-sized shot)
   would read better if time allows.
2. D3 (steam crane read)/`rivetMacro` single-cue-per-sub-phase gaps noted in
   the prior "Visual repair round" section above are unchanged this round —
   not touched, not called out as regressed.
3. The align-entry hardening (hard-cut-on-cue-change, synchronous
   `phase:enter` re-publish) is real and worth keeping, but per the
   investigation above neither was the actual fix for the reported
   failure — flagging so a future iteration doesn't assume removing the
   width margin on `align`'s shot is safe just because those two
   mechanisms are still in place.
