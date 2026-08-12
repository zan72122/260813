# PERFORMANCE_BUDGET

基準機: iPhone 12 / mobile Safari。目標60fps、許容下限40fps(自動降格発動)。

## Hard budgets(レビューで計測・違反はブロッカー)

| 項目 | 予算 |
|---|---|
| draw calls | ≤ 120(establish/topRevealの最悪カット含む) |
| triangles | ≤ 300k |
| sand instanced particles | ≤ 400(constants.PARTICLE_BUDGET、low tierでは≤150) |
| texture | 全て手続き生成、各≤1024²、合計VRAM ≤ 64MB |
| DPR cap | high 1.75 / medium 1.5 / low 1.25 |
| JS bundle (gz) | ≤ 900KB(Three.js込み) |
| 初回表示(establish) | 起動から3秒以内(ローカル) |
| replayリーク | 20回replayで renderer.info.memory.geometries / textures が初回値へ復帰 |

## 実装規則

- 砂: InstancedMesh粒(≤400) + scrolling-UV stream mesh(1 draw) + heightfield砂面(≤40×40 grid) + fill-level uniform方式のcutaway。CPU per-frame attribute更新は粒のみ。
- 実物理・粒状シミュレーション禁止。全てparameter駆動。
- 透明マテリアル最小化(target ring, glow, stream程度)。sorting負荷を避ける。
- 影はhigh tierのみ、単一directional shadow map ≤1024²。
- geometryはmerge/instance徹底。足場・リベットはInstancedMesh。
- hidden時(document.hidden)RAF停止。pause中はrender on demand。
- 品質自動降格: 直近60frameの移動平均frame time > 25msで一段降格(復帰昇格なし)。
- context lost/restoredで全GPU資源再構築。dispose徹底(replay時も)。
- runtime外部fetchゼロ。フォント不使用(pictogramはSVG/canvas手続き生成)。
