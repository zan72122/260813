# TASK_GRAPH

```
Wave 0  Research (done)
  R1 repo/env audit ─┐
  R2 domain research ─┴─► Wave 1

Wave 1  Contracts (Fable, done when these docs exist)
  PRODUCT_SPEC, HISTORICAL_NOTES, ARCHITECTURE_CONTRACT, MATH_CONTRACT,
  CAMERA_CONTRACT, VISUAL_ACCEPTANCE, PERFORMANCE_BUDGET, TASK_GRAPH,
  FILE_OWNERSHIP  ─► commit "wave1: contracts"

Wave 2  Foundation (1 × sonnet xhigh)
  F1 scaffold: Vite+TS strict+Three+Vitest+Playwright(1.56.1)+ESLint, .npmrc
  F2 src/contracts/**: types, constants, states, events, camera cues, testing API
  F3 src/app skeleton + main.ts + index.html: boot, loop (fixed-step), store,
     bus, stub subsystem interfaces wired, blank-scene renders, __eiffel stub
  F4 test harness: vitest sample, playwright smoke (app boots, sceneReady,
     no console errors), scripts/verify (typecheck+lint+unit+build+e2e)
  gate: npm run verify green on stub app ─► commit "wave2: foundation" ─► FREEZE

Wave 3  Parallel implementation (3 × sonnet, no file overlap)
  A renderer/mechanics (xhigh): core/render/scene/visual
  B gameplay/math (xhigh): game/input + unit tests
  C ux/audio (high): ui/audio/styles
  gate: each owner's own unit tests + typecheck pass ─► commit per owner

Wave 4  Integration (1 × sonnet xhigh)
  I1 wire real subsystems in src/app, replace stubs
  I2 full e2e complete-loop test + screenshot capture at all cues × 4 viewports
  I3 npm run verify green  ─► commit "wave4: integration"

Wave 5  Review (3 × fresh-context reviewers, parallel)
  V1 blind visual (screenshots only)
  V2 child-UX (drives the app via playwright)
  V3 math/code/perf (reads code, runs tests)
  ─► Fable triages ─► fix round(s) by original owners ─► re-integrate ─► re-verify

Wave 6  Release
  QUALITY_REPORT.md, README, final verify, QA artifacts, final commit + push
```
