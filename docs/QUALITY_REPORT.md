# QUALITY_REPORT — 品質・検証レポート（Wave 6 最終統合パス時点）

このレポートは Wave 6（監査指摘の最終修正パス）で測定した実データで全面更新したもの。数値・E2E網羅表・QAスクリーンショット所見・リーク計測はすべて本パスでの実測に基づく。旧レポート（Wave 4時点）の内容は本更新で置き換えられている。

## 1. Verification runs（`npm run verify`）

`npm run verify` = `typecheck → lint → test → build → test:e2e` を連続実行、いずれか失敗で非0。

| ステップ | 結果 |
|---|---|
| `typecheck` (`tsc --noEmit`) | PASS — 0 errors |
| `lint` (`eslint .`) | PASS — 0 errors, 0 warnings |
| `test` (`vitest run`) | PASS — 236/236 unit tests (31 files) |
| `build` (`vite build`) | PASS（バンドルサイズは §4 参照） |
| `test:e2e` (`playwright test`) | PASS — 全4視点 (phone-portrait / phone-landscape / tablet-portrait / tablet-landscape)、38 passed / 6 skipped / **0 failed** |
| `npm run verify` 総合 | **PASS — `EXIT_CODE=0`**（本レポート作成直前に最終コードで一括実行、所要 約15.5分） |

実際の一括実行ログ（末尾、`npm run verify` を最初から最後まで一括実行した実ログそのまま）:

```
  ✓  21 [tablet-portrait] › tests/e2e/full-loop.spec.ts:27:3 › full-loop › title -> opening -> ... -> complete via real gestures, with correct side effects and zero console errors (1.7m)
  ✓  26 [tablet-portrait] › tests/e2e/qa-screens.spec.ts:65:3 › qa-screens › capture opening / hoist / rivet-macro / crane-climb / completion (2.7m)
  ✓  27 [tablet-portrait] › tests/e2e/full-loop.spec.ts:113:3 › full-loop › replay-same, replay-new, playRivet loop, and playClimb loop all work from complete, with zero console errors (2.1m)
  ✓  28 [tablet-portrait] › tests/e2e/resilience.spec.ts:24:3 › resilience › (a) orientation change mid-replay: swapping viewport dims mid-hoist does not stall the second loop (34.2s)
  ✓  29 [tablet-portrait] › tests/e2e/smoke.spec.ts:8:3 › smoke › loads to title, starts, and exposes window.__game with no console errors (4.4s)
  ✓  30 [tablet-portrait] › tests/e2e/resilience.spec.ts:83:3 › resilience › (b) background/foreground: the loop stops while hidden and resumes with no state corruption (17.3s)
  ✓  32 [tablet-portrait] › tests/e2e/resilience.spec.ts:144:3 › resilience › (c) sound toggle off, then a phase still advances cleanly with zero errors (16.2s)
  ✓  33 [tablet-portrait] › tests/e2e/resilience.spec.ts:160:3 › resilience › (d) reduced motion (?reduced=1): a real mini-pass through align -> bolts with no errors (26.7s)
  ✓  34 [tablet-portrait] › tests/e2e/resilience.spec.ts:187:3 › resilience › (e) WebGL context loss/restore: scene recovers with the same phase and zero console errors (19.4s)
  -  35 [tablet-landscape] › tests/e2e/leak.spec.ts:67:3 › leak › 20 consecutive replays (dispatch fast path): no listener/timer growth, stable renderer stats, no runaway heap growth
  -  36 [tablet-landscape] › tests/e2e/leak.spec.ts:158:3 › leak › 3 real-gesture replays + sound/pause cycles: DOM/listener/timer/heap stay bounded
  ✓  31 [tablet-landscape] › tests/e2e/full-loop.spec.ts:27:3 › full-loop › title -> opening -> ... -> complete via real gestures, with correct side effects and zero console errors (1.7m)
  ✓  38 [tablet-landscape] › tests/e2e/full-loop.spec.ts:113:3 › full-loop › replay-same, replay-new, playRivet loop, and playClimb loop all work from complete, with zero console errors (2.0m)
  ✓  37 [tablet-landscape] › tests/e2e/qa-screens.spec.ts:65:3 › qa-screens › capture opening / hoist / rivet-macro / crane-climb / completion (2.4m)
  ✓  40 [tablet-landscape] › tests/e2e/smoke.spec.ts:8:3 › smoke › loads to title, starts, and exposes window.__game with no console errors (4.6s)
  ✓  39 [tablet-landscape] › tests/e2e/resilience.spec.ts:24:3 › resilience › (a) orientation change mid-replay: swapping viewport dims mid-hoist does not stall the second loop (21.2s)
  ✓  41 [tablet-landscape] › tests/e2e/resilience.spec.ts:83:3 › resilience › (b) background/foreground: the loop stops while hidden and resumes with no state corruption (8.4s)
  ✓  42 [tablet-landscape] › tests/e2e/resilience.spec.ts:144:3 › resilience › (c) sound toggle off, then a phase still advances cleanly with zero errors (7.0s)
  ✓  43 [tablet-landscape] › tests/e2e/resilience.spec.ts:160:3 › resilience › (d) reduced motion (?reduced=1): a real mini-pass through align -> bolts with no errors (12.8s)
  ✓  44 [tablet-landscape] › tests/e2e/resilience.spec.ts:187:3 › resilience › (e) WebGL context loss/restore: scene recovers with the same phase and zero console errors (9.3s)

  6 skipped
  38 passed (15.5m)
EXIT_CODE=0
```

（末尾40行の抜粋。6 skippedは`leak.spec.ts`の2ケース×phone-portrait以外の3視点＝6件で、`test.skip()`による意図的スキップ——§2参照。全44テスト中、実行された38件は全てPASS、失敗0件。）

## 2. E2E matrix

| spec | 内容 | 視点 |
|---|---|---|
| `smoke.spec.ts` | title到達→開始→`window.__game`疎通、console error 0件 | 4視点 |
| `full-loop.spec.ts` | title→opening→hookDown→hoist→align→bolts→rivet一式→sling→climb(release-mid-way)→reveal→complete を**実ポインタ操作**（`page.mouse`、実際に publish された anchor 座標）で完走。フェーズ遷移・towerLevel増分・sling/align等の副作用をassert。加えて replay-same / replay-new / playRivet loop / playClimb loop + back-to-complete を検証。console error/pageerror 0件を全区間でassert | 4視点 |
| `resilience.spec.ts` | (a) 2周目のhoist中にviewportを縦横入替（`setViewportSize`）→続行・完走 / (b) `document.hidden`+`visibilitychange`模擬でループ停止・復帰、状態破損なし / (c) サウンドOFF後もフェーズ進行 / (d) `?reduced=1` でalign→boltsの実操作ミニパス / (e) `WEBGL_lose_context`でcontext loss→restore、`settled()`/`sceneReady`復帰、フェーズ保持、console error 0件 | 4視点 |
| `leak.spec.ts` | **Wave 6で拡張、2本立て。** (1) `window.__game.dispatch()`高速パスで20周連続リプレイ。EventBusリスナー数・timer数の非増加、renderer統計(drawCalls/triangles)の周回間の安定、JSヒープの非単調増大を検証。(2) **新規**: `driveFullLoopToComplete`（実ポインタ操作、full-loop.spec.tsと同じドライバ）で3周の実ジェスチャーリプレイ＋周回ごとのsound-toggle ON/OFF・pause/resumeサイクルを実施し、EventBusリスナー数・タイマー数・`#ui`内DOM要素数（リプレイのたびに同じ静止値へ戻ることをassert）・JSヒープを検証。dispatch高速パスは音声・DOM・ヒント層・パーティクルを一切経由しないため、リークが実際に起きやすいこれらの経路は(2)が初めて実地でカバーする。実行時間は(1)(2)合計で phone-portrait 単体実行時 約2.5分（<3分の目標内）。詳細は §5 | phone-portrait代表 |
| `qa-screens.spec.ts` | 実ゲームプレイでopening/hoist/rivet-macro/crane-climb/completionの5枚を`settled()`+`drawCalls>0`確認後に撮影、`artifacts/qa/<project>/`へ保存 | 4視点 |

**実行サマリ**: `smoke.spec.ts`(1) + `full-loop.spec.ts`(2) + `resilience.spec.ts`(5) + `qa-screens.spec.ts`(1) の計9specファイル×4視点(36テストケース) + `leak.spec.ts`(2ケース×4視点=8、うち実際に実行されるのはphone-portrait分の2件、他3視点は`test.skip()`で明示スキップ) = Playwrightの数え上げで**全44テスト**（`Running 44 tests`）。console error/pageerror は全区間で0件。

## 3. QA screenshots

`artifacts/qa/<phone-portrait|phone-landscape|tablet-portrait|tablet-landscape>/` に各5枚（opening / hoist / rivet-macro / crane-climb / completion）= 計20枚。すべて`?test=1&seed=42`の実プレイから撮影、`settled()`かつ`drawCalls>0`を確認してから撮影しているため空フレームなし。Wave 6のレンダラー修正（§7）を反映した最新版（本パスで4視点とも再撮影・確認済み）。

VISUAL_ACCEPTANCE.mdのチェックリストと突き合わせ、Wave 4/5で指摘されていた「titleフェーズが不透明背景でシーンを隠す」「塔脚のX格子が無秩序な交錯に見える」の2点はいずれもWave 6までの修正（§7参照）で解消を確認した。本パス（統合者権限の範囲）で新たに追加した視覚上の指摘はない。

## 4. Performance stats

`window.__game.stats()`（= `renderer.getStats()`）の実測値。本パスでは `window.__game.setPhase()` で各フェーズへ直接遷移し、`settled()` を確認したうえで400ms待ってからサンプリング（`?test=1&seed=42`、ビルド済み`dist`を`vite preview`で配信、単独実行・他spec並走なし）。

### 390×844（phone-portrait 相当）

| フェーズ | drawCalls | triangles | fps(参考) | 予算比較 |
|---|---|---|---|---|
| opening | 75 | 17,128 | 2 | drawCalls ≤90 予算に対し余裕あり |
| align | 79 | 17,418 | 30 | 同上 |
| rivetHammer | 56 | 16,346 | 9 | 同上 |
| climb | 68 | 16,858 | 16 | climb中 ≤110 予算に対し大幅な余裕 |
| complete | 76 | 17,144 | 20 | drawCalls ≤90 予算に対し余裕あり |

### 1180×820（tablet-landscape 相当）

| フェーズ | drawCalls | triangles | fps(参考) | 予算比較 |
|---|---|---|---|---|
| opening | 84 | 17,670 | 31 | drawCalls ≤90 予算に対し余裕あり |
| align | 84 | 17,670 | 11 | 同上 |
| rivetHammer | 68 | 16,886 | 3 | 同上 |
| climb | 75 | 17,080 | 6 | climb中 ≤110 予算に対し大幅な余裕 |
| complete | 85 | 17,686 | 8 | drawCalls ≤90 予算に対し余裕あり |

**注（fps列について）**: この環境はswiftshaderソフトウェアレンダリング・共有4コアVM上の計測であり、fpsは実機（iPhone 11〜/iPad A12〜のGPUハードウェアレンダリング）の性能を代表しない。同一環境内でも他プロセスの有無で数倍振れる（本レポート作成中に実測: 単独実行時2〜31fps）。**drawCalls/trianglesはCPU/GPU競合の影響を受けない実測値であり、信頼できる指標として扱ってよい**。towerLevel=0（`seed=42`初期値）の計測であることに注意 — towerLevelが上がる（塔が高くなる）ほど塔ジオメトリのtriangles実測値は増える（§5参照、最大towerLevel=8到達時でtriangles ≈ 42,870、drawCalls ≈ 71、それでも予算内）。

全フェーズ・両視点を通じてdrawCalls 56〜85・triangles 16,346〜17,686の範囲（towerLevel=0時点）に収まっており、`docs/PERFORMANCE_BUDGET.md`の予算（通常drawCalls≤90 / climb中≤110 / triangles≤250k）に対して、塔が最大レベルまで育った状態（triangles ≈ 42,870）でもなお大幅な余裕がある。

バンドルサイズ（`npm run build`、フレッシュビルド、本パスの最終コード時点）: JS `dist/assets/index-*.js` 580.21 KB / gzip **153.48 KB**、CSS `dist/assets/index-*.css` 15.86 KB / gzip **4.06 KB**（目標 <900KB gzipに対し大幅な余裕）。

## 5. Leak check

`leak.spec.ts`（Wave 6で拡張、実測値はビルド済み`dist`を`vite preview`で配信し実行）:

### (1) dispatch高速パス、20周連続リプレイ

- **EventBusリスナー数**（`bus.listenerCount()`）: 起動直後から20周を通じて一貫して **25** で完全に横ばい。アサーションは`Math.max(...) === Math.min(...)`で厳格一致を要求し、PASS。
- **タイマー数**（`window.setTimeout`/`clearTimeout`をラップして計測）: 実測 **0**（サンプリング時点でPending timerなし）で全周を通じて横ばい。アサーションは最大値 ≤ 最小値+2 を要求、PASS。
- **renderer統計(drawCalls/triangles)**: **Wave 6での修正**——旧アサーション（5周目 vs 20周目の単純比較）は本パスで実際に**偽陽性で落ちるのを確認した**（並走する他specとのCPU競合下、triangles 24,042→34,320のように、許容していた+3,000を大きく超えて変動）。原因を切り分けた結果、リークではなく2点の既知ノイズ源だった: (a) `dispatch('opening')`直後はカメラの補間ターゲットが切り替わった瞬間（dtMs=0、`src/core/index.ts`の`phase:enter`同期ハンドラ）で、カメラは前フェーズ（`complete`の全景ショット）の位置にまだ留まっている——frustum cullingがこの遷移途中のカメラ姿勢に対して評価されるため、triangles/drawCallsが数千単位で揺れる。(b) `towerLevel`は`reveal`のたびに増え（`MAX_TOWER_LEVEL=8`まで）、塔ジオメトリは実際に成長する——これは本物のコンテンツ増加でリークではないが、5周目時点（towerLevel=5、成長途中）と20周目時点（towerLevel=8、上限到達済み）を比較すると本物の増分が混入する。**修正**: ① サンプリング前に`settled()`を待つ（カメラの遷移完了を保証）、② 比較対象を「towerLevelが上限に到達した後の周（`MAX_TOWER_LEVEL+1`周目）vs 20周目」に変更（塔の成長が完全に終わった区間同士の比較にする）。修正後、実測値は **9周目: drawCalls=71 triangles=42,870 → 20周目: drawCalls=71 triangles=42,870（完全一致）**、許容値（drawCalls +15 / triangles +3,000）に対して大幅な余裕を持ってPASS。2-worker並列実行下での再実行でも安定してPASSすることを確認済み。
- **JSヒープ**（`performance.memory.usedJSHeapSize`）: 5周目時点 vs 20周目時点の差分が`HEAP_GROWTH_TOLERANCE_BYTES = 4 MiB`以内に収まることを確認してPASS。
- 実行時間: 単独実行で約57秒〜1分、2-worker並列実行下（他specと同時）で約2分（`settled()`待機を追加した分、旧実装の2.6秒より長くなったが、`test.setTimeout`を180秒に拡大して吸収）。

### (2) 実ジェスチャー3周リプレイ + sound-toggle / pause-resume サイクル（Wave 6で新規追加）

`driveFullLoopToComplete`（`page.mouse`による実ポインタ操作、full-loop.spec.tsと同じドライバ）で3周をフルリプレイし、周回ごとに sound-toggle のON/OFFサイクルと pause-toggle→pause-overlayの`.pause-resume`（一時停止解除は角ボタンではなくオーバーレイ内の大きな再開ボタンで行う——一時停止中は角ボタンと同じz-indexのオーバーレイがDOM順で上に来るため、実際にヒットするのはオーバーレイ側。実機の一時停止解除操作もこの経路を辿る）による pause→resume サイクルを実施。dispatch高速パスは音声グラフ・DOM・ヒント層・パーティクルを一切経由しないため、これが実地でこれらの経路をカバーする初めてのE2Eになる。

- **EventBusリスナー数**: 起動直後の値を含め全4サンプル（3周分＋起動直後）を通じて完全に横ばい。PASS。
- **`#ui`内DOM要素数**（`document.getElementById('ui').querySelectorAll('*').length`）: 3周分のポスト・リプレイ・サンプル（毎周、成功フラッシュ要素`.success-wash`/`.success-ring`の自己消去タイマーが完全に片付くのを`waitForFunction`で待ってから計測）が完全一致。**起動直後の1周目より前の値とは意図的に比較していない**——ヒントレイヤーは一度も表示していない起動直後は空、いずれかのフェーズで一度表示されると（非表示に戻っても）最後のピクトグラムSVGがDOMに残る仕様（`src/ui/index.ts`の`setHintTarget`）のため、周回間比較のみが妥当なリーク信号になる。PASS。
- **タイマー数**: 最大値 ≤ 最小値+2 でPASS。
- **JSヒープ**: 1周目 vs 3周目の差分が`REAL_GESTURE_HEAP_GROWTH_TOLERANCE_BYTES = 6 MiB`（DOM/音声の実操作を伴う分、dispatch高速パスより緩め）以内でPASS。
- **renderer統計は意図的にassertしない**（上記(1)の教訓と同じ理由——3周では`towerLevel`の成長がまだ上限に達しておらず、比較窓が本物のコンテンツ増加を含んでしまう。深い20周を回す(1)がこの指標の担当）。
- 実行時間: 実測 約1.5分（<3分の目標内）。単独実行・他spec並走実行（2 worker、resilience/full-loop/qa-screensと同時）の両方で確認済み。

## 6. 統合時に発見・修正した defect（今回のWave 6最終パス）

1. **`webglcontextlost`/`webglcontextrestored`がcanvasに二重配線されていた（`src/core/index.ts`と`src/app/index.ts`の両方）** — `docs/ARCHITECTURE_CONTRACT.md`の「webglcontextlost/restored で復旧（core担当、app結線）」に反し、GL復旧処理（`event.preventDefault()` + `resize()`）が2箇所で重複実行されていた。coreの実装は自己完結している（canvasへの購読からdispose時の解除まで単独で完結）ため、appの重複配線を削除し、coreを唯一の所有者とした。appのrAFループ（`game.update()`）はWebGLコンテキストに一切触れないため、appの側で追加のloop pause/resume調整も不要と判断（`document.hidden`によるpause/resumeは既存の別経路でカバー済み）。`tests/e2e/resilience.spec.ts`の(e) context loss/restoreシナリオで再検証しPASSを確認。
2. **タイトル画面の`lever`アンカーが実際のタップ対象とズレていた** — `window.__game.anchors()`が`title`フェーズ中に公開する`lever`は装飾用3Dオブジェクト（`src/scene/index.ts`のstartLever）のスクリーン投影で、実際にタップ可能な`title-start`ボタン（CSS flexboxで配置されたDOM要素、3Dカメラ構図とは無関係）の位置とは無関係だった。Input/Gameplayは`title`フェーズ中いかなるアンカーもヒットテストしない（ボタン自身が独自のclickリスナーで完結、`hintForPhase('title', ...)`も`null`）ため、実害は「診断用途としての`window.__game.anchors()`が紛らわしい」点のみ。`src/app/index.ts`の`window.__game.anchors()`実装を、`title`フェーズ中は`lever`エントリをDOMボタンの実測`getBoundingClientRect()`中心へ差し替えるよう修正（共有`AnchorRegistry`自体は変更せず、読み取り専用の診断API側でのみ補正——rendererが同じmapキーに毎フレーム書き込み続けているため、レジストリ側を書き換えても次のrAFで上書きされてしまう）。手動検証で、DOMボタン中心と`anchors()`の`lever`エントリが常に完全一致（delta 0,0）し、リサイズ後も追従することを確認済み。
3. **`leak.spec.ts`のdispatch高速パス20周比較が、統合作業中に実際に偽陽性で失敗するのを検出・修正した** — §5(1)参照。
4. **`qa-screens.spec.ts`の`page.screenshot()`がtablet-portraitで実際にタイムアウト失敗するのを検出・修正した** — `leak.spec.ts`の拡張（本パスの項目2）で2-worker並列実行の総CPU負荷が増えた結果、`page.screenshot()`がPlaywrightのグローバル`actionTimeout`（`playwright.config.ts`、10秒）内にswiftshaderソフトウェアレンダリングでフレームを用意できず`TimeoutError: page.screenshot: Timeout 10000ms exceeded`でtablet-portrait実行が2回連続（うち1回はtest.setTimeout自体の枯渇、もう1回はscreenshotアクション単体の10秒枯渇）失敗するのを検出。テスト自体のロジックは正しく、CPU競合下でのアクション単体タイムアウトが単に短すぎただけと判断し、`playwright.config.ts`のグローバル設定（本統合作業の対象外パス）には触れず、`tests/e2e/qa-screens.spec.ts`内の該当`page.screenshot()`呼び出し2箇所に`timeout: 30_000`を個別指定して解消。修正後、同条件（tablet-portrait、2-worker並列、leak.spec.ts本パス拡張版と同時実行）で再検証しPASSを確認。

## 7. Wave 5 監査 → Wave 6 修正サイクル（要約）

Wave 5（監査）で指摘され、Wave 6（本パス以前の修正コミット群）で対応済みの主な指摘（現在のコードで確認済み）:

| 指摘 | 対応 |
|---|---|
| completeフェーズがカード羅列のダッシュボードになっていた | 完成画面を透過・クリックスルーの`.complete-menu`に変更し、下段の木製看板レール（`.complete-board`）だけが実際にタップを受ける構成にした。塔・クレーンのジオラマは背後に見え続ける（`src/ui/index.ts`のU1修正、`src/styles/components.css`） |
| エッフェル塔のシルエットが読めない（脚のX格子が無秩序な交錯に見える） | 塔脚をテーパー付きラティス橋脚として再構築、コーナーコード・登坂レール・レベル境界のリングガーダーを追加し、脚間を結ぶ長大な斜材の束を廃止（`src/scene/tower.ts`、`src/scene/curve.ts`） |
| パリ遠景がオスマン様式・トロカデロ宮と分かる密度がなかった | オスマン様式建物（インスタンス化、亜鉛マンサード屋根付き）とトロカデロ宮のシルエット＋ドームを追加（`src/scene/backdrop.ts`） |
| hoist/approachカメラが塔の脚に隠れて荷が見えないことがあった | カメラを塔の中心軸まわりの周回軌道に変更し脚によるオクルージョンを回避、align構図も拡幅してbeam/ghostアンカーが画面内に収まるよう調整（`src/render/cameraCompose.ts`） |
| climb演出中にクレーンの機構（車輪・蒸気）が見えづらかった | carriage中心のフレーミングに変更、真鍮の車輪ディテールを追加、蒸気を周期的な強めのバーストに変更（`src/scene/index.ts`, `src/scene/crane.ts`, `src/visual/steam.ts`） |
| 光源が2灯予算を超えていた（forgeのPointLightが3灯目になっていた） | forgeのPointLightを削除し、emissiveマテリアル＋グローsprite表現に置き換え。directional 1 + hemisphere 1 の2灯構成を維持（`src/scene/rivet.ts`, `src/core/index.ts`） |
| スワイプ判定がフレームの乱れに弱く、ゆっくりしたドラッグでrivetCarryの受け渡しが失敗することがあった | タイムスタンプベースのスワイプ判定に変更（フレームの乱れに影響されない）。ゆっくりした右方向ドラッグも受け渡しとして受理するようロジックを拡張（`src/input/gestures.ts`, `src/game/phases/rivet.ts`、ユニットテスト追加） |
| rivetCarryのヒントが非アクティブなアンカーを指してしまうことがあった | ヒントの対象アンカーを実際にアクティブな`tongs`アンカーへ再ターゲットし、非アクティブ時のフォールバックを追加（`src/ui/hints.ts`） |

本Wave 6最終パス（このレポートの作成対象）で新たに対応した項目は §6 の4件（context-loss二重配線の解消、titleレバーアンカーの整合、leak.spec.tsの拡張と偽陽性修正、qa-screens.spec.tsのスクリーンショットタイムアウト修正）。上記表の項目はいずれも今回のパス開始時点で既にコードに反映済みであることを確認し（各対応箇所を直接確認）、本レポートに要約として記録した。

## 8. Known limitations（未修正・低優先度、変更なし）

以下はWave 4時点から変更のない既知の簡略化・限界（詳細は各owner handoff参照、`docs/handoffs/`）。本パスのマンデート（統合阻害バグへの外科的修正）の範囲外のため据え置き:

- **error-fallbackのピクトグラムが汎用の困り顔で、明示的な「うなだれたクレーン」ではない**（UX handoff記載）。`data-testid=error-fallback`自体は正しく機能する。
- **`replay-new`時、作業員の服色・背景の雲/建物配置が再シードされない**（Renderer handoff記載）。`state.beamShape`/`towerLevel`駆動のジオメトリは反応するが、`createSceneRig(seed)`構築時に一度だけ決まる装飾的乱数は再シードしない。
- **`assist:breathe`/`assist:point`に対する3Dメッシュ側の反応なし**（Renderer handoff記載）。ソフトロック防止の実効性には影響しない。
- **ボルトのライブドラッグ位置**（Gameplay handoff記載）。`GameState.bolts`はseated真偽値のみ、ドラッグ中の指位置への3Dメッシュのリアルタイム追従はない。
- **`window.__game.setPhase()`はサブ状態をリセットしない**（Foundation/Renderer記載の既知の性質）。全E2Eは`setPhase`を使わず`dispatch()`/実ジェスチャーのみを使用しているため、テストの信頼性には影響しない。
