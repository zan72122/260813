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
