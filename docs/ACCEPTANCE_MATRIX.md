# ACCEPTANCE MATRIX

検証列: U=unit, I=integration, E=E2E, S=screenshot目視, M=手動/Fable確認
状態: ✅=合格 / ⚠=条件付き合格(備考参照) / ✗=不合格
最終判定: 2026-08-13 Fable。根拠: docs/QA_REPORT.md, ops/reports/S7.md, artifacts/screenshots/

| # | 受け入れ条件 | 検証 | 状態 |
|---|---|---|---|
| P1 | 起動しタイトルが表示される | E,S | ✅ 01-title.png, smoke.spec 4サイズ |
| P2 | 初回ガイドで3か所へ餌を隠せる | I,E | ✅ full-loop.spec(実ドラッグ1+direct2) |
| P3 | ゲートを開けてゾウが登場する | E,S | ✅ 03-gate-elephant.png |
| P4 | 5つの固有行動が実装され、それぞれ完了イベントを出す | U,I,E | ✅ behaviors.spec 5種 |
| P5 | probe-gap: 鼻の差し込み→つまみ→引き抜きが見える | S,M | ⚠ 実動作は実装済み・E2E完了確認済み。静止スクショでは壁ブロックの遮蔽で挿入瞬間が見えにくい(QA_REPORT§9.4) |
| P6 | dig-sand: 砂が退いて餌が現れる | S,M | ✅ 04-dig-sand.png |
| P7 | reach-pipe: 内部が見える表現がある | S,M | ✅ 05-reach-pipe.png(xray) |
| P8 | peel-banana: 繊維が複数回剥がれ内側が現れる | S,M | ✅ 06-peel-banana.png(S7で構図改善) |
| P9 | break-branch: しなり→折れ→採食が見える | S,M | ✅ 07-break-branch.png |
| P10 | アルバムに観た行動が絵で並ぶ／端末に蓄積 | U,E,S | ✅ 09-album.png, album.test |
| P11 | 2タップ以内で再プレイ、初回後に自由遊び解放 | U,E | ✅ replay-freeplay.spec |
| P12 | seed固定で探索順・餌提案が再現 | U | ✅ session.test + replay-freeplay.spec |
| P13 | 保存(設定・進捗)がリロード後も維持 | U,E | ✅ persistence.spec |
| P14 | PWA: manifest+SW、オフライン再起動 | E,M | ✅ offline-pwa.spec(preview環境) |
| P15 | 広告/analytics/ログイン/実行時外部通信なし | M | ✅ R1レビューで外部通信ゼロ確認 |
| UX1 | 文章なしで進行可能 | S,M | ✅ 絵アイコン+動線誘導(補助ひらがな併記) |
| UX2 | 無操作3–5秒で非言語ヒント | U,E | ✅ hints.test + S7で対象連動(highlightSpot)配線 |
| UX3 | 主要タッチ対象64px以上 | E,S | ✅ accessibility.spec実測(92/80px等) |
| UX4 | 制限時間・罰・ゲームオーバーなし | M | ✅ 実装なしを確認 |
| UX5 | 縦横両方で構図が破綻しない | E,S | ✅ 4 projects + 10-landscape-overview.png |
| UX6 | 回転で状態が初期化されない | U,E | ✅ orientation.spec |
| UX7 | 行動の因果カットが繋がっている | S,M | ✅ 行動専用カメラ+Reveal(S3c/S7) |
| A1 | 音/環境音/動き/光/品質/リセット設定 | E,S | ✅ dev-s5-settings.png + settings実装 |
| A2 | prefers-reduced-motion尊重 | U,E | ✅ accessibility.spec(emulateMedia) |
| A3 | safe-area尊重 / 高速点滅なし | S,M | ✅ env(safe-area-inset)+点滅なし確認 |
| T1 | lint/typecheck/unit/integration/build/E2E 全成功 | 全 | ✅ Fable再実行で確認(check + qa:e2e 18/18) |
| T2 | E2E中コンソールエラー0 | E | ✅ 全specでassert |
| T3 | 4サイズスクショ | E | ✅ playwright 4 projects |
| T4 | 主要10場面スクショ | E,S | ✅ 01〜10 + dev-s7-hint.png |
| T5 | QAモード動作 | E | ✅ 全E2Eが?qa=1経由 |
| T6 | 非公式・着想元の情報画面 | S,M | ✅ infoPanel(非公式表記) |

## 条件付き合格・未検証事項
- P5: 静止画のみの制約。実動作/E2Eでは完了する(3案試行の記録: ops/reports/S7.md)
- 実機iPhone/iPad Safariでの実FPS・音出し・振動・タッチ精度は本環境(ヘッドレスChromium/SwiftShader)では検証不能。QA_REPORT§に明記
