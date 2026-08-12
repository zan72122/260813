# FILE_OWNERSHIP — 専有パス

Wave 3並列中、各ownerは自分の専有パス**のみ**編集可。package.json / lockfile / src/contracts / src/app / src/main.ts / index.html / 設定ファイルはWave 3中は全員凍結（統合者のみ変更可）。

| Owner | 専有パス |
|-------|---------|
| Foundation (Wave 2, その後凍結) | package.json, package-lock.json, tsconfig*, vite.config.ts, eslint.config.*, vitest設定, playwright.config.ts, src/contracts/**, src/app/**(骨組み), src/main.ts(骨組み), index.html(骨組み), tests/**(骨組み), scripts/** |
| Renderer | src/core/**, src/render/**, src/scene/**, src/visual/** |
| Gameplay | src/game/**, src/input/** |
| UX | src/ui/**, src/audio/**, src/styles/** |
| Integrator (Wave 4) | src/app/**, src/main.ts, index.html, tests/**, 真に必要な場合のみpackage関連 |

- 各ownerはユニットテストを自分の専有パス内 `__tests__/` に置く（例: src/game/__tests__/sway.test.ts）。tests/ ルートはfoundation/integrator専有（E2E）。
- 各ownerは完了時に `docs/handoffs/<owner>.md` へ公開API・変更ファイル・既知事項を短く記録する（docs/handoffs/はowner毎に自分のファイルのみ）。
- 全体formatter実行・一括rename・依存追加は禁止。
