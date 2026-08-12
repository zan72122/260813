# PERFORMANCE_BUDGET — 性能予算

対象GPU想定: iPhone 11〜/iPad (A12〜)。WebGL2で完全成立。WebGPU対応は不要。

| 項目 | 予算 |
|------|------|
| devicePixelRatio | 上限1.75(phone) / 1.5(tablet相当巨大canvas)。adaptive qualityで1.0まで降格可 |
| draw calls | 通常時 ≤ 90、climb演出中 ≤ 110 |
| 可視三角形 | ≤ 250k |
| テクスチャ | 全て手続き生成、1枚 ≤ 1024px、合計VRAM ≤ 64MB |
| ライト | directional 1 + ambient/hemisphere 1。動的shadow map禁止（blob/焼き込み風で代替） |
| 透明オブジェクト | 同一ピクセル重なり ≤ 3層（蒸気+ghost+UI程度） |
| パーティクル | 蒸気 ≤ 120 sprite、火花 ≤ 40。volumetric禁止 |
| ケーブル | spline（TubeGeometry低分割 or LineSegments2相当の自前実装）。物理なし |
| 荷揺れ | 解析的振り子のみ。rigid-body禁止 |
| postprocessing | 禁止（emissiveはmaterialで表現） |
| geometry | 格子・リベットはInstancedMesh。静的部はgeometry merge |
| ループ | rAF 1本。hidden時停止。update/renderで毎フレームのGC allocを避ける |
| リーク | replay20回で scene.children数・listener数・timer数・JSヒープが増加傾向なし |
| 起動 | 初回表示（title可視）まで 3G相当でも < 5s、通常 < 3s。バンドル(gzip) < 900KB 目標 |

## adaptive quality

frame time移動平均 > 24ms が3秒続いたら1段降格（high→mid→low）: DPR、パーティクル数、遠景詳細を削る。復帰昇格はしない（ちらつき防止）。`?test=1` では固定mid。

## 計測フック

`renderer.getStats()` が drawCalls / triangles / fps を返し、`window.__game.stats()` から取得可能。QUALITY_REPORTにはこの実測値を記載する。
