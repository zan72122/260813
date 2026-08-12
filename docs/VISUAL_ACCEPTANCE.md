# VISUAL_ACCEPTANCE — 視覚受入基準

方向: **1887〜1888年の建設現場の精密な博物館模型 + 上質な玩具**。blind visual reviewerがスクリーンショットだけで以下に全てYesと答えられること。

## Hero Materials(この5つが画面の主役)

1. 乾いた砂 — 暖かい黄土色(#c9a45cベース)、マットで粒状感のあるroughness高
2. 巨大鉄骨 — 暗い茶褐色の錬鉄(#4a3428系)、リベット列、格子trusswork
3. 油圧ピストン — 黒鉄シリンダ+磨かれた真鍮(#b08d3f)+油の艶(clearcoat的ハイライト)
4. 木製砂箱 — 節のある足場木材(#8a6a45)、鉄帯補強、cutawayで内部の砂が見える
5. 恒久楔 — 鍛造鉄の楔、打面のつぶれ表現

## 禁止

generic frontend cards / neon gradient / 数字dashboard / 画面端の抽象スライダーUI(操作物は必ずscene内の3Dオブジェクト) / 過剰confetti / フラットなsolid色のみのマテリアル。

## ショット別基準

### establish(起動3秒以内)
- 四本の巨大な脚と、まだ隙間のある第一層大桁が一画面に入る
- 各脚の下に砂箱、脇に油圧ジャッキが視認できる
- 成人作業員(シルエット規模比較)が最低2体、足場・遠景(控えめなパリの地平・空)がある
- 脚が「圧倒的に大きい」— 作業員の30倍超の高さに見える

### activeLeg / sandboxCutaway
- どの脚を扱っているかが照明・カメラ・target ringで一目で分かる
- 砂箱はcutawayで内部の砂面が見える。gateハンドルが大きく、木+鉄で「引ける」形をしている

### sand flow(最重要カット1)
- 流れる砂stream、下がる砂面、下がる脚、alignment pinとtarget ringが同一フレーム
- 砂の流量がgate開度に見て取れる

### jack close-up(最重要カット2)
- pump handle、伸びるピストン、上がる脚が同一フレーム
- handleは両手で握る大レバーの形状

### magnifier
- 真鍮の機械式ルーペ枠。中身は同じ3D接合部の拡大(照明・材質が連続)で、抽象図形UIに見えない
- pinとringのgapが太い視覚差で分かる

### wedge
- 大きな溝と楔。挿入方向が形状で分かる。hammer一打で衝撃+lock表現(楔が沈み、鉄帯が締まる等)

### topReveal(最終報酬)
- 真上寄りから四本脚+第一層の巨大な正方形
- 四接合点が順に低く発光→第一層全体がわずかに沈み→pullbackで一体化した塔下部
- confettiではなく重量感(塵の小さな舞い、構造の軋み表現は可)

### portrait / landscape
- どちらも操作ハンドルが片手の親指圏内、情報過密なし、safe area侵食なし

## 照明・空気

昼の柔らかい日光(暖色key + 空色ambient)。控えめなfog遠景。模型らしい浅いDoFは不要(性能優先)。影はhigh tierのみ単一shadow map。
