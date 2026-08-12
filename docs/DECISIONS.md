# DECISIONS — architecture & product decisions (do not relitigate)

| # | Decision | Why |
|---|----------|-----|
| 1 | Vite + TypeScript strict + Three.js, no React | Small scope; overlay UI is a handful of icon buttons; framework adds weight without benefit |
| 2 | Explicit FSM (`src/game/fsm.ts`) with phases TITLE → PLAY_CLEANUP → LUNCH_SETUP → LUNCH_CLEANUP → NAP_SETUP → WAKE_RESTORE → REPLAY (+ FREE_PLAY) | Deterministic progression, testable without renderer |
| 3 | Game state separate from view: `src/game/` has zero Three.js imports; `src/scene/` renders from state + events | Unit-testable logic; orientation change can rebuild view safely |
| 4 | Seeded RNG (mulberry32) everywhere; `?seed=N` URL param; 3 curated seeds | Reproducible tests and variation |
| 5 | Test harness `window.__game` (advance phase, query state, set seed) active only with `?test=1` query flag; inert in normal play | Playwright can drive the full loop reliably |
| 6 | All audio synthesized with Web Audio API at runtime | Zero copyright risk, tiny bundle, per-material variation easy |
| 7 | No physics engine; magnet-snap + scripted tweens; mat unroll = scaled roll cylinder + plane, driven by swipe progress | Mobile perf, art control |
| 8 | WebGL2 baseline via Three WebGLRenderer; no WebGPU work (quality budget not needed) | Ship one well-tested path |
| 9 | DPR capped at 2 (1.5 on low-perf detect); adaptive: drop DPR before dropping effects | Predictable perf on iPhone |
| 10 | Single shared NPC rig built from primitives, per-child material variation; chairs/toys share geometry | Draw calls ≤120 |
| 11 | Blob contact shadows + one optional 1024 shadow map for static furniture | Cheap soft look |
| 12 | Playwright: Chromium (installed). WebKit binary not preinstalled in this env — attempt install; if unavailable, record in VERIFICATION and rely on Chromium + iOS viewports | Environment constraint |
| 13 | Overlay UI in HTML/CSS (icons only); 3D picking via raycast with padded proxy spheres | 72px targets, accessibility |
| 14 | Eating/nap vignettes auto-advance on timers (skippable by tap) | Keep 3–5 min pace, no player health/feeding tasks |
| 15 | Curtain = per-vertex sine wave + scale, not cloth sim | Perf + art direction |
| 16 | Free play mode = same room transforms, no ordering, exposed via replay card | Cheap high-value replay feature reusing existing systems |
