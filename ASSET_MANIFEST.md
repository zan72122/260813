# ASSET_MANIFEST

このプロジェクトは外部アセット（画像・3Dモデル・音源・フォント・CDNリソース）を
一切使用しない。すべてのビジュアル・オーディオはコードによる手続き生成である
（MASTER_SPEC.md の技術方針・非目標を参照）。

## 現状（Wave 1 時点）

- ジオメトリ: Three.js のプリミティブ（`PlaneGeometry`, `BoxGeometry` 等）をコードで生成。
- テクスチャ: `src/app/sky.ts` の空グラデーションのように `<canvas>` 2D 描画で手続き生成。
- 音源: 未実装（Wave 1 は無音の `AudioDirector` スタブ `src/app/audioStub.ts`）。
  実装時も Web Audio API による手続き生成のみを用い、外部音源ファイルは使用しない。
- フォント: 使用しない（システムフォント／絵アイコンのみ、`index.html` に外部フォント読み込みなし）。
- ネットワーク越しの CDN 資産: なし。`vite.config.ts` はローカルバンドルのみを出力する。

## Worker B (rendering-audio) 追記 — Wave 2

`public/generated/` への事前生成ファイルは無し。全アセットは実行時にコード生成する
（Canvas 2D / WebGL シェーダ / Web Audio）。生成元は以下:

### レンダリング (`src/render/**`)

- `src/render/textures.ts`
  - `createStoneTexture(tier)`: Canvas 2D 手続き生成の温かい灰白石材テクスチャ（color + roughness map）。
    ぼかしブロックの斑・細かいスペックル・目地線。サイズは QualityTier で 256/512/1024px。
  - `createBrassDetailTextures(tier)`: 真鍮 + 緑青のディテール。ソベルフィルタで高さフィールドから
    法線マップを合成し、color/roughness map も同一の高さフィールドから生成（macro カメラ耐性の凹凸）。
  - `createEnvSkyCanvas()`: PMREM 環境マップ用の 64x64 グラデーション空キャンバス（朝の低い太陽のハイライト付き）。
- `src/render/envmap.ts`: `THREE.PMREMGenerator` で上記グラデーションから環境マップを畳み込み生成（HDRIファイル不使用）。
- `src/render/materials.ts`: hedge/stone/gold/brass の Hero Material セットを上記テクスチャ+パレット値から構築。
  `makeWetStone(mesh, wetness)` で濡れ石表現（roughness低下・暗色化）。
- `src/render/lighting.ts`: 影を落とす光源1つ（朝の低い暖色 DirectionalLight）+ HemisphereLight のみの朝の光リグ。
- `src/render/index.ts`: `applyHeroMaterials(scene, quality, renderer?)` — 名前付きメッシュを走査して
  上記マテリアルへ差し替える（`valve-head`/`wrench`/`sun`/`statue`/`hedge`/`stone`/`fountain-*-rim` 等）。

### VFX (`src/vfx/**`) — すべて偽物理（fluid sim 不使用）

- `src/vfx/waterJet.ts`: `createWaterJet('fan'|'ring'|'crown')`。テーパー付きシリンダー本体
  （Canvas ではなく GLSL シェーダで泡沫グラデーション/フレネル）+ ドロップレット粒子のステージ成長噴流。
- `src/vfx/tubeGeometry.ts` + `src/vfx/pipeFlow.ts`: `createPipeFlow(curve)`。Frenet フレームから
  手動生成した「カットアウェイ」円弧チューブ（配管外殻は開口部あり）+ 内部の水塊は GLSL シェーダで
  `uProgress` に沿って光る帯を移動させる（ジオメトリの再構築なし）。
- `src/vfx/basinWater.ts`: `createBasinWater()`。GLSL シェーダの安価な水面（法線リップル + 空色フェイク反射）。
- `src/vfx/rainbow.ts`: `createFinaleRainbow()`。GLSL シェーダで HSV 風グラデーションを描く極薄虹アーク
  （不透明度は常に低く、点滅なし）。
- `src/vfx/droplets.ts` + `src/vfx/particlePool.ts`: 全 VFX 共有のドロップレット/ミスト粒子プール。
  `getDropletSprite()` が唯一の粒子スプライトを Canvas 2D の放射グラデーションで生成。
  `globalParticleBudget`（上限 1500）を全ジェット/配管が共有クレームする。

### オーディオ (`src/audio/**`) — 100% Web Audio 合成、外部音源ファイル不使用

- `src/audio/dsp.ts`: 共通 DSP ヘルパー。`createNoiseBuffer()` は xorshift32 決定的ノイズを
  ループ境界でクロスフェードした `AudioBuffer` を生成（シームレスループ用）。
- `src/audio/loopVoice.ts`: `NoiseLoopVoice` — 強度駆動の連続音（ノイズソース + フィルタチェーン）共通基盤。
- `src/audio/cues/*.ts`: 各キューの合成定義（`whistle` 明るい一過性チャープ / `valveCreak` LFO変調ノイズ /
  `pipeRush` 乱流フィルタノイズ / `splash` 噴水種別ごとの二層ノイズ音色 / `ambient` 静かな空気音+ランダム小鳥 /
  `finale` デチューン倍音の暖かいコード / `uiTapAndResist` 柔らかい一過性クリック/バンプ音）。
- `src/audio/index.ts`: `createAudioDirector()` — 上記を統合し `AudioDirector` 契約を実装
  （DynamicsCompressor + master/mute gain、`unlock()` で AudioContext resume）。

### Wave 3 統合（Integrator）

- 一時自己検証ファイル `demo-vfx.html` + `src/vfx/demo/main.ts`（上記すべてを1画面に
  まとめたレビュー用テストシーン）は Wave 3 統合時にレビュー後削除済み。
  実体は `src/main.ts` から `applyHeroMaterials` / VFXファクトリ / `createAudioDirector`
  を実シーンへ直接配線した `src/app/presentationWiring.ts` に引き継がれている。

### Worker B (rendering-audio) 追記 — Wave 5（Gate B 水表現の緊急修正）

Gate B で「水が水に見えない」判定（fountain-reveal 実質白飛び、finale が不透明な白い綿雲、
pipe-run が単色べた塗り）を受けての修正。すべて procedural のまま:

- `src/vfx/waterJet.ts`: 噴流ジオメトリを「テーパー付き縦シリンダー」から
  **放物線アーク**（`y = vy*t - 1/2*g*t²` の投射運動）へ全面書き換え。各噴流内の全ストリームを
  `three/examples/jsm/utils/BufferGeometryUtils.js` の `mergeGeometries` で 1 メッシュ・1 シェーダに
  統合（`aThreshold` 頂点属性で各ストリーム個別の成長しきい値を焼き込み、`uIntensity` 1個の
  uniform で全ストリームの「到達長」を GPU 側だけで駆動——JS 側の per-strand ループ更新が不要に）。
  ブレンドを Additive → Normal（不透明度上限も大幅に低下）へ変更し、泡沫は各ストリーム末端の
  ごく一部にのみ限定。着水点にのみ小さな低不透明度パーティクル（`landingFoam`/`mist`）を配置。
  さらに **near-camera fade**（`vViewDist` を頂点シェーダで算出しフラグメントで減衰）を追加——
  シネマティックカメラのブレンド遷移中に一瞬カメラが噴流のごく近く/内側に入り込むケースでも
  白飛びしない防御的措置。
- `src/vfx/tubeGeometry.ts`: 配管カットアウェイの断面フレームを `curve.computeFrenetFrames`
  （ねじれが不定）から **world-up 基準の Gram-Schmidt フレーム**へ変更——開口部が配管の全長で
  常に「上」を向くようにし、外部追従カメラからの見え方を安定させた。
- `src/vfx/pipeFlow.ts`: 水塊シェーダを「一定の帯」から **先端が最も明るく、後方は指数減衰する
  水濡れ痕**に再設計（フラットな一定不透明度の帯が「単色べた塗り」に見えていた原因）。
  水ジオメトリ自体も全周チューブから、配管開口部の反対側（底）に位置する部分アークへ変更——
  外部視点から「開口部越しに反対側の内壁がたまたま見える角度」に依存せず常に視認できるように。
- `src/render/index.ts`: **`renderer.toneMapping = THREE.ACESFilmicToneMapping` をここで初めて設定**
  （元々アプリのどこにも tone mapping 設定が無く `NoToneMapping` のままだった）。金属マテリアル
  （自分の gold/brass だけでなく、他 worker のシーン内の未命名メッシュも含む）が強い directional
  light のスペキュラで `#fff` に張り付くのを防ぐシーン全体のセーフティネット。VFX シェーダ側は
  すべて `material.toneMapped = false` 済みなので、このカーブの影響を受けず意図した色を保つ。
- `src/render/lighting.ts`: 上記と合わせ、太陽光強度を抑制（金属スペキュラのピーク放射を下げる）
  しつつ hemisphere 環境光をわずかに増強して見た目の明るさを維持。
- `src/render/textures.ts` / `materials.ts`: 新規 `createHedgeTexture()`（生垣の緑に柔らかい斑＋
  細粒スペックル）、`createGoldDetailTexture()`（金箔の控えめな法線バンプ——環境反射が単調な
  鏡面にならないように）。石材テクスチャの repeat とコントラストも実スケールでの視認性のため微調整。
- `src/vfx/droplets.ts`: 共有ドロップレット/ミスト粒子シェーダにも同種の near-camera fade +
  ポイントサイズの上限クランプを追加。

一時検証ハーネス（`demo-vfx.html` + `src/vfx/demo/main.ts`、実カメラアンカー座標を
`src/camera`/`src/scenes/anchors.ts` から読み込んで fountain-reveal/pipe-run/finale の実際の
カメラポーズを再現）はレビュー後に削除済み。最終確認は実アプリを `tests/e2e/full-loop.spec.ts`
で駆動し、`screenshots/390x844/{fountain-reveal,finale,pipe-run}.png` を目視で確認して行った。

## 追記ルール

- Worker B (rendering-audio, `src/render/**` `src/vfx/**` `src/audio/**` `public/generated/**`):
  新規に生成したプロシージャルアセット（テクスチャ生成関数・音声シンセ定義など）をこの節に追記する。
- Worker C (mobile-qa, `tests/**` `scripts/**`):
  アセットを生成するスクリプトを追加した場合、その場所と実行方法をこの節に追記する。
- 外部から取得した画像・3D・音源ファイルを追加することは禁止（MASTER_SPEC 非目標 / ACCEPTANCE A9）。

## Wave 2 追記（Worker C: mobile-qa）

- アイコン（`src/ui/icons.ts`）: 設定クラスター（mute / dim-light）とリプレイ選択画面
  （同じ噴水 / 庭から再開 / 自由バルブ）の全アイコンを `document.createElementNS`
  による SVG 手続き生成で実装。画像・絵文字・外部フォント一切不使用。
- スクリーンショット/状態キャプチャヘルパー: `scripts/screenshotMatrix.ts`
  （ACCEPTANCE.md のビューポート4種・主要状態5種の定数 + `captureState(page, viewportLabel, state)`）。
  `tests/e2e/*.spec.ts` から import して使用し、`npm run test:e2e` 実行時に
  `screenshots/<viewport>/<state>.png` を生成する（外部ツール不要、Playwright 経由の自動生成）。
