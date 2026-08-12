# エッフェル塔をのぼる蒸気クレーン

小さな蒸気クレーンが、鉄骨を吊り上げ、赤く焼けたリベットで塔へ固定し、一仕事終えるたびに――**自分の作った塔を、自分でガチャガチャとよじ登る**。1889年のパリ、建設中のエッフェル塔が舞台。史実では実際に4基のクリーパー・クレーンが塔の脚を自ら登りながら塔を組み上げた（詳しくは [docs/HISTORICAL_NOTES.md](docs/HISTORICAL_NOTES.md)）。この史実の「自己上昇クレーン」を、4歳児が主役として体験できる玩具的な一周3〜5分のループに翻案した作品。

対象は4歳女児、iPhone/iPad・縦横両対応・一指操作。文字を読まなくても最初から最後まで遊べる（絵と身振りだけで進行が伝わるよう設計）。失敗・ゲームオーバー・得点・広告・課金・ログインは一切ない。

## あそびかた（絵でわかる操作の流れ）

画面の指示はすべて絵（ピクトグラム）。文章は読めなくてよい。

| 場面 | すること |
|---|---|
| タイトル | 大きなレバーをタップ |
| フックおろし | 画面をどこでも下へドラッグ → 鉄骨に近づくと自動で吸着 |
| 巻き上げ | 上へドラッグ／スワイプ → 荷物が持ち上がる（少し揺れる） |
| 位置合わせ | 透けた影（ここに置く場所）へドラッグで近づける → 自動で吸着 |
| ボルト留め | 大きなボルト2本を穴へドラッグ（順不同） |
| リベット加熱 | 炉をタップして真っ赤に |
| リベット運搬 | 右へスワイプ×2 で作業員から作業員へ手渡し |
| 差し込み・打撃 | 穴をタップ→打点をタップ×3 で頭が丸く仕上がる |
| 冷却 | 見ているだけで冷めて鉄色に戻る |
| 留め具はずし | 留め具をタップ |
| **クレーンのぼり（見せ場）** | 大きなレバーを上へドラッグ。途中で指を離しても登り続ける |
| 完成 | 塔が一段高くなる。絵のメニューから次を選ぶ（同じ鉄骨でもう一回／ちがう鉄骨で／リベットだけ遊ぶ／のぼるだけ遊ぶ）、いずれも2タップ以内で再開 |

音を切っても最後まで遊べる（右上のスピーカーで切り替え）。左上の一時停止ボタンでいつでも止められる。

## 実行・ビルド・テスト

```
npm install       # three のみが実行時依存。プレイヤーインストールは実行しない
npm run dev       # 開発サーバ
npm run build     # 本番ビルド (dist/)
npm run preview   # ビルド済みdistの配信確認
npm run typecheck # TypeScript strict
npm run lint      # ESLint
npm run test      # 単体テスト (vitest)
npm run test:e2e  # E2E (Playwright, 4視点)
npm run verify    # typecheck → lint → test → build → test:e2e を一気通貫、いずれか失敗で非0
```

`test:e2e`/`verify` は `vite preview` (dist) に対して、既存インストール済みのChromium (`PLAYWRIGHT_BROWSERS_PATH`) を `--use-angle=swiftshader --enable-unsafe-swiftshader` で起動して実行する。`playwright install` は実行不要・実行禁止。

## アーキテクチャ概要

Vite + TypeScript (strict) + Three.js。実行時依存は `three` のみ。アセットはすべて手続き生成（Canvasテクスチャ・WebAudio合成音）、外部ファイル・外部通信は使わない。

```
src/contracts/   共有型・イベントバス・ストア・状態機械・anchor registry（凍結契約）
src/core/        WebGLループ・resize・adaptive quality・context-loss復旧        [Renderer]
src/render/      カメラディレクタ・ライティング                                  [Renderer]
src/scene/       塔・クレーン・鉄骨・作業員・パリ遠景のprocedural構築            [Renderer]
src/visual/      蒸気/火花パーティクル・赤熱emissive・procedural texture         [Renderer]
src/game/        フェーズごとの進行ロジック・assist/hint制御                     [Gameplay]
src/input/       pointer→intent変換・anchorヒットテスト                          [Gameplay]
src/ui/          DOM overlay（pictogram, HUD, メニュー, 一時停止）               [UX]
src/audio/       WebAudio合成効果音・unlock・mute                                [UX]
src/styles/      CSS・safe-area・縦横レイアウト                                  [UX]
src/app/         全モジュールの結線・ライフサイクル管理                          [Integrator]
```

**契約パターン**: モジュール間の直接importは`src/contracts/**`経由のみ。単一の観測可能ストア（`GameState`）が唯一の真実で、Gameplayが入力を受けて状態を進め、Renderer/UI/Audioはストア購読とイベントバス（`EventBus`）で反応する。Rendererは毎フレーム、対話対象のスクリーン座標を`AnchorRegistry`へpublishし、Input/UIは3D知識なしで2Dヒットテストとヒント配置を行う――描画・ロジック・入力・演出が互いの内部実装を知らずに疎結合で協調する設計。詳細は [docs/ARCHITECTURE_CONTRACT.md](docs/ARCHITECTURE_CONTRACT.md)。

`window.__game`（常設・UI非表示）が `getState/dispatch/setPhase/sceneReady/settled/stats/seed/anchors/listenerCount/timerCount` を公開しており、E2Eテスト（`tests/e2e/`）はこれと実際のポインタ操作だけでゲーム全体を人手を介さず通しプレイできる。

## 品質・性能

実測値・E2E網羅表・QAスクリーンショット一覧・リーク計測は [docs/QUALITY_REPORT.md](docs/QUALITY_REPORT.md) にまとめてある。性能予算そのものは [docs/PERFORMANCE_BUDGET.md](docs/PERFORMANCE_BUDGET.md)、視覚合格基準は [docs/VISUAL_ACCEPTANCE.md](docs/VISUAL_ACCEPTANCE.md) を参照。

## 史実について

このゲームが翻案している史実（クリーパー・クレーンの自己上昇、リベット4人班、部材18,038点、工期など）とその出典は [docs/HISTORICAL_NOTES.md](docs/HISTORICAL_NOTES.md) にまとめてある。
