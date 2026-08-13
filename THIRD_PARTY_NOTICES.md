# Third-Party Notices

へんしん！いちにち保育室 uses no external or copyrighted game assets — every
geometry, texture, and sound is generated in code at runtime. The dependencies
below are development/build/runtime tooling only.

| Package | Version | License | Role |
|---|---|---|---|
| [three](https://www.npmjs.com/package/three) | 0.180.0 | MIT | 3D rendering (WebGLRenderer, scene graph, geometry/material primitives) — the only runtime dependency shipped in `dist/`. |
| [vite](https://www.npmjs.com/package/vite) | 7.3.6 | MIT | Dev server and production bundler. |
| [typescript](https://www.npmjs.com/package/typescript) | 5.9.3 | Apache-2.0 | Type checking / compilation (strict mode). |
| [vitest](https://www.npmjs.com/package/vitest) | 3.2.7 | MIT | Unit test runner for `src/game/`. |
| [@playwright/test](https://www.npmjs.com/package/@playwright/test) | 1.56.1 | Apache-2.0 | End-to-end test runner (`e2e/`). |
| [eslint](https://www.npmjs.com/package/eslint) | 9.39.1 | MIT | Linting (flat config). |
| [typescript-eslint](https://www.npmjs.com/package/typescript-eslint) | 8.67.0 | MIT | TypeScript rules/parser for ESLint. |
| [@types/three](https://www.npmjs.com/package/@types/three) | 0.180.0 | MIT | Type declarations for `three` (dev-only). |
| [@types/node](https://www.npmjs.com/package/@types/node) | 22.20.1 | MIT | Type declarations for Node APIs used in config files (dev-only). |

Exact resolved versions are pinned (no `^`/`~` ranges) in `package.json` and
locked in `package-lock.json`. Only `three` is a runtime `dependency`; every
other package above is a `devDependency` used solely to build, type-check,
lint, or test the project and is not included in the shipped `dist/` bundle.

## Fonts, images, audio

None. All visuals are procedurally generated Three.js geometry plus
`<canvas>`-drawn textures (wood grain, fabric weave, blob-shadow gradients,
star sprite, basket/badge symbol atlas), and all sound is synthesized at
runtime with the Web Audio API (oscillators, filtered noise buffers, gain
envelopes). No hotlinked or bundled external media of any kind.

## Runtime environment

Chromium (via Playwright, version 1194) is used for automated testing only
and is not distributed with the game; it is not a project dependency.
