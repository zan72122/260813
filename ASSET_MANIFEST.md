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

## 追記ルール

- Worker B (rendering-audio, `src/render/**` `src/vfx/**` `src/audio/**` `public/generated/**`):
  新規に生成したプロシージャルアセット（テクスチャ生成関数・音声シンセ定義など）をこの節に追記する。
- Worker C (mobile-qa, `tests/**` `scripts/**`):
  アセットを生成するスクリプトを追加した場合、その場所と実行方法をこの節に追記する。
- 外部から取得した画像・3D・音源ファイルを追加することは禁止（MASTER_SPEC 非目標 / ACCEPTANCE A9）。
