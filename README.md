# ゾウのかくれごはん

4歳児(未就学児)向けのタッチ操作教育ゲーム。ごはんを放飼場のあちこちに隠して、ゲートを開けて
ゾウを呼び、ゾウが鼻や脚を使ってごはんを見つける5つの固有行動を見て遊ぶ。文章に頼らず、絵・動き・
音だけで進行できるように作られている。

沖縄こどもの国が公開しているゾウの動物福祉の取り組みから着想した**非公式**の教育的ゲームです。
沖縄こどもの国の公式ゲームではありません(ゲーム内「じょうほう」画面にも明記)。

## 必要環境

- Node.js 20以上を推奨(`@types/node` ^22系、`vite` 6系)
- npm(このリポジトリは `package-lock.json` を使用)
- モダンブラウザ(Chromium/Safari/Firefoxの最近のバージョン、WebGL2対応)

## インストール

```bash
npm install
```

## 開発起動

```bash
npm run dev
```

Viteの開発サーバーが起動する(既定 http://localhost:5173 、ポートは空いているものが自動選択される)。

## ビルド / プレビュー

```bash
npm run build      # dist/ へ本番ビルド(PWAのmanifest/Service Worker込み)
npm run preview     # dist/ をローカル配信して確認(既定 http://localhost:4173)
```

## テスト

```bash
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run test         # Vitest(unit + integration、jsdom環境)
npm run check        # 上記3つ + build をまとめて実行
npm run qa:e2e        # Playwright E2E(screenshots.spec.tsを除く全spec、4デバイスサイズ)
npm run qa:screenshots # Playwright: 製品スクリーンショット10枚を artifacts/screenshots/ へ生成
```

E2E/スクリーンショットは `dist/` のビルド成果物を `vite preview` で配信して実行する
(`playwright.config.ts` の `webServer` が `npm run preview` を自動起動する)。プリインストール済みの
Chromium(`/opt/pw-browsers/chromium`)を使い、`playwright install` は行わない。

## QAモード / URLパラメータ

`?qa=1` を付けて起動すると `window.__ELEPHANT_GAME_DEBUG__` (`docs/INTERFACES.md` の `DebugApi` 契約)
が全機能で有効になり、E2E/QA用の直接操作が可能になる(`qa=1` 無しでは `ready`/`getState()` のみ)。

| パラメータ | 説明 |
|---|---|
| `qa=1` | QAモードを有効化(debug APIの全機能・カメラ/ワールドのwindowブリッジを公開) |
| `quality=low\|medium\|high` | 起動時の描画品質を指定 |
| `timeScale=<数値>` | ゲームクロックの速度倍率(最大16)。QAでの高速検証向け |
| `seed=<整数>` | 乱数シード。同じseedなら探索順・提案スポットが再現する |
| `act=<phase>` | 起動直後に `jumpTo(phase)` を実行(`title\|intro\|hide\|gate\|seek\|album` 等) |
| `nosw=1` | Service Worker登録をスキップ(E2Eの安定化用) |

QA検証で使う代表的なURL:

```
http://localhost:4173/?qa=1&quality=low&timeScale=8&seed=42&nosw=1
http://localhost:4173/?qa=1&quality=low&timeScale=8&seed=42&act=seek&nosw=1
```

`window.__ELEPHANT_GAME_DEBUG__` の主なメソッド(詳細は `docs/INTERFACES.md`):

- `getState()`: `{ phase, session, album, elephant, quality, timeScale, seed, ... }` を返す
- `jumpTo(phase)`: 必要な前提状態を自動構築してそのphaseへ遷移
- `playBehavior(id)` (= `world.playBehaviorDirect`): 歩行をスキップして指定行動を即再生
- `hideFoodDirect(spotId, food)`: ドラッグ操作を経由せず1食材を直接隠す(E2E補助、`DebugApi`型契約外の追加プロパティ)
- `reset(seed?)`: 指定seedでページを再読み込みして最初から

## スクリーンショット撮影

```bash
npm run qa:screenshots
```

`artifacts/screenshots/` に製品スクリーンショット10枚(`01-title.png` 〜 `10-landscape-overview.png`)を
生成する。開発中の目視確認用スクリーンショット(`dev-*.png`)は各工程の記録として残してある。

## PWA / オフライン確認手順

```bash
npm run build
npm run preview
```

1. `http://localhost:4173/` をブラウザで開き、初回ロードでService Workerが有効化されるのを待つ
   (DevTools > Application > Service Workers で `activated` を確認)。
2. DevTools > Network で "Offline" にする(または機内モード)。
3. ページをリロードしてもタイトル画面が表示されエラーが出ないことを確認する。

`e2e/offline-pwa.spec.ts` がこの手順をPlaywrightで自動化している(`npm run qa:e2e` に含まれる)。

## 主要アーキテクチャ

- `src/core/`: FSM・クロック・RNG・イベントバスなど基盤(型定義は `src/core/types.ts`、契約は
  [`docs/INTERFACES.md`](./docs/INTERFACES.md) が正)
- `src/game/`: セッション/アルバム/ヒントなどゲームロジック(純粋関数中心)
- `src/scene/`: Three.jsシーン(環境・カメラ・ゾウ本体・5固有行動・エフェクト)
- `src/ui/`: 素のDOM+TypeScriptによる画面(title/intro/hide/gate/seek/album)、UIフレームワーク不使用
- `src/audio/`: WebAudio合成による効果音・環境音(外部音源ファイル不使用)
- `src/save/`: localStorageベースの保存(`docs/INTERFACES.md` の `SaveData` 契約)
- `src/debug/qa.ts`: QAモード用 `DebugApi` の実装
- `e2e/`: Playwright E2E(`e2e/helpers.ts` に共通ヘルパー)

設計・受け入れ基準の詳細は `docs/` を参照:

- [`docs/PRODUCT_SPEC.md`](./docs/PRODUCT_SPEC.md) — プロダクト仕様
- [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — アーキテクチャ
- [`docs/INTERFACES.md`](./docs/INTERFACES.md) — モジュール間契約(型・イベント・URLパラメータ)
- [`docs/ACCEPTANCE_MATRIX.md`](./docs/ACCEPTANCE_MATRIX.md) — 受け入れ基準と検証状況
- [`docs/ART_DIRECTION.md`](./docs/ART_DIRECTION.md) — アートディレクション方針
- [`docs/DECISIONS.md`](./docs/DECISIONS.md) — 設計判断の記録
- [`docs/QA_REPORT.md`](./docs/QA_REPORT.md) — QA実測記録(本タスクS6の検証結果)

## ライセンス方針

- このリポジトリ自体のソースコードのライセンスはリポジトリ管理者の方針に従う(本READMEでは
  第三者依存パッケージのライセンスのみ [`LICENSES.md`](./LICENSES.md) にまとめている)。
- 画像・3Dモデル・音源等の外部アセットファイルは一切同梱していない。3Dモデル・UIアイコンは
  コードによる手続き生成、効果音・環境音はWebAudio合成によるオリジナル実装(詳細は
  [`LICENSES.md`](./LICENSES.md) 参照)。
- 依存パッケージ(`three`/`vite-plugin-pwa`/`vite`等)のライセンス一覧は
  [`LICENSES.md`](./LICENSES.md) を参照。
- 本ゲームは非公式・教育目的であり、広告・analytics・ログイン・実行時の外部通信を含まない。
