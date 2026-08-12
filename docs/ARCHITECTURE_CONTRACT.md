# ARCHITECTURE_CONTRACT

Stack: Vite + TypeScript (strict) + Three.js + Vitest + Playwright + ESLint.
No physics engine. No runtime network access. All geometry procedural; all
textures generated (canvas) ≤2048px; all audio synthesized via WebAudio.

## Module layout & ownership (see FILE_OWNERSHIP.md)

```
index.html            — integrator (foundation creates)
src/main.ts           — integrator (foundation creates)
src/app/**            — integrator: App shell, wiring, boot sequence
src/contracts/**      — FROZEN after Wave 2: all shared types/interfaces/events
src/core/**           — renderer owner: engine loop, quality mgr, resize, ctx recovery
src/render/**         — renderer owner: renderer setup, materials, lighting
src/scene/**          — renderer owner: tower, machine room, carrier, cabin meshes
src/visual/**         — renderer owner: camera director, cutaway, effects
src/game/**           — gameplay owner: state machine impl, track math, sim, assists
src/input/**          — gameplay owner: pointer handling, gesture→intent mapping
src/ui/**             — UX owner: DOM/scene-integrated controls, pictograms, menus
src/audio/**          — UX owner: WebAudio synth engine, sound cues
src/styles/**         — UX owner: CSS, safe-area, portrait/landscape layouts
tests/unit/**         — owner of the code under test
tests/e2e/**          — integrator (foundation scaffolds smoke)
```

## Dependency rule
`ui/audio/input/game/render/scene/visual/core` may import from `src/contracts`
and their own subtree ONLY. Single sanctioned exception: `src/game/track.ts`
(pure analytic track curve, frozen API, authored in Wave 1.5) may additionally
be imported by `src/render|scene|visual|core` so renderer and simulation share
one geometry source. Cross-subsystem communication goes through:
1. **GameStore** (in contracts: shape; in game: impl) — single source of truth,
   plain-data snapshot, observable via `subscribe`.
2. **EventBus** (typed, in contracts) — fire-and-forget cues (`sound:*`, `camera:*`,
   `fx:*`). No subsystem calls another subsystem's classes directly.
The integrator (`src/app`) is the ONLY place that constructs and wires subsystems.

## Simulation model
- Fixed-step simulation: `SIM_DT = 1/60`s, accumulator pattern. Rendering
  interpolates. All gameplay math advances only in `step(dt)`.
- Deterministic mode: `?det=1&seed=N` — fixed seed (mulberry32), and
  `window.__eiffel.step(n)` advances n fixed steps with RAF-driven stepping off.
- All world motion derives from ONE scalar pipeline per MATH_CONTRACT:
  valveOpen → pistonSpeed → pistonDisplacement → cableTravel → (pulleyAngle, trackArcLength).
  Nothing animates the carrier/cabin/pulleys outside this pipeline.

## State machine
Implemented in `src/game/stateMachine.ts` from `contracts/states.ts` ids
(see PRODUCT_SPEC table). Transitions are events; re-entrant triggers are
ignored while a transition tween is active (no double-fire). Every state is
enterable directly via test API for e2e (`__eiffel.gotoState(id)`).

## Test/inspection API (frozen shape, `src/contracts/testing.ts`)
`window.__eiffel: EiffelTestAPI` — see contracts. Exposes: `state`,
`sceneReady` (promise+flag), `settled()` (promise resolving when animations idle),
readouts `{tDeg? no—}`:
`readouts(): { t, trackTangentDeg, carrierAngleDeg, cabinWorldTiltDeg,
cabinFloorNormal:[x,y,z], pistonDisplacement, cableTravel, pulleyAngle,
valveOpen, speed, state, drawCalls, quality }`,
`gotoState(id)`, `setT(t)`, `step(n)`, `seed`, `version`.
DOM controls carry `data-testid`: `master-lever`, `throttle-up`, `throttle-down`,
`level-wheel`, `sound-toggle`, `pause-button`, `replay-*` tiles, `stage-root`.
E2e waits on conditions (readouts/flags), never on timeouts.

## Rendering contracts
- One WebGLRenderer, DPR capped at 2 (1.5 in low tier). `setAnimationLoop`.
- Page hidden → rendering stops (sim pauses); visible → resumes.
- `webglcontextlost`/`restored` handled: scene rebuilds, GameStore untouched.
- Quality tiers `high|medium|low`, auto-degrading on sustained frame misses;
  affects DPR, shadows, particle counts, girder instance detail — never gameplay.
- Dispose discipline: every subsystem exposes `dispose()`; replay loops must not
  grow GPU memory (leak test: 20 ascent/descent cycles).

## Error policy
- No console.error/warn in normal operation (e2e asserts).
- WebGL2 unavailable → friendly static fallback card (drawn, no text dependency)
  with a picture of the elevator; no crash.
- Audio context blocked until first user gesture → unlock on first pointerdown.

## Freeze rules
After Wave 2: `package.json`, lockfile, all configs, `src/contracts/**` are
frozen. Wave 3 owners must not edit them, nor `src/app/**`, `src/main.ts`,
`index.html`, nor another owner's subtree. No repo-wide formatter runs.
Integrator (Wave 4) may make minimal wiring fixes anywhere except contracts.
