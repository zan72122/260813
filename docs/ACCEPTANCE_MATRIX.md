# ACCEPTANCE MATRIX

検証列: U=unit, I=integration, E=E2E, S=screenshot目視, M=手動/Fable確認

| # | 受け入れ条件 | 検証 | 状態 |
|---|---|---|---|
| P1 | 起動しタイトルが表示される | E,S | |
| P2 | 初回ガイドで3か所へ餌を隠せる | I,E | |
| P3 | ゲートを開けてゾウが登場する | E,S | |
| P4 | 5つの固有行動が実装され、それぞれ完了イベントを出す | U,I,E | |
| P5 | probe-gap: 鼻の差し込み→つまみ→引き抜きが見える | S,M | |
| P6 | dig-sand: 砂が退いて餌が現れる | S,M | |
| P7 | reach-pipe: 内部が見える表現がある | S,M | |
| P8 | peel-banana: 繊維が複数回剥がれ内側が現れる | S,M | |
| P9 | break-branch: しなり→折れ→採食が見える | S,M | |
| P10 | アルバムに観た行動が絵で並ぶ／端末に蓄積 | U,E,S | |
| P11 | 2タップ以内で再プレイ、初回後に自由遊び解放 | U,E | |
| P12 | seed固定で探索順・餌提案が再現 | U | |
| P13 | 保存(設定・進捗)がリロード後も維持 | U,E | |
| P14 | PWA: manifest+SW、オフライン再起動（previewで検証） | E,M | |
| P15 | 広告/analytics/ログイン/実行時外部通信なし | M | |
| UX1 | 文章なしで進行可能（絵・動き・音の誘導） | S,M | |
| UX2 | 無操作3–5秒で非言語ヒント | U,E | |
| UX3 | 主要タッチ対象64px以上 | E(計測),S | |
| UX4 | 制限時間・罰・ゲームオーバーなし | M | |
| UX5 | 縦横両方で構図が破綻しない | E,S | |
| UX6 | 回転で状態が初期化されない | U,E | |
| UX7 | 行動の因果カットが繋がっている（カメラ鎖） | S,M | |
| A1 | 音量オン/オフ・環境音調整・動き/光を弱く・品質設定・リセット | E,S | |
| A2 | prefers-reduced-motion尊重 | U,E | |
| A3 | safe-area尊重 / 高速点滅なし | S,M | |
| T1 | lint / typecheck / unit / integration / build / E2E 全成功 | 全 | |
| T2 | E2E中コンソールエラー0 | E | |
| T3 | 4サイズ(390x844/844x390/820x1180/1180x820)スクショ | E | |
| T4 | 主要10場面スクショが artifacts/screenshots/ にある | E,S | |
| T5 | QAモード(?qa=1&quality=low&timeScale=8&seed=42)動作 | E | |
| T6 | 非公式・着想元の情報画面 | S,M | |
