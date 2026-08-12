# MASTER_SPEC — 「舞台の下のひみつ―お部屋が森になった！」

対象: 4歳女児。iPhone / iPad の Safari（モバイル優先）。文字を読ませない。
形式: static web app。Vite + TypeScript strict + Three.js。WebGL2 baseline。backend/login/広告/分析/課金なし。

## コア価値（これだけは絶対に守る）

下の暗い機械室で一本のロープを引くと、上の華やかな舞台世界が**自分の指に合わせて**丸ごと変わる。

- ロープの引き量と舞台変化は `StageTransformProgress`（0..1）で**一対一連続対応**。
- 指を止めれば、ロープ・滑車・ドラム・舞台袖・背景・照明が**すべて同時に止まる**。
- 上へ戻せば逆再生する。
- 自動再生ムービー化は不合格。単一画像のクロスフェードも不合格。

## 三つの景（すべて手続き生成の彩色平面装置）

1. **Salon**（豪華な部屋）: 青灰の壁、金の縁飾り、シャンデリア、窓、椅子。
2. **Forest**（森）: 幹と枝葉の袖、奥の木漏れ日背景、前景の岩と低木。
3. **Rustic**（田舎風室内）: 梁天井、暖炉、木のテーブル。※第二変換は 森→田舎風室内 を採用（残存装置V5に対応）。

各景は最低三層: 舞台袖ペア×2〜3（painted flats）、背景（painted plane）、前景props（低poly rigid）。

## GamePhase 進行（一周90〜150秒）

| Phase | 一動詞 | 内容 |
|-------|--------|------|
| boot | — | ロード。プログレスは小さな幕のアニメ。 |
| title | さわる | 一タップで開始＝audio unlock。文字なし（タイトルロゴ画像は装飾）。 |
| establish | 見る | 客席から舞台（Salon）をゆっくり見せる。CinematicBeat。 |
| cue | 見つける | 三回のノック（Dramatized）＋舞台床付近が淡く光る。タップで下降。 |
| descend | 見る | カメラが舞台床下へ降りるbeat。cutaway出現。 |
| unlock | 外す | ロープロックをタップ/短スワイプで解除。「カチン」。 |
| pull1 | 引く | ロープを引くと Salon→Forest。cutaway固定カメラ。 |
| reveal1 | 見る | progress=1で「コトン」。カメラが客席へ戻り森を披露。小鳥・木漏れ日。軽いlateral move。 |
| pull2 | もう一度引く | 同じ文法で Forest→Rustic。cueは短縮。 |
| reveal2 | 見る | 田舎風室内の披露。 |
| finale | 見る | footlights点灯、カーテン（morph/骨）、短い拍手。 |
| choice | えらぶ | 絵による三択: もう一度同じ / 別の景色 / 自由にロープ。二タップ以内で再プレイ。 |
| freePlay | 引く | ロープで現在の景ペアを自由に上げ下げ。終了ボタンでchoiceへ。 |

phase遷移中も因果を隠さない: pull中はカメラほぼ固定。reveal時のみカメラが動く。

## ロープ操作仕様

- pointer events のみ。touch scroll / pinch zoom 抑止。
- ロープゾーン（画面の広い帯）内で下ドラッグ→progress増加。上ドラッグ→減少。
- 斜めドラッグはY成分のみ採用（下方向へ補正）。
- 一回のフルストローク（画面高の約60%）で progress +0.35。手繰り寄せ式に複数ストロークで満了。
- progress > 0.97 で 1.0 へスナップ＋「コトン」。progress < 0.03 で 0.0 へスナップ。
- 指を離した位置で保持。失敗・時間制限・点数なし。
- 無操作3〜5秒で非言語ヒント（光る手がジェスチャーを実演）。ロープは指の少し横に表示され指で隠れない。

## StageTransformProgress → 決定的マッピング

単一のprogress値から純関数で全要素を計算（各要素の個別timer禁止）:
rope travel / pulley回転 / drum回転 / 旧袖の退場 / 新袖の入場 / 背景交換 / 照明ブレンド / 機構音のピッチ。
詳細は docs/STAGE_MECHANISM_ABSTRACTION.md。

## 品質・技術予算

- draw calls ≤140、triangles ≤300k、active particles ≤1000、cloth simulation = 0。
- planar系の高価パスなし。shadow casterは原則1つ（またはフェイク影）。
- texture最大2048、通常1024以下。背景はatlas化を検討。同種propsはinstancing。
- DPR adaptive cap（QualityTier連動）。FPS低下で自動降格。
- console error 0、未処理rejection 0。dispose/listener解放を管理。
- orientation change / resize で progress・phase・ロープ位置・カメラ状態を維持。
- Reduce Motion対応、mute、低品質モード。audioは初回gestureでunlock。

## 受入

docs/ACCEPTANCE.md の全項目。証拠なしのPASS禁止。
