# ACCEPTANCE — 受入基準

## 実行必須コマンド（結果をトランスクリプトへ出す）

```
npm ci        # または npm install
npm run typecheck
npm test
npm run build
npm run test:e2e
```

## スクリーンショット必須マトリクス

寸法（CSS px）: 390×844 / 844×390 / 820×1180 / 1180×820 — 各寸法最低1枚。
さらに主要状態を保存（少なくとも1寸法で全状態、他寸法は代表状態）:

1. 静かな庭園（garden-idle）
2. バルブ操作（valve-turn, レンチと指誘導が見える）
3. 配管 cutaway（pipe-run, 水塊が見える）
4. 噴水 Reveal（fountain-reveal）
5. Finale（三噴水同時）

保存先: `screenshots/` （e2e が生成）。

## 必須合格条件

| # | 条件 | 検証方法 |
|---|---|---|
| A1 | 起動から Finale まで一周できる | e2e 自動一周 + スクショ |
| A2 | 時計回りの円運動が認識される | e2e: 合成ポインタ円軌道で openness 増加 |
| A3 | 指を止めるとバルブと水圧変化も止まる | e2e: 軌道停止後 openness/水が不変 |
| A4 | 笛→バルブ→配管→噴水の因果を文章なしで追える | Gate B スクショ + 操作記録の目視審査 |
| A5 | 操作点が指で完全に隠れない | valve macro 構図（レンチ柄が外周）スクショ審査 |
| A6 | 縦横回転で状態（phase, openness）が消えない | e2e: 回転前後の状態比較 |
| A7 | console error 0 / 未処理 rejection 0 | e2e で console 収集 |
| A8 | 完了後二タップ以内で再プレイ | e2e: replay-choice → 再開 |
| A9 | 外部権利不明アセット不使用 | ASSET_MANIFEST.md 監査（全て手続き生成であること） |
| A10 | ASSET_MANIFEST.md が存在する | ファイル確認 |

最終的に Fable 5 が各項目へ PASS / FAIL / NOT VERIFIED を付す。証拠のない PASS は付けない。

## 品質予算の確認

draw calls ≤~120 / triangles ≤~250k / particles ≤1500 は renderer.info を e2e か
デバッグ出力で取得して確認する（目標値。多少の超過は画質との兼ね合いで判断）。
