# へんしん！いちにち保育室 (Henshin! Ichinichi Hoikushitsu)

A finished, small-scope mobile web game for 4-year-olds, playable on iPhone/iPad Safari.
One nursery room transforms: playroom → lunch room → nap room → playroom.

## Canonical documents (read these, in this order, before changing anything)

- `docs/PRODUCT_SPEC.md` — what the game IS. Scenes, play loop, variation seeds.
- `docs/INTERACTION_SPEC.md` — input rules, gesture set, hint system, camera chain.
- `docs/ART_DIRECTION.md` — palette, materials, lighting, what is forbidden.
- `docs/ACCEPTANCE_MATRIX.md` — the definition of done. Every row must pass.
- `docs/DECISIONS.md` — architecture / product decisions already made. Do not relitigate.
- `docs/VERIFICATION.md` — evidence log of what was actually tested (keep updated).

## Commands

- `npm install` — install deps
- `npm run dev` — Vite dev server
- `npm run build` — production build (must succeed with zero TS errors)
- `npm run typecheck` — `tsc --noEmit` (strict)
- `npm run lint` — eslint
- `npm run test` — Vitest unit tests
- `npm run test:e2e` — Playwright tests (Chromium; build + preview server)

## Architecture (fixed — see docs/DECISIONS.md)

- Vite + TypeScript strict + Three.js. No React. No backend, no analytics, no external assets.
- Explicit finite state machine in `src/game/fsm.ts` drives day phases; rendering reads state, never owns it.
- Seeded RNG (`src/game/rng.ts`); seed exposed for tests via `window.__game` test harness
  (enabled only when `?test=1`, stripped of nothing in prod build but inert without the flag).
- All audio synthesized via Web Audio API (`src/audio/`), started on first user gesture.
- Single `<canvas>` + HTML overlay for UI icons. Pointer Events only, one finger.

## Hard rules

- No TODO comments, no placeholder screens, no dead buttons in shipped code.
- No console errors or unhandled rejections at runtime.
- Keep peak draw calls ≤ ~120; textures ≤ 1024px; no cloth/fluid/rigid-body physics libs.
- No text required to play. All meaning via icons, motion, light, sound.
- Screenshots for review go to `artifacts/screenshots/`.
