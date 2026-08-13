# FINAL_ACCEPTANCE — 最終受入判定

判定者: Claude Fable 5 (control plane)。対象コミット: 725a368。判定日: 2026-08-13。
証拠: Wave 3/5統合時のコマンド実行結果、コミット済み `screenshots/**`、および Wave 4 独立 Verifier
（読み取り専用 Sonnet、worktree で npm ci からの全再実行＋独自 Playwright セッション）の報告。

## コマンド実行結果（クリーン状態から複数回再現）

| コマンド | 結果 |
|---|---|
| npm ci | OK |
| npm run typecheck | OK（strict、エラー0） |
| npm test | OK（unit 32/32） |
| npm run build | OK（警告1: JSチャンク>500kB、非ブロッキング） |
| npm run test:e2e | OK（9/9、console/page error 0） |

## 受入項目判定

| # | 条件 | 判定 | 証拠 |
|---|---|---|---|
| A1 | 起動からFinaleまで一周 | **PASS** | Verifier独自スクリプトで title→3噴水→finale→replay-choice を連続一周。e2e full-loop 9/9 |
| A2 | 時計回り円運動の認識 | **PASS** | CWドラッグで openness 0→0.122 増加。CCW では不変（減少しない＝罰しない） |
| A3 | 指を止めると水も止まる | **PASS** | 静止保持中 openness / waterProgress / flowIntensity の変化量が6サンプル連続で厳密に0 |
| A4 | 因果を文章なしで追える | **PASS** | Gate B目視審査＋Verifier画面審査: 笛→バルブ→配管断面→噴水が連続、テキストオーバーレイなし |
| A5 | 操作点が指で隠れない | **PASS** | valve-turn構図でレンチ柄と円形ガイドが外周に露出（screenshots/*/valve-turn.png） |
| A6 | 縦横回転で状態維持 | **PASS** | バルブ操作中に390×844→844×390へ変更、phase と openness (0.164) が完全一致、canvas正常 |
| A7 | console error 0 | **PASS** | e2e全specとVerifier独自2セッションで console error 0・unhandled rejection 0 |
| A8 | 完了後二タップ以内で再プレイ | **PASS** | replay-choice から2タップで valve-turn 操作可能状態に到達（実測） |
| A9 | 外部権利不明アセット不使用 | **PASS** | Verifier監査: リポジトリ・dist内の画像/3D/音源/フォント/CDN参照ゼロ。全アセット手続き生成 |
| A10 | ASSET_MANIFEST.md 存在 | **PASS** | ルートに存在、生成アセット群の由来を記録、実態と一致 |

## 品質予算（実測: window.__versailles.rendererInfo）

| 指標 | 目標 | 実測 |
|---|---|---|
| draw calls | ≤120 | reveal 66 / finale 89 |
| triangles | ≤250k | reveal 21,290 / finale 23,626 |
| particles | ≤1500 | コード上で共有プール上限として強制（実行時観測は不可 → 下記） |

## NOT VERIFIED（この環境で検証不可能な項目）

- iPhone/iPad 実機の Safari での動作・体感性能（検証は preinstalled Chromium。WebGL2・タッチ合成・
  縦横切替・DPR制限・audio unlock は検証済みだが、実機 Safari 固有挙動は未検証）
- 合成音の実聴感（headless環境。AudioContext の unlock・状態遷移・例外なしは検証済み）
- particle 実行時総数の実測（上限はコードで強制、実行時カウンタ未公開）
- 2周目以降の draw calls 単調増加チェック（環境タイムアウト。dispose/listener 対は源泉レビューで確認済み）

## 既知のLow所見（非ブロッキング）

1. phase開始直後の1フレーム程度、hotspots が過渡的に画面外座標を返しうる（カメラease中）。実プレイ・
   リトライ式自動化には影響なし
2. rAFループが4本並存する構造（各自ガード・破棄あり、リーク・重複描画なし。集中管理でないだけ）

## 総合判定

**受入: 合格（ACCEPT）** — 全A項目に直接証拠あり。史実記録（HISTORICAL_TRUTH.md）の
Verified/Plausible/Dramatized 区分と権利方針も遵守。
