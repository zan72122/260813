# Fableによるレビュー取捨選択（S7必須修正の確定）

## 必須修正へ昇格
| ID | 理由 |
|---|---|
| R1-05 hideFoodDirect本番露出 | debug API露出契約の明示違反。1行修正 |
| R1-01 Gait.walkTo Promise上書き | 既知jumpTo("seek")スタールの根本原因。正しさ |
| R1-02 CameraRig.goTo 同型欠陥 | 同一パターンの低コスト修正。潜在バグ予防 |
| R1-04 renderer.info未配線 | QA_REPORTのdraw calls実測は受け入れ条件。配線して実測値を記録 |
| R1-03 screenshotReadyスタブ | DebugApi契約どおりカメラ遷移/tween静止を反映(簡易実装で可) |
| R2-01 ドラッグゴーストが変化点を隠す | 仕様「指で変化点を隠さない」の明示違反 |
| R2-02 ヒントが対象と非連動 | 仕様「対象の微振動・局所光・飼育員指差し」の明示違反。world.highlightSpot/keeperPointAtは実装済みなので配線 |
| peel-banana構図(Fableゲート+FAILURE_LEDGER) | 看板行動が見えない。振付側(接近方位)で解決 |
| probe-gap山場(同上) | 鼻が隙間に入った状態が画面で確認できること |
| R2-03 reach-pipe寄りすぎ | 行動識別性。カメラ距離の微調整のみ |

## 見送り（理由）
- R1-06 getStateが隠し場所を公開: debug用JSONであり4歳児のプレイ体験に影響なし。仕様の「状態をJSONで取得」要件どおり
- R2-04 seek中の飼育員/カート写り込み: minor。構図の一時的問題で因果理解を阻害しない
- R2-05 砂・樹皮の質感向上: 望ましいが発散リスク。現状でも受け入れ基準は満たす
- R1 minor/infoの残り(テスト追加提案等): 過剰実装を避ける。QA_REPORTに既知事項として記載済み
