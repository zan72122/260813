# TASK_GRAPH — 工程

```
Wave 0 調査(済) ─→ Wave 1 契約docs(済)
        │
Wave 2 基盤 [Sonnet xhigh ×1, 逐次]
   scaffold: package/tsconfig/vite/eslint/vitest/playwright
   src/contracts/** 全実装 + 単体テスト
   src/app + main.ts + index.html の骨組み（黒画面でなくプレースホルダなしの最小起動）
   tests/ E2E骨組み(smoke) + scripts/verify
   基準: npm run verify が exit 0（この時点のスコープで）
        │  ← contracts/package 凍結
        ├────────────┬────────────┐
Wave 3a Renderer     3b Gameplay   3c UX   [Sonnet high ×3, 並列, 専有パスのみ]
   scene/render/     game/input    ui/audio/styles
   core/visual
        └────────────┴────────────┘
        │
Wave 4 統合 [Sonnet xhigh ×1]
   app結線・全ループ疎通・E2E全経路・QAスクリーンショット4視点
   基準: npm run verify exit 0 + artifacts/qa/** 20枚
        │
Wave 5 監査 [Sonnet ×3 並列, 新文脈]
   blind visual / child-UX / code-perf
        │
Wave 6 修正 [該当owner + integrator] → 再verify → 最終判定(Fable)
```

## 合否ゲート（Fableが判定）

- G2: verify緑 + contracts型が本契約と一致
- G3: 各owner領域がtypecheck/lint/unit緑 + handoff記録
- G4: verify緑 + 4視点×5場面のQA画像 + 全経路E2E
- G5: 重大/高優先指摘の解消
- 出荷: docs/QUALITY_REPORT.md に証拠記録、README完備
