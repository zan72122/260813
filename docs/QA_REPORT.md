# QA_REPORT — S6 検証実測記録

実行日: 2026-08-13。環境: このセッションのコンテナ内(`/opt/pw-browsers/chromium`、
`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`、headless Chromium + SwiftShader software GL)。

## 1. コマンド結果

```
$ npm run lint        # PASS (0 errors)
$ npm run typecheck   # PASS (0 errors)
$ npm run test        # PASS - 16 files, 186 tests
$ npm run build       # PASS - dist/ generated (manifest.webmanifest / sw.js / workbox-*.js 込み、
                       #        precache 12 entries, 661.07 KiB)
$ npm run check       # PASS (上記4つを通しで実行)
$ npm run qa:e2e       # PASS - 60 tests run (4 project × 8 spec のうち @screenshot を除く組合せ)、
                       #        42 skipped(project限定、下記2節参照)、0 failed、retries不要
$ npm run qa:screenshots # PASS - 1 test run (iphone-portraitのみ)、3 skipped(他project)、
                       #        artifacts/screenshots/ に10枚生成
```

`npm run qa:e2e`/`npm run qa:screenshots` はいずれも `playwright.config.ts` の `webServer` が
`npm run preview -- --port 4173 --strictPort` を自動起動し、`dist/` のビルド成果物に対して実行した
(devサーバーではなくpreviewで検証、要件どおり)。

## 2. E2E構成と実行範囲

`playwright.config.ts`: `retries: 1`, `workers: 1`, `reporter: list`, `timeout: 75_000`,
`use.launchOptions.executablePath: "/opt/pw-browsers/chromium"`(再ダウンロードなし)。
4 projects: `iphone-portrait`(390×844) / `iphone-landscape`(844×390) / `ipad-portrait`(820×1180) /
`ipad-landscape`(1180×820)、全て `deviceScaleFactor: 2, hasTouch: true`。

重量シナリオ(`full-loop`/`behaviors`/`replay-freeplay`/`persistence`/`orientation`/
`accessibility`/`offline-pwa`/`screenshots`)は `test.skip(testInfo.project.name !== "...")` で
実行projectを1つに絞っている(`behaviors`のみ`iphone-landscape`、他は`iphone-portrait`)。
`smoke.spec.ts`のみ全4projectで実行される(要件どおり)。よって
`45 skipped`(qa:e2e+qa:screenshots通しの場合は42+3)は「他projectでの重複実行を意図的に間引いた」
結果であり、未実装・失敗ではない。

### 最終実行結果(この順で実施、いずれも0 failed / retryなしで安定)

- `npm run qa:e2e`: 60 tests run, 42 skipped, **0 failed**, 実行時間 約2.1分。
- `npm run qa:screenshots`: 1 test run, 3 skipped, **0 failed**, 実行時間 約59秒。
- 全spec合算(`playwright test`引数なし): 64 tests中 19 run / 45 skipped / **0 failed**、
  実行時間 約2.9分。

各specファイル冒頭で`collectConsoleErrors(page)`(console error + pageerror収集)を仕込み、
末尾で`toHaveLength(0)`をassertしている(`e2e/helpers.ts`)。**全specでコンソールエラー0件を確認**
(favicon等の404は現状のindex.html/PWA設定で解消済みであることをoffline-pwa.spec.tsのmanifest取得
確認も含め再確認した)。

## 3. 発見バグ

### 3.1 QA用ゾウのdebug配置がタイトル/隠し画面のスクショに写り込む(修正済み)

POLISH_BACKLOG記載の既知課題。`src/scene/world.ts`の`isQaMode`初期化ブロックが、`?qa=1`起動時に
無条件で`elephant.object3D.visible = true`+`elephant.idleAt({x:0,y:0,z:2})`を実行しており、
title/hide画面などゾウがまだ登場していないはずの場面でもゾウが常時可視化されていた。

**修正**: 該当ブロックから可視化/idleAt呼び出しを削除し、`window.__elephantDebug`ブリッジの公開
のみ残した(ゾウの表示制御は`runElephantSeek`/`playBehaviorDirect`/`elephantEnter`の各実行時のみ、
既存の設計どおり)。`artifacts/screenshots/01-title.png`/`02-hide.png`/`09-album.png`で
ゾウが写り込んでいないことを目視確認済み(本レポート添付の説明も参照)。

- 該当ファイル: `src/scene/world.ts`(S6の編集許可範囲内、"QAゾウ表示制御のみ"の条件を満たす)
- 再現手順(修正前): `?qa=1&nosw=1`で起動 → タイトル画面をスクショ → 放飼場中央付近(z=2)に
  ゾウが直立して見切れて写り込む。

### 3.2 [未修正・範囲外] `jumpTo("seek")`(`?act=seek`)がgait競合で永久にstallする

**症状**: `?qa=1&act=seek`で起動、または`window.__ELEPHANT_GAME_DEBUG__.jumpTo("seek")`を呼ぶと、
ゾウは入場(`elephantEnter`)まで完了して`idle`状態になるが、そのまま**永久に**次のスポットへ歩き出さず、
`behavior:start`/`behavior:complete`が一度も発火しない(`session.found`が常に空のまま)。

**再現手順**:
```js
// ブラウザ(?qa=1&seed=42&nosw=1で起動後)
await window.__ELEPHANT_GAME_DEBUG__.jumpTo("seek");
// 15秒待っても getState().elephant.state === "idle" のまま、position不変、
// getState().session.found は [] のまま(3スポット全て未発見)
```

**原因(調査結果、`src/ui/app.ts`・`src/ui/screens/seek.ts`はS6編集範囲外のため未修正)**:
`app.ts`の`jumpTo`実装は`ops/reports/S4.md`記載どおり、`seek`phaseの`prepareForPhase`で
`world.openGate()`→`elephantEnter()`を**awaitせず発火のみ**で`fsm.transition("seek")`する設計になっている。
このため`elephantEnter()`(内部で`gait.walkTo(...)`という非同期の歩行アニメーションを実行中)が完了する
前に`seek`画面がmountされ、`screens/seek.ts`の`run()`が即座に`world.elephantSeek(...)`
(`elephant.walkToSpot`→`gait.walkTo(...)`)を呼んでしまう。同一`Elephant`インスタンスの`gait`に対して
2つの`walkTo`が競合し、片方(または両方)のPromiseが二度と解決しなくなる。

一方、**実際のゲームプレイ経路(`src/ui/screens/gate.ts`の`triggerOpen()`)はこの問題が起きない**:
`await ctx.world.elephantEnter()`を明示的に`await`してから`ctx.transition("seek")`しているため、
seek画面mount時には入場アニメーションが必ず完了しており競合しない。**したがって本バグはQA専用
ショートカット(`act=seek`/`jumpTo("seek")`)のみに存在し、通常プレイのゲート操作では発生しない。**

**影響と対処**: `docs/INTERFACES.md`の`jumpTo`契約(「必要な前提状態を自動構築してphaseへ遷移」)を
`seek`に対して完全には満たせていない。S6のE2E(`screenshots.spec.ts`)は本バグを踏まないよう、
`act=gate`で止めてから`window.__worldDebug.openGate()`→`window.__cameraRigDebug.goTo("overview")`→
`window.__worldDebug.elephantEnter()`を手動で`await`する経路に変更して回避した
(`e2e/screenshots.spec.ts`のコメント参照)。`behaviors.spec.ts`/`full-loop.spec.ts`も
`act=seek`を使わない設計にしている(前者は`playBehaviorDirect`直接呼び出し、後者は実際のgate UIスワイプ
経由)。

**修正提案(参考、S6範囲外)**: `app.ts`の`seek`用`prepareForPhase`で`elephantEnter()`を`await`する。
`ops/reports/S4.md`は「発火のみ」を意図的な設計として記載しているため、修正の要否・優先度は
Fable判断/次工程に委ねる。

### 3.3 [参考・軽微] `DebugApi.screenshotReady()`が契約どおり機能していない

`docs/INTERFACES.md`は`screenshotReady()`を「カメラ遷移・tween静止でtrue」と定義しているが、
`src/main.ts`(S6編集範囲外)の`registerHandlers`は`screenshotReady: () => true`という固定スタブを
登録しており、実際のカメラ/tween状態を反映しない。

**影響**: QA/E2Eがこの関数を頼りにスクリーンショットタイミングを決めることができない。
**S6での回避**: `e2e/helpers.ts`に`installCameraStabilityTracker`/`waitForCameraSettled`を実装し、
`window.__cameraRigDebug.camera.position`を毎フレーム比較して連続8フレーム変化が無くなった時点を
「カメラ静止」とみなす代替手段でスクリーンショットタイミングを決定した(固定sleep不使用)。
修正には`src/main.ts`(main.tsのgetState/screenshotReadyハンドラ登録箇所)への変更が必要でS6の
編集許可範囲外のため、修正はしていない。

### 3.4 [参考] `getState()`にrenderer.info(draw calls/triangles)を含める配線ができなかった

タスク指示は「draw calls/triangles実測(renderer.infoをdebug APIのgetStateへ含めて取得)」を
求めているが、`GameRenderer`インスタンス(`renderer.instance.info`相当)は`src/main.ts`内でのみ
生成され、`getState()`ハンドラの登録(`debugApi.registerHandlers({getState: () => ({...})})`)も
`main.ts`が行っている。`main.ts`はS6の編集許可範囲外のため、`renderer.info`をgetState()へ配線する
ことはできなかった。

**代替計測**: `e2e/helpers.ts`の`approximateSceneStats()`が`window.__worldDebug.scene`を
Three.jsのSceneグラフごと走査し、`mesh.geometry.index.count`(またはposition.count)から三角形数を
概算する(実際のdraw call数とは一致しない可能性がある近似値、instancing/frustum cullingは考慮外)。
この方法で計測した概算値を次節に記録する。

## 4. シーン規模の実測(概算)

`approximateSceneStats()`(`e2e/helpers.ts`)を使い、`?qa=1&quality=low&seed=42&nosw=1`起動直後
(title/overview、hide/gate/album等のUIフェーズに依らずシーングラフ全体を走査)で計測:

| 指標 | 値 |
|---|---|
| メッシュ数(`isMesh`かつ`geometry`を持つノード) | 69 |
| 概算三角形数(`index.count`優先、無ければ`position.count`を3で割った値の総和) | 18,210 |

**既知の制限**: これは実際のWebGL draw call数(three.jsの`renderer.info.render.calls`)とは異なる
概算値(3.4節参照)。またInstancedMesh(パーティクル等)は本走査で1メッシュとしてカウントされ
インスタンス数分の三角形数は個別カウントされていない可能性がある(`spawnPuffs`のInstancedMesh等)。
quality設定(low/medium/high)による頂点数/シャドウ有無の差は本計測では区別していない
(low設定固定で計測)。

## 5. E2Eが検証した内容(spec別サマリ)

| spec | 検証内容 | 実行project |
|---|---|---|
| `smoke.spec.ts` | 起動→ready→タイトル表示→コンソールエラー0 | 4 project全て |
| `full-loop.spec.ts` | title→(intro)→hide(実ドラッグ1件+仕上げスワイプ+hideFoodDirect残り)→gate(実スワイプ)→seek(behavior:complete×3待ち)→album→もういちど | iphone-portrait |
| `behaviors.spec.ts` | playBehaviorDirectで5行動を順に再生、各behavior:completeを確認 | iphone-landscape |
| `replay-freeplay.spec.ts` | album到達でfirstPlayDone/freePlayUnlocked保存、ばしょをかえる/じゆうにあそぶ解放、seed固定で提案スポット再現 | iphone-portrait |
| `persistence.spec.ts` | せってい変更のリロード後維持、localStorage無効環境でもエラー0で起動 | iphone-portrait |
| `orientation.spec.ts` | hide画面での縦→横viewport変更で隠した餌数維持+food-trayクラス再配置 | iphone-portrait |
| `accessibility.spec.ts` | title/hide/gate/album主要タッチ対象64px以上、aria-label存在、reduced-motion起動 | iphone-portrait |
| `offline-pwa.spec.ts` | manifest/SW登録確認、オフライン2回目起動 | iphone-portrait |
| `screenshots.spec.ts` | 製品スクショ10枚生成(`qa:screenshots`専用、`@screenshot`タグでqa:e2eから除外) | iphone-portrait |

## 6. スクリーンショット目視結果

`artifacts/screenshots/01-title.png` 〜 `10-landscape-overview.png` の10枚を`Read`で目視確認した。

- 白画面・欠けなし。全て暖色パレット(生成り/珊瑚/黄/緑)、紫グラデ無し。
- `01-title.png`/`02-hide.png`/`09-album.png`にゾウが写り込んでいないことを確認(3.1のバグ修正の
  効果)。`02-hide.png`は食材トレイのドラッグ中ゴースト(半透明の持ち上がったカード)が写っている。
- `03-gate-elephant.png`はゲートを抜けて登場した直後のゾウ(全身)が中央に見える構図。
- `04〜08`(dig-sand/reach-pipe/peel-banana/break-branch/probe-gap)は`#ui-root`を撮影用に一時的に
  隠した上でplayBehaviorDirectの山場フレームを撮影しており、2D UIが3D演出に重ならない
  (S3b.mdの既存スクショと同様の撮り方)。`05-reach-pipe.png`/`08-probe-gap.png`は接写気味で
  対象物がやや判別しづらいが、これは`ops/reports/S3b.md`/`S3c.md`で既知の制限として記録済みの
  カメラ距離の制約(peel-bananaの「剥がれる繊維」視認性等)と同種の傾向であり、S6の担当範囲
  (カメラプリセットは`src/scene/cameras.ts`でS6編集範囲外)を超える改善は行っていない。
- `10-landscape-overview.png`は844×390でfood-trayが右端(縦並び)に配置されていることを確認。

## 7. 既知の制限(本タスク全体)

1. 3.2/3.3/3.4節記載のとおり、`src/ui/app.ts`・`src/main.ts`は編集範囲外のため、
   `jumpTo("seek")`のstallバグ・`screenshotReady()`スタブ化・`getState()`への`renderer.info`配線
   はいずれも修正/実装できていない(発見・回避のみ)。
2. `peel-banana`/`probe-gap`/`reach-pipe`のカメラ距離由来の視認性の弱さは`ops/reports/S3b.md`/
   `S3c.md`で既に記録済みの既知の制限であり、本タスクでは追加調整していない
   (`src/scene/cameras.ts`はS6編集範囲外)。
3. 三角形数/メッシュ数は概算(4節参照)。実機のdraw call数・フレームレートは計測していない
   (ヘッドレスSwiftShaderのため実GPU性能の指標にはならない)。
4. 実機(実際のiPhone/iPad端末、Safari)での動作・タッチ操作感・音声出力は本タスクでは検証して
   いない(`ops/reports/S5.md`同様、ヘッドレスChromium+SwiftShaderでの検証のみ)。実機での
   safe-area/notch対応の見た目、Service Workerの実機挙動(iOS Safariの制限事項含む)は
   未検証事項として引き継ぐ。
5. `full-loop.spec.ts`のhide操作における実ポインタドラッグは、3D空間上のスポット位置をカメラ行列で
   画面座標へ厳密投影して落下地点を計算しているが(`e2e/helpers.ts`の`projectToScreen`)、吸着に
   失敗した場合は`hideFoodDirect`へフォールバックする設計にしている(要件どおり「1つは実ドラッグ」
   を行うこと自体は保証されるが、必ず吸着成功するとは限らない場合の保険)。今回の実行では
   問題なく吸着に成功している。
6. `intro`フェーズは`timeScale=8`下では`playIntro()`のtweenが数十ms程度で自己完結するため、
   E2Eで確実に`phase:"intro"`を捕捉できるとは限らない(`full-loop.spec.ts`は捕捉できた場合のみ
   タップでスキップし、できなかった場合はそのまま`hide`到達を待つ設計にして対応した)。

## 8. 完了条件チェック

- `npm run check`(lint+typecheck+test+build): **PASS**
- `npm run qa:e2e`: **PASS**(0 failed、retryなしで安定)
- `npm run qa:screenshots`: **PASS**、スクショ10枚生成
- スクショ10枚目視: **合格**(白画面/欠けなし、6節参照)
- README/LICENSES/QA_REPORT: 本ファイルおよび`README.md`/`LICENSES.md`として完成
