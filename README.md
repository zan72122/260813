# ななめなのに水平！ エッフェル塔エレベーター

**Eiffel Tower Inclined Elevator — "Slanted, Yet Level!"**

A production-quality mobile web game for a 4-year-old. The player slides the
big underground hydraulic lever, watches the causal chain of pistons →
linkage → pulley → cable → carrier come alive, then rides the Eiffel Tower's
historic inclined leg elevator up past the moment the track's slope suddenly
steepens from 54° to 74° — turning a big level wheel to help the passenger
cabin's floor stay perfectly horizontal the whole way, proven by a glass tank
of water, a soft ball, a hanging lamp, and the Paris horizon itself. No text,
no score, no failure state — one finger, one continuous story, 3–5 minutes.

4歳の女の子のための、地下の水圧機械を動かしてエッフェル塔の傾斜エレベーターに乗る
絵本のようなゲームです。斜面が54度から74度に急に変わっても、キャビンの床だけは
水平を保ち続けます。文字を読む必要はありません。

## Quickstart

```bash
npm install
npm run dev       # local dev server (http://localhost:5173)
npm run verify    # typecheck + lint + unit tests + production build + e2e
```

## Documentation

The binding product/engineering contracts live in [`docs/`](./docs):

| Doc | Covers |
|---|---|
| [`PRODUCT_SPEC.md`](./docs/PRODUCT_SPEC.md) | Game flow, states, core verbs, guarantees |
| [`ARCHITECTURE_CONTRACT.md`](./docs/ARCHITECTURE_CONTRACT.md) | Module layout, dependency rules, test API |
| [`MATH_CONTRACT.md`](./docs/MATH_CONTRACT.md) | Track geometry, drive pipeline, leveling math |
| [`CAMERA_CONTRACT.md`](./docs/CAMERA_CONTRACT.md) | Camera cue chain and framing rules |
| [`VISUAL_ACCEPTANCE.md`](./docs/VISUAL_ACCEPTANCE.md) | Art direction, palette, screenshot acceptance set |
| [`PERFORMANCE_BUDGET.md`](./docs/PERFORMANCE_BUDGET.md) | Draw call / triangle / memory budgets |
| [`FILE_OWNERSHIP.md`](./docs/FILE_OWNERSHIP.md) | Who owns which paths, per wave |
| [`TASK_GRAPH.md`](./docs/TASK_GRAPH.md) | The build's wave-by-wave plan |
| [`HISTORICAL_NOTES.md`](./docs/HISTORICAL_NOTES.md) | The real 1899 Fives-Lille elevators this game abstracts |

## Stack

Vite + TypeScript (strict) + Three.js + Vitest + Playwright + ESLint. No
physics engine, no UI framework, no runtime network calls. All geometry is
procedural, all textures are canvas-generated, all audio is synthesized via
WebAudio.

## Controls

One finger only, no reading required — every control is a pictogram drawn as
a physical machine part, shown one at a time (one verb per scene). If a
control sits idle for 5 seconds, a short ghost-hand animation demonstrates
the gesture.

| Control | Where | Gesture | Effect |
|---|---|---|---|
| Tap anywhere | Attract screen | Tap | Begins the ride |
| Master lever | Machine room | Vertical slide (≥120px travel) | Opens the hydraulic valve proportionally; release eases it shut — nothing ever breaks |
| Up/down throttle | Riding (ascend/descend) | Press and hold ▲/▼ | Holds a calm, accel-limited climb/descent speed; release eases to a smooth stop |
| Level wheel | The slope transition | Rotate left/right | Helps the cabin floor stay level with the horizon; wide magnetic snap and a 3-second auto-assist mean success is guaranteed even with no input |
| Replay tiles (×4) | Replay menu | Tap | Ride again ▲ · ride down ▼ · machine-room free play · jump straight back to the slope-change moment |
| Pause / resume | Top corner, any time | Tap | Freezes and restores the ride exactly |
| Sound on/off | Top corner, any time | Tap | Mutes/unmutes (remembered next visit) |

## Browser support

Built for mobile Safari on iPhone and iPad (portrait and landscape are both
first-class), and any evergreen desktop browser with WebGL2 for development.
Requires WebGL2 — if a device doesn't have it, a friendly static illustration
is shown instead of a crash. Orientation can change at any moment without
losing the ride's state.

## Development

```bash
npm install
npm run dev         # local dev server
npm run build        # tsc -b type-check + production build
npm run preview      # serve the production build locally
```

## Quality gates

```bash
npm run typecheck   # tsc -b, strict, zero errors
npm run lint         # eslint flat config, zero errors/warnings
npm run test:unit   # vitest — pure math/logic, node environment
npm run test:e2e     # playwright — boots the production build, 4 viewports
npm run verify        # the whole gate: typecheck && lint && test:unit && build && test:e2e
```

`npm run verify` is the single command that must pass before any commit —
it type-checks, lints, runs unit tests, builds the production bundle, and
then runs the Playwright e2e suite against that real build.

### Deterministic mode

Append `?det=1&seed=N` to the URL to disable RAF-driven simulation stepping;
the sim clock then only advances via `window.__eiffel.step(n)`. This is what
the e2e/QA harness uses to scrub to exact moments for screenshots without
ever waiting on a wall-clock timeout.

## Project layout

```
src/contracts/**   frozen shared types, constants, events, test API (Wave 2)
src/app/**         boot sequence, fixed-step loop, DI wiring (Wave 2 → 4)
src/core/**        engine loop, quality manager, resize, context recovery
src/render/**      renderer setup, materials, lighting
src/scene/**       tower, machine room, carrier, cabin meshes
src/visual/**      camera director, cutaway, effects
src/game/**        state machine, track math, sim, assists
src/input/**       pointer handling, gesture → intent mapping
src/ui/**          DOM/scene-integrated controls, pictograms, menus
src/audio/**       WebAudio synth engine, sound cues
src/styles/**       CSS, safe-area, portrait/landscape layouts
tests/unit/**      unit tests, owned by the owner of the code under test
tests/e2e/**       Playwright smoke + full acceptance suite (complete-loop,
                   replay, robustness, screenshots), plus QA screenshots
                   under artifacts/qa/<viewport>/
```

See [`docs/FILE_OWNERSHIP.md`](./docs/FILE_OWNERSHIP.md) for the exact
ownership boundaries during parallel implementation.
