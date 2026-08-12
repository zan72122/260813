# FILE_OWNERSHIP

同一ファイルの同時編集禁止。owner領域外への書き込み禁止。違反はintegrationでrevertされる。

| Path | Owner | Wave |
|---|---|---|
| `docs/**` | Fable 5(統括) | 1 |
| `package.json`, lockfile, `vite.config.ts`, `tsconfig*.json`, `eslint.config.js`, `playwright.config.ts`, `vitest.config.ts`(または統合config) | Foundation → 凍結 | 2 |
| `src/contracts/**` | Foundation → 凍結 | 2 |
| `scripts/**`(verify等) | Foundation → 凍結 | 2 |
| `src/core/**`, `src/render/**`, `src/scene/**`, `src/visual/**` | Renderer owner | 3 |
| `src/game/**`, `src/input/**` | Gameplay owner | 3 |
| `src/ui/**`, `src/audio/**`, `src/styles/**` | UX/audio owner | 3 |
| `tests/unit/**` | 各ownerが自領域のテストを追加(ファイル名prefixで分離: `render-*`, `game-*`, `ui-*`, `contracts-*`) | 2-3 |
| `tests/e2e/**` | Foundation(骨格)→ Integrator(完全経路) | 2,4 |
| `src/app/**`, `src/main.ts`, `index.html` | Integrator | 4 |
| `README.md`, `docs/QUALITY_REPORT.md` | Fable 5(統括) | 5 |
| `artifacts/qa/**` | Integrator(生成物) | 4 |

## 凍結ルール

- Wave 2完了コミット以降、凍結ファイルへの変更はFable 5の明示承認+コミットメッセージに`[contract-change]`が必要。
- Wave 3の3ownerは並列で動くため、上記領域外(特に`src/app/**`, `src/main.ts`, `index.html`, package類)へ触れてはならない。統合前提のstub/仮エントリが必要な場合、自領域内にdemoファイルを置くことは可(ただし最終成果物から参照されないこと)。
