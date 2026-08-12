# CAMERA_STORYBOARD — カメラ絵コンテ

原則: 子どもに自由カメラを渡さない。全カメラは CinematicBeat のレール移動。
**原因と結果が成立する瞬間（笛→太陽印の反応、回す→水圧、水到達→噴出）ではカットしない。**
ビート間は連続移動、やむを得ない場合のみ知覚的に切れない <0.5s の移行を許可。

## ビート一覧

| id | phase | 構図 | duration | 備考 |
|---|---|---|---|---|
| `beat-establish` | garden-idle | 庭園の 3/4 俯瞰 establish。生垣の幾何学、石の小道、止まった噴水、進む金の太陽印 | 4–6s | ループの起点。朝の斜光 |
| `beat-whistle-cue` | whistle-cue | やや降下し、**画面下手前に笛、奥に王の進行が同時に見える**構図 | 待機 | 笛が揺れて誘目。3–5s 無操作で笛が光る |
| `beat-valve-approach` | valve-approach | 笛音と同時に、庭園を視界に残したまま植え込み脇の機構部へ**連続ドリー**で寄る | 2–2.5s | 途中カット禁止。庭園→機構部の空間連続性を保つ |
| `beat-valve-macro` | valve-turn | バルブ頭＋レンチの macro。真鍮と緑青が読める距離。弱い円形の光の動きで時計回りを示唆 | 操作依存 | 操作点が指で隠れないよう、バルブは画面中央よりやや上・レンチ柄は外周 |
| `beat-pipe-cutaway` | pipe-run | openness=1.0 でカメラが地面へ沈み込み、配管 cutaway へ。光る水塊を並走で追う | 2.5–3.5s | 縦画面: 地上→地下→地上の垂直移動を強調。横画面: 水平に長い配管で王の進行方向を意識 |
| `beat-fountain-reveal` | fountain-reveal | 水塊到達と同時に水面近くから**見上げ**。一本→扇/環/冠→フル形状 | 3–4s | 噴水ごとに角度と動きを変える（MASTER_SPEC 参照）。成功状態を最低1.5秒保持 |
| `beat-wide-reveal` | fountain-reveal末尾 | 引いて庭園 wide。動いた噴水と王の行列の歓喜（太陽印が輝き小さく跳ねる）を同時に見せる | 2–3s | 次の whistle-cue へ連続で繋ぐ |
| `beat-finale` | finale | 最も引いた wide。三噴水同時。ゆっくり横 or 縦のクレーン移動。淡い虹可 | 6–8s | 高速点滅禁止 |
| `beat-replay` | replay-choice | finale の wide のまま被写界深度を軽く落とし、絵の三択を表示 | 待機 | カメラは止めてよい |

## 縦横対応

- 縦（390×844 / 820×1180）: 上下移動主体。establish は縦構図で奥行きを圧縮、cutaway は真下へ潜る
- 横（844×390 / 1180×820）: 王の進行方向と噴水の並びを横に広く。cutaway は横走り
- 回転時: 現在の beat・GamePhase・openness を維持し、カメラは同 beat の縦/横バリアントへ 0.3s で補間

## 実装契約

各 beat は `CinematicBeat`（id, phase, portrait/landscape のカメラ姿勢列, duration, easing）として
データ定義し、カメラシステムはデータ駆動で再生する。ハードコードした一回性のカメラ移動を書かない。
