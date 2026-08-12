# TASK_GRAPH

```
Wave 0 調査(済)
  - Repo audit: 空リポジトリ確認(README 9Bのみ、ツール・テストなし)— main sessionが直接確認
  - Domain research: docs/HISTORICAL_NOTES.md に反映済み
Wave 1 契約(済み次第commit) — Fable 5
  - PRODUCT_SPEC / HISTORICAL_NOTES / ARCHITECTURE_CONTRACT / VISUAL_ACCEPTANCE / PERFORMANCE_BUDGET / TASK_GRAPH / FILE_OWNERSHIP
Wave 2 Foundation — Sonnet 5 xhigh ×1(逐次)
  - Vite+TS strict+Three.js+Vitest+Playwright+ESLint導入、npm scripts、verify script
  - src/contracts/** 全ファイル(types/constants/events/intents/camera/handles/audio/quality/rng/testing)
  - game state machineの骨格とleg数理モデル+不変条件unit tests(contracts-*)
  - e2e骨格(4 viewport projects, fixture)
  - gate: npm run typecheck/lint/unit がexit 0 → commit → 凍結
Wave 3 並列実装 — Sonnet 5 ×3(renderer=xhigh, gameplay=xhigh, ux/audio=high)
  - Renderer: シーン・材質・カメラ・magnifier・砂描画・品質・復旧
  - Gameplay: 状態機械完成・assist・seed・input・no-softlock・replay
  - UX/audio: overlay UI・hint・音・layout・reduced motion
  - 各自、自領域unit tests追加。gate: 自領域テスト green
Wave 4 統合 — Sonnet 5 xhigh ×1
  - src/app, main.ts, index.html、配線、e2e完全経路、QAスクリーンショット4 viewport
  - gate: npm run verify exit 0
Wave 5 独立レビュー — Sonnet 5 ×3(blind visual / child-UX / code-perf)
  - 指摘 → 該当ownerが修正 → integrator再統合 → verify再実行
Wave 6 出荷 — Fable 5
  - QUALITY_REPORT.md、README、最終判定、push
```

並列上限: active agent ≤ 6。nested delegation禁止。モデルは常に明示。
