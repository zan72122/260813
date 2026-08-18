# このリポジトリで作業するエージェントへ

コードを書く前に、必ず次の4つを読むこと。

1. `docs/DESIGN_CONSTITUTION.md` — 作品の美術的DNAと判断原則
2. `docs/STYLE_LOCK.json` — 全ビジュアル数値の正（コードが直接importする）
3. `docs/CAMERA_AND_TIMING.md` — ショット台本とカット禁止区間
4. `docs/HANDOFF_TO_SOL.md` — 実装状況、モジュール地図、変更禁止箇所

## 絶対規則

- 既存の美術を「改善」「モダナイズ」「洗練」の名目で変更しない。
  色・光・カメラ・材質・間・音の語彙は初代ディレクターが確定済み。
  変更が本当に必要なら、まず DESIGN_CONSTITUTION §13 の原則で正当化し、
  STYLE_LOCK の値として提案すること。
- ゲーム中核をHTMLのボタン/カードで作らない。操作は3D空間内。
- 文章によるチュートリアル・説明テキストを追加しない。
- スコア、タイマー、通貨、星評価、ログインを追加しない。
- 一場面 = 一動詞 + 一対象 + 一指操作 + 一つの明瞭な変化。

## 検証

- `npm run typecheck && npm test && npm run build`
- devサーバーを起動して `node tools/playtest.mjs`（実ジェスチャーE2E）
- 見た目を変えたら `npm run shots` でゴールデンを再生成し、
  変更前後を**実際に目で**比較する（tests/visual/golden/）
