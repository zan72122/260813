# LICENSES

このリポジトリ自体のライセンス方針は [README.md](./README.md) の「ライセンス方針」を参照してください。

以下は `package.json` の **直接依存** のみを列挙したものです(`node_modules` 配下の推移的依存は
列挙しません)。バージョンはこのリポジトリのインストール時点のものです。

## dependencies (ビルド成果物に含まれる)

| パッケージ | バージョン | ライセンス |
|---|---|---|
| [three](https://github.com/mrdoob/three.js) | ^0.170.0 | MIT |
| [vite-plugin-pwa](https://github.com/vite-pwa/vite-plugin-pwa) | ^0.21.0 | MIT |

## devDependencies (開発・ビルド・テストにのみ使用、成果物には含まれない)

| パッケージ | バージョン | ライセンス |
|---|---|---|
| [@eslint/js](https://github.com/eslint/eslint) | ^9.14.0 | MIT |
| [@playwright/test](https://github.com/microsoft/playwright) | ^1.48.0 | Apache-2.0 |
| [@types/node](https://github.com/DefinitelyTyped/DefinitelyTyped) | ^22.19.21 | MIT |
| [@types/three](https://github.com/DefinitelyTyped/DefinitelyTyped) | ^0.170.0 | MIT |
| [@typescript-eslint/eslint-plugin](https://github.com/typescript-eslint/typescript-eslint) | ^8.14.0 | MIT |
| [@typescript-eslint/parser](https://github.com/typescript-eslint/typescript-eslint) | ^8.14.0 | MIT |
| [eslint](https://github.com/eslint/eslint) | ^9.14.0 | MIT |
| [jsdom](https://github.com/jsdom/jsdom) | ^25.0.1 | MIT |
| [typescript](https://github.com/microsoft/TypeScript) | ^5.6.3 | Apache-2.0 |
| [typescript-eslint](https://github.com/typescript-eslint/typescript-eslint) | ^8.14.0 | MIT |
| [vite](https://github.com/vitejs/vite) | ^6.0.0 | MIT |
| [vitest](https://github.com/vitest-dev/vitest) | ^2.1.4 | MIT |

各パッケージの正式なライセンス全文は `node_modules/<パッケージ名>/LICENSE`(インストール後)または
各プロジェクトのリポジトリを参照してください。

## アセット・音について

このプロジェクトは **画像ファイル・音源ファイルを一切同梱していません**。

- 3Dモデル・地形・小道具はすべて `src/scene/` 配下のコードで手続き的に生成しています(Three.js の
  ジオメトリ/マテリアルAPIをコードから直接呼び出す実装で、外部の3Dモデルファイル(glTF等)や
  テクスチャ画像は使用していません)。
- UIアイコン・絵カードはすべて `src/ui/icons.ts` 等の Canvas 2D 描画コード(手描きの図形・パス)で、
  外部の画像アセット・アイコンフォント・Webフォントは使用していません。
- PWAアイコン(`public/icons/*.png`、`public/favicon.svg`)も `scripts/gen-icons.mjs` が
  Node標準の `zlib` のみでPNGエンコーダを自作して生成したオリジナル画像です(外部画像・CDN不使用)。
- 効果音・環境音はすべて `src/audio/` 配下のWebAudio合成コードで、外部の音源ファイル
  (mp3/wav等)や音源ライブラリは一切使用していません。

したがって、本リポジトリのコード生成物(3D表現・UI・音)には、このコードベース自体のライセンス
(README.md参照)以外の第三者ライセンス表記は不要です。

## 非公式である旨

本ゲームは沖縄こどもの国が公開しているゾウの動物福祉の取り組みから着想した非公式の教育的ゲームです。
沖縄こどもの国の公式ゲームではなく、公式の商標・ロゴ・素材は一切使用していません(ゲーム内
「じょうほう」画面にも同旨を明記しています)。
