# へんしん！いちにち保育室 (Henshin! Ichinichi Hoikushitsu)

A finished, small-scope mobile web game for 4-year-olds, playable on iPhone/iPad
Safari (Chromium supported for dev/QA). One nursery-room diorama transforms
under the player's finger through a full day: **playroom → lunch room → nap
room → playroom.** No reading required — every objective is communicated
through icons, motion, light and sound.

Built with Vite + TypeScript (strict) + Three.js. No React, no backend, no
analytics, no external/copyrighted assets — all art is procedural geometry and
canvas-generated textures, all audio is synthesized at runtime with the Web
Audio API.

## How to play

1. Open the game and tap the big glowing sun/play button.
2. **Playroom cleanup** — drag each toy on the floor to the basket whose
   picture symbol matches it (star / rainbow / flower). A sloppy drop near the
   right basket still counts; a drop near the wrong basket floats gently back.
3. **Lunch room** — drag the table out from the wall, tap the chair stack
   (chairs hop out one by one), then drag the tray cart handle to bring trays
   to the table. Watch the children eat (or tap to skip ahead).
4. **Lunch cleanup** — drag each tray back onto the cart, wipe the whole table
   with one big trace of your finger, then tap the table to send it back.
5. **Nap room** — drag each rolled mat to its floor marker, then swipe to
   unroll it (progress follows your finger exactly). Drag the curtain closed
   and watch the ceiling stars glow in the dark.
6. **Wake up** — drag the curtain open, then swipe each mat to roll it back
   up. The toy shelf pops toys back onto the floor — the room is bright again.
7. **Replay** — tap a big picture card: 🔁 play the same day again, 🎲 shuffle
   for a new layout, or 🏠 free play (morph the room between all three setups
   with no required order).

Controls are Pointer Events only: **tap, drag, long-swipe, trace**. One finger,
any input device. If you sit idle for 3 seconds the current target wiggles
with a soft chime; after 7 seconds a looping ghost-finger trail shows the
gesture to make.

The top-right corner always has a mute toggle and a reduced-motion toggle
(both persist). A small sun-arc in the top-left is a purely decorative day
clock.

## Running it

```bash
npm install
npm run dev        # Vite dev server
npm run build       # tsc --noEmit && vite build -> dist/
npm run preview     # serve the production build
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
npm run test        # vitest run (unit tests for src/game/)
npm run test:e2e    # playwright test (builds + serves dist/, drives real gestures)
```

### URL parameters

- `?seed=1` / `?seed=2` / `?seed=3` — the three curated seeds (toy layout,
  basket↔symbol assignment, mat colors, morning light angle, window weather,
  shelf decoration all vary). Any positive integer works; the replay "shuffle"
  card picks a new one automatically. The last seed played is remembered in
  `localStorage` and reused on the next visit.
- `?test=1` — installs `window.__game`, a deterministic test-automation
  harness (phase/progress introspection, seed control, screen-space
  projections for real-gesture Playwright tests, draw-call stats). Completely
  inert without this flag; never installed in a normal play session.

## Project structure

```
src/
  game/      pure logic — zero three.js imports. FSM, seeded RNG (mulberry32),
             seed→layout generator, per-phase objective reducers, capture-
             radius "generous drop" math, localStorage persistence helpers.
             Unit-tested in tests/.
  scene/     three.js — room/toy/basket/furniture/mat/curtain/NPC/star
             builders, procedural canvas textures (wood grain, fabric weave,
             blob shadows, star/basket-symbol atlas), camera director
             (per-shot × per-orientation presets), lighting rig (per-phase
             color grading), adaptive-DPR quality manager, tween manager.
             SceneRoot.ts is the orchestrator: it owns the renderer, resolves
             raw pointer input into per-phase interactions, and drives every
             FSM transition and signature-moment animation.
  input/     PointerController — a generic single-active-pointer primitive
             (no game knowledge); SceneRoot interprets gestures.
  audio/     AudioEngine — every sound effect and ambience synthesized with
             Web Audio oscillators/noise buffers/filters, lazily created and
             resumed on first pointerdown (iOS requirement).
  ui/        HTML/CSS icon-only overlay (title button, mute/reduced-motion
             toggles, day dial, replay cards, free-play controls) + inline
             SVG icon set. No text required to understand or play.
  harness/   window.__game test-automation surface, gated on ?test=1.
tests/       Vitest unit tests for src/game/ (39 tests).
e2e/         Playwright end-to-end tests, run against the production build.
docs/        Frozen product/interaction/art specs, decisions log, and the
             verification evidence log (docs/VERIFICATION.md).
artifacts/screenshots/  Screenshots captured by the e2e suite.
```

## Architecture notes

- **State lives outside the renderer.** `src/game/fsm.ts` is a plain
  TypeScript state machine with an explicit legal-transition table
  (`TITLE → PLAY_CLEANUP → LUNCH_SETUP → LUNCH_CLEANUP → NAP_SETUP →
  WAKE_RESTORE → REPLAY (→ PLAY_CLEANUP | FREE_PLAY)`). The scene layer only
  ever *reads* this state and *reacts* to its events — rotating the device or
  resizing the window rebuilds the camera/layout without touching game state.
- **Seeded determinism.** All randomness (toy scatter, toy↔basket symbol
  assignment, mat colorways, morning light angle, weather, shelf theme) flows
  through a mulberry32 PRNG seeded from `?seed=`. The same seed always
  produces the same `SeedConfig` snapshot (verified in `tests/seeds.test.ts`
  and `e2e/persistence-seed.spec.ts`).
- **Generous intent inference.** Baskets and mat markers accept a drop within
  `2.2×` their visual radius; the nearest basket softly glows/leans toward a
  dragged toy while its symbol matches. Wrong-basket or dead-space drops never
  penalize — the toy/mat just settles or floats back.
- **Draw-call budget.** Chairs, trays, mat rolls/flats/bedding, and every
  contact "shadow" in the room are `InstancedMesh`/shared geometry so the
  scene stays a small, fixed number of draw calls regardless of NPC/toy count.
  Measured peak in this environment: **95** (see `docs/VERIFICATION.md`),
  against a ≤130 hard cap.
- **No physics engine.** Toy capture is a scripted arc + squash-bounce tween;
  mat unroll is a roll-cylinder + flat-plane pair whose scale/position is
  driven directly by swipe distance (scrubbable both directions); furniture
  slides along fixed rails. All per-object animation goes through one shared
  `TweenManager` — no per-frame allocations in the hot path.

## Known environment limitation (headless/software rendering)

This container has no GPU; Chromium falls back to a software rasterizer
(SwiftShader). Every synthesized pointer round-trip in that mode costs real
wall-clock time it would not cost on an actual phone/tablet with hardware
WebGL. `e2e/full-loop.spec.ts` accounts for this: it performs every gesture
*type* (drag/tap/swipe/trace) for real at least once per phase, then finishes
the repetitive remainder of that phase (the other 6 toys, the other 3 mats,
…) through `window.__game.forceCompleteCurrentPhaseVisuals()` — a harness
method that runs the exact same FSM + visual-update code path a real gesture
uses, just without the CDP round-trip cost. See `docs/VERIFICATION.md` for
what was actually run and measured.

## License / third-party

See `THIRD_PARTY_NOTICES.md` for the exact dependency versions and licenses.
No external or copyrighted game assets are used anywhere — all geometry,
textures, and audio are generated in code at runtime.
