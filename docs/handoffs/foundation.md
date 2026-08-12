# Foundation handoff (Wave 2)

Status: `npm run verify` exits 0 (typecheck → lint → test → build → test:e2e), run
twice in a row to confirm stability. 37 unit tests, 4/4 Playwright projects green.

## What exists now

### Scaffold (frozen after this wave per FILE_OWNERSHIP.md)
- `package.json` / `package-lock.json` — runtime dep: `three` only. Dev deps:
  `typescript`, `vite`, `vitest`, `@playwright/test`, `eslint`, `typescript-eslint`,
  `@eslint/js`, `@types/three`, `globals`. No jsdom/prettier/npm-run-all/etc.
- `tsconfig.json` — strict, `noUncheckedIndexedAccess`, `moduleResolution: bundler`,
  target ES2022, `include: ["src", "tests"]`.
- `vite.config.ts` — minimal, `base: './'`.
- `vitest.config.ts` — separate file (kept `vite.config.ts` minimal as specced);
  `environment: 'node'`, `include: ['src/**/__tests__/**/*.test.ts']`.
- `eslint.config.js` — flat config, `typescript-eslint` **non**-type-checked
  `recommended` (kept pragmatic, no stylistic/type-checked strict presets per
  instructions). `no-unused-vars` allows `_`-prefixed names. Ignores
  `dist/**, artifacts/**, node_modules/**, playwright-report/**, test-results/**`.
- `playwright.config.ts` — `testDir: tests/e2e`, webServer runs
  `npm run preview -- --port 4173 --strictPort` against the already-built `dist`
  (does **not** rebuild — `verify` builds first). 4 Chromium projects
  (phone/tablet × portrait/landscape) with `--use-angle=swiftshader
  --enable-unsafe-swiftshader`. `retries: 0`, `workers: 2`, `fullyParallel: false`,
  10s action/expect timeouts.
- `.gitignore` — `node_modules, dist, playwright-report, test-results`.
  `artifacts/` is intentionally **not** ignored (Wave 4 QA screenshots go in
  `artifacts/qa/**` and must be committed).

### `src/contracts/**` (frozen — do not edit outside Foundation/Integrator)
- `types.ts` — `GamePhase`, `GameState`, `BeamShape`, `QualityLevel`, `AnchorId`,
  `Anchor`, `GameEventMap`/`GameEventName`, `CameraCueName`. All fields match
  `GameState`'s shape in ARCHITECTURE_CONTRACT.md verbatim.
- `bus.ts` — `createEventBus()`: `on/off/emit`, `on()` returns an unsubscribe
  function. `emit()` iterates a **snapshot** of the listener set, so
  subscribing/unsubscribing (including self-unsubscribe) from inside a handler
  during `emit()` is safe and doesn't throw or skip/duplicate other listeners.
- `store.ts` — `createStore(initial)`: `get/set/update/subscribe`. Exactly one
  synchronous notify per `set()`/`update()` call. Exports `Store<T>` and the
  concrete alias `GameStore = Store<GameState>` used by every module's factory
  signature.
- `machine.ts` — `createInitialState(seed, prefs)`, `TRANSITIONS` table (canonical
  order + `complete → {opening, playRivet, playClimb}` + `playRivet/playClimb →
  complete`), `advance(store, bus, to)`, `mulberry32(seed)`,
  `beamShapeFor(seed, towerLevel)`, `MAX_TOWER_LEVEL` (= 8).
- `anchors.ts` — `createAnchorRegistry()`: `set/get/all/clear/hitTest(x, y,
  padding?)`. `hitTest` returns the most-recently-`set()` **active** anchor whose
  `(r + padding)` circle contains the point (registration order = z-order).

Unit tests (`src/contracts/__tests__/`, 37 tests total): bus add/remove-during-emit
(including self-unsubscribe and late-subscribe mid-emit), store
subscribe/unsubscribe + single-notify-per-set, machine legal-transition full-loop
walk + illegal/skip-ahead no-ops + `complete→{opening,playRivet,playClimb}` +
`towerLevel` increment-and-cap on `reveal`, PRNG determinism + range +
`beamShapeFor` determinism/coverage, anchor hitTest (inside/outside/padding/
inactive/topmost-on-overlap).

### Minimal bootable app (skeleton — Wave 3 owners replace internals; `src/app/**`
stays frozen/Integrator-only through Wave 3)
- `index.html` — `lang="ja"`, correct viewport/theme-color meta, `#app` /
  `[data-testid=game-canvas]` / `#ui`, loads `/src/main.ts` as a module. No
  external fonts/CDN.
- `src/main.ts` → `src/app/index.ts` `createApp()`: parses `?seed`/`?test=1`/
  `?reduced=1` + `prefers-reduced-motion`; builds store/bus/anchors; constructs
  all four owner modules via their frozen factory signatures; installs
  `window.__game` (`getState, dispatch, setPhase, sceneReady, settled, stats,
  seed`); runs one rAF loop with fixed 16.67 ms step under `?test=1`; stops on
  `document.hidden`/resumes on visible; 200 ms debounced resize (+
  `visualViewport`); global `error`/`unhandledrejection` handlers show a
  text-free `[data-testid=error-fallback]` overlay (pictogram SVG + reload
  button); wires `webglcontextlost`/`restored`; advances `loading → title` once
  `renderer.ready` resolves.
- `src/core/index.ts` — real `THREE.WebGLRenderer`, sky-color background + fog,
  a ground plane, hemi + directional light, `resize/start/stop/setQuality/
  isSettled/getStats/dispose`, context-loss/-restore listeners. No placeholder
  geometry — just deliberately plain (Wave 3a replaces with tower/crane/scene).
- `src/game/index.ts` — auto-advances `opening → hookDown` after 2.5 s
  (0.625 s under `?test=1`, i.e. × 0.25 as specced). Nothing else yet (Wave 3b
  adds real phase controllers + input).
- `src/ui/index.ts` — `[data-testid=loading-screen]` (hidden once phase leaves
  `loading`), `[data-testid=title-screen]` with a big circular
  `[data-testid=title-start]` button (dispatches `title→opening`), and a
  `[data-testid=sound-toggle]` stub that flips `store.audio.muted`.
- `src/audio/index.ts` — lazy `AudioContext`, `unlock()` resumes it and sets
  `store.audio.unlocked = true`. No synthesized SFX yet (Wave 3c adds).
- `src/styles/base.css` — reset, safe-area padding via `env()`, fullscreen
  canvas, `#ui` overlay layer, plus bare-bones layout for the loading/title/
  sound-toggle skeleton elements above. UX (Wave 3c) owns this file going
  forward and should feel free to replace the visual language entirely per
  VISUAL_ACCEPTANCE.md — only the safe-area/fullscreen/layer mechanics need to
  survive.

### E2E skeleton
- `tests/e2e/helpers.ts` — `gotoGame(page, params)` (always sets `?test=1`),
  `waitForPhase(page, phase)`, `waitForSettled(page)`. All poll
  `window.__game`; no fixed sleeps anywhere.
- `tests/e2e/smoke.spec.ts` — loads `?test=1&seed=42`, waits for `title`,
  asserts loading screen hidden + title-start visible, asserts zero console
  errors, taps `title-start`, waits for phase to leave `title`, asserts
  `window.__game` exists, asserts zero console errors again. Runs in all 4
  viewport projects (16 assertions total across projects).

## What Wave 3 owners must replace

- **Renderer** (`src/core/**`, `src/render/**`, `src/scene/**`, `src/visual/**`):
  replace the plain ground/sky scene with the tower/crane/beam/workers/Paris
  backdrop, camera director (`cam:cue` cues), procedural textures, steam/spark
  particles, publish real `Anchor`s every frame via the registry.
- **Gameplay** (`src/game/**`, `src/input/**`): replace the single opening timer
  with real per-phase controllers (hookDown drag/snap, hoist sway, align gain
  curve, bolts, rivet relay/hammer/cool, sling, climb lever), pointer→intent
  input mapping, idle/assist (3 s breathe / 5 s point) logic.
- **UX** (`src/ui/**`, `src/audio/**`, `src/styles/**`): replace the loading
  spinner/title button/sound stub with the full pictogram UI (hint layer, pause,
  replay menu, play-rivet/play-climb entry points, `back-to-complete`), add
  synthesized WebAudio SFX, and restyle `src/styles/**` to the 1888
  construction-site visual language (no neon/glassmorphism/cards). The full
  `data-testid` contract in ARCHITECTURE_CONTRACT.md lists 13 ids; this wave
  only implements `app-root, game-canvas, title-start, sound-toggle,
  loading-screen, error-fallback` (the ones reachable with a loading→title-only
  loop). UX still owes: `pause-toggle, hint-layer, replay-same, replay-new,
  play-rivet, play-climb, back-to-complete`.
- All three own-path `__tests__/` unit tests live under their own directories
  (e.g. `src/game/__tests__/...`), per FILE_OWNERSHIP.md.

`src/contracts/**`, `package.json`/lockfile, and config files are frozen — if a
Wave 3 owner believes a contract type/API needs to change, that must go through
the Integrator, not a direct edit.

## Deviations from the literal contract text (with reason)

1. **`@playwright/test` pinned to `~1.56.0`** instead of the `^1.48.0` example
   in the task prompt. The pre-installed browser at
   `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` is Chromium revision `1194`,
   which only `@playwright/test` 1.56.0/1.56.1 ship against (verified by
   installing `playwright-core` at several versions and diffing
   `browsers.json`). Any `^1.x` range would let `npm install` float to a newer
   Playwright whose expected Chromium revision doesn't exist on disk, and we
   were told **never** to run `playwright install`. Used `~` instead of `^` for
   this one package specifically so a bare `npm install` (not `npm ci`) can't
   drift onto an incompatible Playwright while still getting patch fixes;
   `package-lock.json` pins the exact resolved `1.56.1`.
2. **`advance(store, bus, to)` takes the bus as an explicit third argument**,
   not just `advance(store, to)` as literally written in the prompt/contract
   summary — it has to emit `phase:enter` on *a* bus, and the bus is not
   reachable from the store alone (store and bus are deliberately decoupled
   contracts). `window.__game.dispatch` closes over both and matches the
   documented `dispatch: (to) => advance` shape from the caller's point of
   view.
3. **`vitest.config.ts` is a separate file**, not merged into `vite.config.ts`,
   so `vite.config.ts` could stay exactly "minimal, base: './'" as specced.
4. **`MAX_TOWER_LEVEL = 8`** — PRODUCT_SPEC.md says "最大表示レベルあり" without
   giving a number; picked a concrete cap so `advance()`'s `reveal`-entry
   increment logic is well-defined and Renderer has a fixed level range
   (0..8) to design the tower-height LOD around. Easy to change in one place
   if Wave 3a wants a different cap — it's exported for that reason.
5. **`GameEventMap` payload shapes were invented** — ARCHITECTURE_CONTRACT.md
   freezes the event *names* but not their payloads. Kept every payload as
   small/obvious as possible (e.g. `bolt:seated: { index: 0 | 1 }`,
   `rivet:hit: { hits: 1 | 2 | 3 }`, empty-object payloads for pure
   notifications) so downstream owners have something to compile against
   immediately; flag to the Integrator if a richer payload turns out to be
   needed anywhere, since this file is otherwise frozen.
6. **`PHASE_RESET` per-phase sub-state reset choices are opinionated** (see
   comments in `machine.ts`): entering a phase resets only that phase's own
   sub-state (e.g. entering `align` resets `align`, not `hook`/`hoist`), and
   entering `opening` (whether from `title` or replay-from-`complete`) resets
   every per-loop field but leaves `seed`/`towerLevel` untouched — a caller
   that wants a *new* seed on replay should `store.set({ seed, beamShape:
   beamShapeFor(seed, towerLevel) })` before/independently of calling
   `advance(store, bus, 'opening')`. This wasn't spelled out field-by-field in
   the contract, so flagging the choice explicitly here.

## Known gaps at this wave (expected — not defects)

- The renderer publishes no `Anchor`s yet (empty registry) since there's no
  interactive geometry yet; Input/UI hit-testing has nothing to hit until
  Wave 3a wires anchors.
- No idle/assist (breathe/point) behavior, no real phase controllers beyond the
  `opening` timer — everything past `hookDown` currently has no way to
  advance except `window.__game.dispatch(...)`/`setPhase(...)` in tests.
- `sfx:*` is treated as one literal event name/key (as written in the frozen
  event list), not a true wildcard-matching mechanism — every SFX cue emits
  under that exact key today; Wave 3c can layer a `name`-based dispatch on top
  of the payload (`{ name: string }`) without touching the frozen bus API.
- CSS/UI/audio are intentionally bare — placeholders only in the sense of "not
  yet the final art direction", not TODO/FIXME markers (none exist in the
  code).

## Verification performed

- `npm install` — clean, only the approved dependency set installed.
- `npm run typecheck` / `npm run lint` — 0 errors both times run.
- `npm run test` — 37/37 unit tests pass (`src/contracts/__tests__/**`).
- `npm run build` — succeeds; JS bundle ≈120 KB gzip (well under the 900 KB
  target), no console/build warnings.
- `npm run test:e2e` — 4/4 Playwright projects (phone/tablet ×
  portrait/landscape) pass with zero collected console errors.
- `npm run verify` — run twice back-to-back, exit 0 both times, no leftover
  `vite preview`/dev processes after either run.
- `npm run dev -- --port 5199 --strictPort` sanity-checked manually (HTTP 200,
  clean startup log), then killed — not part of `verify` but confirms the dev
  script itself is not broken.
