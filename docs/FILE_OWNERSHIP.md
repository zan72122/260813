# FILE_OWNERSHIP

Exclusive ownership during Wave 3 (parallel implementation). No overlaps.
Violating ownership = review reject.

| Owner | Exclusive paths |
|---|---|
| **Foundation (Wave 2, then FROZEN)** | `package.json`, lockfile, `tsconfig*.json`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.*`, `.npmrc`, `src/contracts/**` |
| **Foundation (Wave 2, then handed to Integrator)** | `index.html`, `src/main.ts`, `src/app/**`, `tests/e2e/**`, `scripts/**` |
| **Renderer/mechanics owner (Wave 3)** | `src/core/**`, `src/render/**`, `src/scene/**`, `src/visual/**`, `tests/unit/render*/**` |
| **Gameplay/math owner (Wave 3)** | `src/game/**`, `src/input/**`, `tests/unit/game/**` |
| **UX/audio owner (Wave 3)** | `src/ui/**`, `src/audio/**`, `src/styles/**`, `tests/unit/ui/**` |
| **Integrator (Wave 4)** | `index.html`, `src/main.ts`, `src/app/**`, `tests/e2e/**`, `scripts/**`, `README.md`; minimal cross-cutting fixes anywhere EXCEPT `src/contracts/**` and package/lockfile |

Wave 3 additional rules:
- Never edit `package.json`/lockfile/configs/`src/contracts/**`.
- Never run a repo-wide formatter.
- No placeholders, no TODOs left behind.
- Unit tests live with the owner of the code under test.
- Review-fix rounds: findings go back to the same owner boundaries.
