# HISTORICAL_TRUTH — 王妃の劇場（Théâtre de la Reine, Petit Trianon）

調査日: 2026-08-12
調査方法: ネットワークプロキシにより chateauversailles.fr / wikipedia.org への直接アクセスは遮断。
WebSearch経由で公式サイト（en.chateauversailles.fr）およびWikipedia等のスニペットを取得して確認した。
本ドキュメントが本プロジェクトにおける史実の唯一の典拠である。実装・演出は必ずここを参照する。

## Verified facts（複数資料で確認済み）

| # | 事実 | 出典 |
|---|------|------|
| V1 | 王妃の劇場は1780年春に完成し、同年6月1日に落成した。 | chateauversailles.fr, Wikipedia |
| V2 | 客席は青・白・金を基調とする装飾で、約250席の小さく優雅な劇場である。 | chateauversailles.fr |
| V3 | 舞台は八層構造（舞台下二階＋舞台上部（簀の子）二階を含む）で、機構師 Pierre Boullet が整備した。 | chateauversailles.fr |
| V4 | 原型の舞台機構は稼働可能な状態へ修復されており、フランスで唯一、18世紀の機構が無傷で機能する劇場である。 | chateauversailles.fr, Apollo Magazine |
| V5 | 残存する舞台装置には、19世紀の Cicéri 工房による「田舎風室内」「森」の完全な二景、および「広場」「豪華な部屋（rich salon）」の断片が含まれる。1754年の「ミネルヴァの神殿」装置（Slodtz兄弟、フォンテーヌブロー由来）も現存する。 | chateauversailles.fr |
| V6 | 滑車と彩色パネル（rolling panels）を用い、観客の眼前で景色を交換する実演が行われている。滑車とカウンターウェイトによる迅速な景色交換の仕組みを備える。 | chateauversailles.fr, The Middle Land |
| V7 | マリー・アントワネットは1780〜1785年にこの劇場で友人らと喜劇を上演した。 | chateauversailles.fr |

## Plausible abstraction（資料で細部未確認 → ゲーム上の可視化モデル）

以下は18世紀フランス劇場の一般的機構（chariot-and-pole 方式等）から构成した**ゲーム上の抽象モデル**であり、
王妃の劇場の実際の機構配置・本数・寸法を主張しない。

- P1: 舞台袖（wings）が舞台下のカート（chariot）に載り、溝に沿って水平移動する表現。
- P2: 一本の太い麻ロープ＋滑車＋木製巻上ドラム＋カウンターウェイトという簡略化された駆動系。
  実物のロープ経路・滑車数・ドラム配置は未確認。幼児が因果を追える最小構成に整理した。
- P3: ロープロック（ブレーキ）の形状・位置。
- P4: 背景（backdrop）が巻き取り式または昇降式で交換される具体的方式。
- P5: 一本のロープで袖・背景・照明転換まで同期する統合駆動。実物は複数系統だが、ゲームでは一系統に束ねる。

## Dramatized game cue（史実と断定しない演出）

- D1: 開演前の「三回のノック」。フランス演劇の伝統的な les trois coups に着想を得たゲーム上の合図であり、
  王妃の劇場固有の慣行としては未確認。
- D2: footlights（蝋燭色のフットライト）の点灯演出、カーテンコール、拍手音。
- D3: 「豪華な部屋→森→田舎風室内」という転換順序はゲームの脚本であり、実際の上演記録ではない。
  ただし三景とも残存装置（V5）に対応する題材を選んだ。

## Not verified（未確認事項 — 捏造禁止）

- 実際のロープの太さ・材質詳細、ドラム直径、滑車個数。
- 舞台下作業員の人数・配置。
- 三回のノックがこの劇場で行われていたか。
- 各残存装置の正確な色彩・構図（権利不明画像を取り込まないため、本作の装置絵はすべて独自の手続き生成）。

## Sources

- [The Queen's Theatre | Château de Versailles](https://en.chateauversailles.fr/discover/estate/estate-trianon/queen-theatre)（検索スニペット経由）
- [Théâtre de la Reine — Wikipedia](https://en.wikipedia.org/wiki/Th%C3%A9%C3%A2tre_de_la_Reine)（検索スニペット経由）
- [Drama queen: a peek inside Marie Antoinette's private theatre — Apollo Magazine](https://apollo-magazine.com/marie-antoinette-versailles-theatre-restored/)
- [The Queen's Theatre, in Versailles — The Middle Land](https://themiddleland.com/the-queens-theatre-in-versailles/)
