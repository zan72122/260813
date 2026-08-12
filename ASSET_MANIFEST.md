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

### 自己検証（一時ファイル・Integrator が削除可）

- ルート `demo-vfx.html` + `src/vfx/demo/main.ts`: 上記すべてを1画面にまとめたテストシーン。
  `npx vite` 起動後 `/demo-vfx.html` にアクセスして確認。screenshots/vfx-demo-*.png に記録。

## 追記ルール

- Worker B (rendering-audio, `src/render/**` `src/vfx/**` `src/audio/**` `public/generated/**`):
  新規に生成したプロシージャルアセット（テクスチャ生成関数・音声シンセ定義など）をこの節に追記する。
- Worker C (mobile-qa, `tests/**` `scripts/**`):
  アセットを生成するスクリプトを追加した場合、その場所と実行方法をこの節に追記する。
- 外部から取得した画像・3D・音源ファイルを追加することは禁止（MASTER_SPEC 非目標 / ACCEPTANCE A9）。
