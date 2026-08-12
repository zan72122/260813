# ACCEPTANCE — 受入基準と証拠要件

Fable 5が最終的に PASS / FAIL / NOT VERIFIED を判定する。証拠なしのPASSは禁止。
証拠 = コマンド出力、Playwrightスクリーンショット、テスト結果ファイル。

## コマンド（すべて exit 0）

| # | コマンド | 証拠 |
|---|---------|------|
| C1 | npm ci（またはnpm install） | 出力ログ |
| C2 | npm run typecheck | 出力ログ |
| C3 | npm test | 出力ログ |
| C4 | npm run build | 出力ログ |
| C5 | npm run test:e2e | 出力ログ＋スクリーンショット |

## スクリーンショット（scripts/ のスクリプトで自動取得）

viewport: 390×844 / 844×390 / 820×1180 / 1180×820 の4種 × 以下の状態。
保存先: scripts/screenshots/（またはtest-results/）。ファイル名に状態とviewportを含める。

| # | 状態 |
|---|------|
| S1 | 豪華な部屋Before（B1 establishアングル） |
| S2 | 地下機構（unlock phase） |
| S3 | 変換50%のsplit/cutaway（旧袖と新袖が同時に見えること） |
| S4 | 森After（B5、S1と同アングル） |
| S5 | 第二景（田舎風室内）After |
| S6 | 低品質mode（QualityTier=low）の見た目 |

## 機能必須項目

| # | 項目 | 検証方法 |
|---|------|---------|
| F1 | rope dragとStageTransformProgressが連続対応 | e2e: 段階的drag→progress読取（window上のdebug hookまたはDOM属性） |
| F2 | 指を止めると機構と舞台が停止 | e2e: drag停止後2フレームの装置位置が不変 |
| F3 | 逆方向で可能な範囲まで戻る | e2e: p=0.6→上drag→p減少・袖位置逆行 |
| F4 | 袖・背景・前景の三層が動く | S3スクリーンショット＋unit test（TIMELINE） |
| F5 | 単純な画像クロスフェードではない | S3で旧袖・新袖の同時可視＋コードレビュー |
| F6 | 上舞台と地下機構の因果を文章なしで追える | S3構図レビュー（Fable 5目視） |
| F7 | scene終了時に各装置が定位置で揃う | unit: p=1.0スナップ時の座標検証 |
| F8 | 装置同士の重大な貫通・ちらつきなし | スクリーンショット目視＋Zオフセット確認 |
| F9 | 縦横回転で変換進捗を失わない | e2e: viewport回転→progress/phase不変 |
| F10 | console error 0・未処理rejection 0 | e2e: 全フローでconsole/pageerror収集 |
| F11 | 二タップ以内で再プレイ | e2e: finale→choice→tap→再開 |
| F12 | 権利不明アセットなし | ASSET_MANIFEST.md監査 |
| F13 | ASSET_MANIFEST.mdあり | ファイル存在＋内容 |
| F14 | audio unlock（初回gesture）とmute | e2e: AudioContext state確認 |
| F15 | 無操作3〜5秒で非言語ヒント | e2e: 待機→hintShown event |
| F16 | Reduce Motion対応 | unit/e2e: emulateMedia('reduce') |

## Gate B（Fable 5目視、スクリーンショット/動画ベース）

- G1: ロープと舞台装置の動きが同時に見える
- G2: 指を止めても背景だけ動き続けていない
- G3: 森が単なるフェード画像で出ていない
- G4: 袖・背景・前景が層として動いている
- G5: 機構が4歳児に不明瞭なほど複雑でない（部品6種以内）
- G6: 客席側が王妃の劇場（青白金・小さく優雅）を感じさせる

## 性能予算（レビュー時にrenderer.infoで確認）

draw calls ≤140 / triangles ≤300k / particles ≤1000 / cloth 0 / texture ≤2048（通常≤1024）
