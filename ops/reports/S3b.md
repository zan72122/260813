# S3b レポート — ゾウの5固有採食行動 + elephantSeek完成

## 作ったもの(すべて `src/scene/elephant/behaviors/` 内、外部モデル/画像テクスチャ不使用)

- `types.ts`: `BehaviorContext`(elephant/scene/camera/rng/reducedMotion/quality/events/spotId/food/
  foodObject/env/runTimed)、`BehaviorFn`、`BehaviorCamera`(`goTo`のみの最小カメラ)、`BehaviorEnv`
  (stoneWall/sandPit/pipe/banyan/tallTreeの実インスタンス一式)。
- `support.ts`: 共通ヘルパー。**純ロジック**(three非依存、`tests/unit/behaviors.test.ts`が直接検証):
  `scaledDuration(seconds, reducedMotion)`(reducedMotion時に約60%へ短縮)、
  `runBehaviorLifecycle(events, id, spotId, fn)`(`behavior:start`→`fn()`→`behavior:complete`の順で
  emit、fnがthrowした場合はcompleteをemitせず再throw)。それ以外(three座標系ヘルパー):
  `cutCamera`/`revealShot`(camera未接続時は安全にno-op)、`mouthPosition`/`eatFood`/`approachDirXZ`/
  `pickFrontLeg`/`lerpV3`/`worldPositionOf`。
- `probeGap.ts` / `digSand.ts` / `reachPipe.ts` / `peelBanana.ts` / `breakBranch.ts`: 各行動本体
  (詳細は下記)。
- `index.ts`: `BEHAVIORS: Record<BehaviorId, BehaviorFn>`(5行動網羅の辞書)+ 再export。

## 各行動の構成(要件の「因果の瞬間でカットしない」を、camera.goToを開始1回+完了後Reveal1回だけに
限定することで自動的に満たしている。ためらいの拍/引く回数/鼻の揺らぎはすべて`ctx.rng`由来)

### probe-gap(石垣、`src/scene/elephant/behaviors/probeGap.ts`)
餌は開始時`visible=false`(隙間の奥に隠れている想定)。①`behavior:probe-gap`へカメラカット→
②鼻先が隙間手前で1-2拍(`rng.int(1,2)`)ためらう→③鼻が曲がって奥へ差し込む(curl漸増)→
④**因果=つまむ**: 先端curlを強め、餌を`visible=true`にしてeaseOutBackで出現→⑤ゆっくり引き抜く
(餌は`trunk.getTipPosition()`に追従)→⑥口へ運ぶ→⑦咀嚼(curlを微振動)→`eatFood`(disposeObject3D)→
⑧`revealShot`(`spot:stone-gap`へ1秒静止)。尺: 約6.1秒(reducedMotion時約3.7秒)。

### dig-sand(砂場、`digSand.ts`)
`sandPit.setMoundLevel(1)`で「既に埋まっている」状態を確立、餌を地中(`y-0.14`)に非表示配置。
①カメラカット→②鼻で砂表面を2-3回(`rng.int(2,3)`)払う→③前脚(`pickFrontLeg`でランダムに左右選択)で
1-2回(`rng.int(1,2)`)掻く(hip/knee.rotation.xを直接操作、砂埃を`effects/dust.ts`で少量ポップ、
moundLevelを部分的に下げる)→④**因果=現れる**: moundLevelを`0.55→0`まで連続的に下げつつ暗い砂色の
decal(円形メッシュ、フェードイン)が広がり、餌が`buriedPos→surfacePos`へ浮上+拡大表示→
⑤鼻で拾い口へ→⑥咀嚼→`eatFood`→⑦`revealShot`。尺: 約7.2-8.9秒(rng依存)。
**`sandPit.ts`に`setMoundLevel(t: number)`を追加**(flat/moundは同トポロジなので頂点Yを線形補間、
`setMound(on)`はその糖衣構文として再実装、既定の見た目=level0は従来のflatGeoと同一)。

### reach-pipe(土管、`reachPipe.ts`)
`pipe.getOpeningPositions()`(新設、両端の開口部ワールド座標)から手前側の開口を選ぶ。
①カメラカット→②しゃがみ気味に(`elephant.bodyPivot.position.y`を`-0.14`まで沈める、要件通り
`elephant.ts`に新設した`bodyPivot`アクセサ経由)→③鼻が開口へ入る、同時に`setPipeXray(true)`+餌を
`visible=true`(xray越しに内部が見える)→④奥へ進み**因果=届く**(curlで確保)→⑤鼻と餌が一緒に戻る
(追従)→⑥`setPipeXray(false)`→⑦口へ→⑧咀嚼→`eatFood`→立ち上がる→`revealShot`。
尺: 約6.9秒。`pipe.ts`に`getOpeningPositions(): [Vector3,Vector3]`を追加(既存の見た目は不変)。

### peel-banana(ガジュマル根元、`peelBanana.ts`)
`foodObject.userData.bananaLayers`(4層、外側→内側)/`bananaCore`を使用
(`world.ts`の`placeFood`が`banana-stem`のみ`createBananaStem()`を使い`userData`へ格納するよう拡張)。
①カメラカット→②掴む意思表示(一拍)→③外層3枚を1枚ずつ: 掴む→**因果=剥がれる**(
`paintVertexUniform(layer.geometry, クリーム色)`で繊維の裏を見せ、`scene.attach(layer)`でgroupから
シーン直下へ再親付け=world変形を保ったまま自由に動かせるようにする)→弧を描いて引き剥がす
(`arcLerp`、rngで角度をずらし毎回別方向)→口へ運ぶ→一噛み→`disposeObject3D(layer)`、を3回反復→
④残り(4層目+芯)を`foodObject`ごと口元へ寄せて`eatFood`→⑤`revealShot`。尺: 約10.6-11.7秒。

### break-branch(高木、`breakBranch.ts`)
①カメラカット→②鼻を高く伸ばす、同時に`elephant.bodyPivot.rotation.x`をわずかに後傾+両前脚
`knee.rotation.x`を少し持ち上げ(**二足立ちにはしない**、`elephant.legs`アクセサ新設経由)→
③2-3回(`rng.int(2,3)`)`tallTree.branchTipBone.rotation.z`を引くたびに深く曲げ、戻りを毎回浅くして
緊張を蓄積(bone1本、既存のtallTree.tsの枝をそのまま利用)→④**因果=折れる**:
`branchMesh`/`branchLeaves`/`feeder`を`visible=false`にし、その場に新規の破片メッシュ
(`buildDebrisBranch`、幹の枝や葉を模した専用ジオメトリ)を生成→⑤破片+餌が一緒にtween(ease、
物理エンジン不使用)で幹の根元付近へ落下、着地で葉くずパーティクル(`effects/dust.ts`)→
⑥体重を戻す→⑦地面の餌へ鼻を下げて拾い口へ→⑧咀嚼→`eatFood`+破片`disposeObject3D`→
`revealShot`。尺: 約7.7-8.8秒。`tallTree.ts`に`branchMesh`/`branchLeaves`/`trunkBase`を追加export
(既存の見た目・API`branchRootBone`/`branchTipBone`/`feeder`/`leafClusters`は不変)。

## 共通の演出インフラ

- **粒子(`src/scene/effects/dust.ts`、新設)**: `spawnPuffs(origin, opts, rng)`(InstancedMesh、
  放射状に散って上昇+フェードするワンショット)、`quantizeParticleCount(base, quality)`
  (low=0.35倍/medium=0.7倍/high=等倍)で品質に応じ削減。dig-sandの砂埃、break-branchの葉くずで使用。
- **reducedMotion短縮**: 各行動は`const T=(s)=>scaledDuration(s, ctx.reducedMotion)`で全フェーズの
  秒数を約60%に短縮(`support.ts`の`scaledDuration`、純ロジックとしてテスト済み)。
- **rngによる微差**: `ctx.rng`は`world.ts`の`behaviorRng.fork("<spotId>-<behaviorId>")`
  (elephant本体のrngとは独立列)。ためらいの拍数/掘る回数/引く回数/剥がす方向角/砂埃粒子の散り方が
  seedごとに変わる。

## カメラ登録内容(`src/scene/cameras.ts`、`behavior:<id>`を上書き登録)

- `rotateY()`+`behaviorShot()`という小さな共通ビルダーを追加: 既存`lookShot()`と同じ
  「approach→anchorの水平方向」を基準に、指定角度だけY軸回転した方向へ`distance`+`height`だけ
  離れた位置にカメラを置く(=常にanchorから一定距離を保つ設計。lookShotのように
  approach付近にカメラが寄ってしまう失敗をしない)。
- **probe-gap**: 隙間の横から。壁はワールドX方向に長い1枚の面に近いため、`behaviorShot`の回転方式
  ではなく世界+X方向への大きなオフセット(distance 5.8/portrait 4.6)で「壁の脇から見渡す」専用計算。
- **dig-sand**: やや低い斜め(rotateDeg 65°、height 0.95、distance 3.1)。
- **reach-pipe**: 横から、断面(xray)が見える角度(rotateDeg 85°、distance 2.8)。
- **peel-banana**: 斜め手前(rotateDeg 55°、**distance 7.0**、height 2.4、fov 44)。
  ※後述の「既知の制限/教訓」参照。approach-anchor間が近い(ゾウがすぐ根元に立つ)ため、
  浅い回転+近い距離だとゾウの頭部がバナナ茎への視線を丸ごと塞いでしまうことが実機検証で判明し、
  角度・距離を大きく調整し直した。
- **break-branch**: 見上げ(rotateDeg 15°、height **-2.3**=anchor.yより低い位置から見上げる)。
- 各プリセットとも`landscape`/`portrait`両対応、`registerPreset`と同じ`presets.set()`で上書き
  (S2の自動生成`behavior:<id>`より寄った/角度の異なる専用接写に完全上書き)。
- **QAブリッジ**: `?qa=1`時、`cameras.ts`が`window.__cameraRigDebug = rig`を公開する(既存の
  `world.ts`の`window.__elephantDebug`と同じ思想)。main.ts(編集禁止)は今のところ
  `world.setCameraRig()`を呼んでいないため、`world.ts`側の`resolveCamera()`が
  `setCameraRig()`未設定時に`window.__cameraRigDebug`を自動的に拾って使う設計にした
  (詳細は既知の制限参照)。
- **「軽く追従」は未実装**: 要件は「してよい」(任意)の表現だったため、5行動とも静止した専用アングル
  のみとし、鼻先/対象への動的追従(followTarget的な機構)は実装していない。将来追加する場合は
  `CameraRig`に`setBehaviorFocus(id, target)`のような仕組みを足し、各行動プリセットの`target`を
  関数化する形が自然。

## world.ts の変更(elephantSeekフック接続の完成)

- `events: EventBus`(`createEventBus()`、`core/events.ts`を使用)を新設して`World`へ追加。
  `behavior:start`/`behavior:complete`はこの`events`経由でemitされる(S4が購読する想定)。
- `registerHooks({...})`の初期登録に`elephantSeek: (spotId, food) => runElephantSeek(spotId, food)`
  を追加(elephantEnter/elephantIdleAtと同じくS3b自身が既定実装を差し込む)。
- `runElephantSeek(spotId, food)`: ①`maybeGlanceElsewhere(spotId)`(**exploration表現**: 複数
  スポットがある時、5割の確率で本命へ向かう前に別スポット方向へ一瞬(最大2秒、reducedMotion時
  短縮)鼻を向ける「迷い」。`elephant.visible`が`false`=まだ登場していない間は発生しない)→
  ②`elephant.walkToSpot(spotId)`→③`elephant.sniffAround(短時間、rng.range)`→
  ④`runSpotBehavior(spotId, food)`。
- `runSpotBehavior(spotId, food)`(elephantSeekと`playBehaviorDirect`の共通経路): `placeFood`で
  対象食材を確実に配置→**対象の方を向かせる**(`heading = atan2(anchor.x-approach.x,
  anchor.z-approach.z)`を計算し`elephant.idleAt(spot.approach, heading)`、歩いてきた向きのままだと
  対象を向いているとは限らないための補正、`Elephant.idleAt`に`headingRad`引数を新設)→
  `BEHAVIORS[spot.elephantBehavior]`を`BehaviorContext`と共に`runBehaviorLifecycle`でラップ実行→
  完了後`placedFoods`から該当エントリを掃除(行動側が`eatFood`で実際に消費済み)。
- **防御的処理**: `elephantSeek`が(誤って)`elephantEnter`前に呼ばれた場合、`elephant.visible`が
  `false`のままだと`elephant.update(dt)`が丸ごとno-opになり`gait.walkTo`のPromiseが永久に解決しない
  (ゲームが止まる)ため、`runElephantSeek`冒頭で`elephant.object3D.visible=true`を強制する安全弁を
  入れた。
- `placeFood`: `food==="banana-stem"`のときだけ`createBananaStem()`を使い、返る`{core, layers}`を
  `group.userData.bananaLayers`/`bananaCore`へ格納(peel-bananaが層を個別操作するため)。それ以外は
  従来通り`createFoodMesh()`。
- `animateValue(duration, onUpdate, opts?)`に`easing`オプションを追加(既定は従来通り
  `easeOutCubic`、behaviors向けの`runBehaviorTimed`は`linear`を指定して生のuを渡す)。
- `setCameraRig(rig: BehaviorCamera | null)`: main.ts(編集禁止)がS4で正式にcameraRigを繋ぐための
  差し込み口。未接続の間は`window.__cameraRigDebug`(cameras.tsのQAブリッジ)を自動的に探して使う
  `resolveCamera()`が働く。

## playBehaviorDirect(id: BehaviorId): Promise\<void\>(S4/S6向け)

`World`インターフェースに追加。`SPOTS.find(s => s.elephantBehavior === id)`で対象spotを特定し、
`spot.acceptedFoodTypes[0]`を自動配置してから、**歩行をスキップして**即座にその場で行動を再生する
(内部的には`runSpotBehavior`をそのまま呼ぶので、elephantSeekと全く同じ行動ロジック/イベント/
カメラカットが走る。歩行だけを飛ばして検証を速くする設計)。ゾウが未登場(`!elephant.visible`)でも
`object3D.visible=true`にしてから実行するので、`?qa=1`かつ`elephantEnter()`を呼んでいない状態から
でも直接叩ける。**S6向けの使い方**:
```js
// ブラウザ側(?qa=1時): window.__worldDebug が World インスタンス
await window.__worldDebug.playBehaviorDirect("dig-sand");
```
`debug/qa.ts`(編集禁止)の`DebugApi.playBehavior(id)`は、S6が`world.playBehaviorDirect(id)`を
呼ぶだけの薄い委譲として実装すればよい想定(S3bは`debug/qa.ts`を編集していない)。

## テスト(`tests/unit/behaviors.test.ts`、10件、three描画に依存しない純ロジック部分のみ)

1-2. `BEHAVIORS`が5つの`BehaviorId`をちょうど網羅し、各値がすべて関数であること。
3. `scaledDuration`が`reducedMotion=false`で秒数をそのまま返す。
4. `scaledDuration`が`reducedMotion=true`で`REDUCED_MOTION_SCALE`(0.6)倍になる。
5. `scaledDuration`が負値を0にクランプする。
6. `runBehaviorLifecycle`が`behavior:start`→fn本体→`behavior:complete`の順でemitする。
7. `runBehaviorLifecycle`がfnのPromise解決を実際に待ってから`complete`をemitする(非同期fn内の
   マーカーで順序を検証)。
8. `runBehaviorLifecycle`が正しい`{behaviorId, spotId}`ペイロードを両イベントへ渡す。
9. `runBehaviorLifecycle`がfnがthrowした場合`complete`をemitせず例外をそのまま伝播する。
10. 5つの`BehaviorId`すべてで`runBehaviorLifecycle`が正しいstart/completeペアを生成する。

`world.test.ts`は既存の1件(elephantSeekフォールバックのテスト)をS3の前例(elephantEnter対応)に
倣って更新し、実際に歩行+behavior再生まで`update(dt)`を積んで検証する内容へ変更。加えて
`behavior:start`/`behavior:complete`のemit順序と`playBehaviorDirect`単体動作を検証する1件を追加
(既存90+S3の12+今回の behaviors.test.ts 10 + world.test.ts追加1 = 113件、既存テストは破壊せず)。

## 目視確認(`artifacts/screenshots/dev-s3b-{probe,dig,pipe,banana,branch}.png`)

`?qa=1`+`playBehaviorDirect(id)`+`world.setReducedMotion(true)`/`cameraRig.setReducedMotion(true)`
(QAブリッジ経由、カメラ遷移を1.1秒→0.18秒にして撮影タイミングのレースを無くした)で撮影
(撮影専用スクリプトは本タスクの成果物ではないためscratchpadに保持、リポジトリには含めていない)。
4周の目視→修正を行った結果:

- **probe-gap**: 石垣の脇からの視点。ゾウの耳・鼻(垂れ下がり)・4脚・積み石の壁がはっきり見える。
- **dig-sand**: 低め斜めから。鼻を下げた姿勢、砂場の丸太縁、掘れた跡(decal)の上に現れた餌
  (hay-cube)がくっきり見える。
- **reach-pipe**: 土管の断面越し。xrayで半透明化した外壁の内側に、trunk finger と食材(にんじん+
  かぼちゃ)が浮かんで見える。
- **peel-banana**: ガジュマル幹の脇から。ゾウの頭部(目・耳)+鼻先が幹に添えられている構図。
  幹・葉冠・背景の石垣/飼育舎まで含めた広めのフレーミング。
- **break-branch**: 見上げ。高木の幹と枝、垂れ下がる葉冠、鼻を高く伸ばして枝を掴む頭部、
  折れた際の葉くず(緑の破片)が画面に散っている。

5枚とも姿勢・カメラ角・環境変化(壁/砂/土管/木/高木)が明確に異なり、「同じポーズの色違い」には
見えない。

## 既知の制限

1. **カメラの実配線は`?qa=1`のQAブリッジ頼み**: main.ts(編集禁止)は現状`world.setCameraRig()`を
   呼んでいないため、本番フロー(qa未指定)で`elephantSeek`を呼んでも**カメラは動かない**
   (`ctx.camera`が`null`になり`cutCamera`/`revealShot`は静かにno-opする。行動そのもの・イベント・
   餌消費は正常に完了する)。S4がFSMからカメラ/ワールドを本配線する際、
   `world.setCameraRig(cameraRig)`(または`cameraRig.goTo`を満たす任意オブジェクト)を一度呼ぶだけで
   全5行動のカメラカットが有効になる設計にしてある。
2. **カメラの「軽く追従」は未実装**(前述、要件上任意)。5行動とも静的な専用アングルのみ。
3. **peel-bananaのカメラ距離が他より遠め(distance 7.0)**: ゾウが鼻を伸ばしてガジュマルの根元へ
   届く演出のため、実際の視覚的占有域(頭部+伸びた鼻)がbbox実測で対角~5.6ユニットに達し、
   浅い回転角+近距離では頭部がバナナ茎への視線を丸ごと塞いでしまうことが実機検証で判明した
   (このタスクで最も時間を要した調整)。「手前斜め」の接写感はやや弱まるが、頭部・鼻・木・
   周辺環境が同時に視認できることを優先した。
4. **break-branchの枝の折れ方は近似**: 実際に枝メッシュを2分割する物理的な破断ではなく、
   ①折れる前の枝(`tallTree.branchMesh`ら)を`visible=false`にする、②見た目の近い破片メッシュを
   別途生成してtweenで落下、という2段階の入れ替えで表現している(要件の「物理エンジン禁止・
   落下はtween+ease」の制約下での近似)。同一プレイスルー内で`tallTree`の枝を再度生やす処理は
   実装していない(次回`break-branch`を再生すると、既に非表示の枝のままtipBoneがさらに曲がる。
   1セッション1回想定であれば問題ないが、同一ワールドで連続して`break-branch`を試す場合は
   `tallTree.branchMesh.visible`等をリセットする仕組みをS4/S6側で検討する余地がある)。
5. **sandPit.setMoundLevel()の既定値**: `createSandPit()`直後の既定は`level=0`
   (従来のflatGeoと同一の見た目)。「食べ物を隠す」演出(S4のhideフェーズ)側が改めて
   `setMoundLevel(1)`相当を呼ぶかは、dig-sand行動自身が開始時に`setMoundLevel(1)`へ即時セットする
   ため、単独では気にしなくてよい(digSand.tsが自己完結)。
6. **`playBehaviorDirect`は`elephantSeek`と完全に同じ`runSpotBehavior`を通る**ため、
   `behavior:start`/`behavior:complete`イベントも通常通りemitされる。S4が
   `events.on("behavior:complete", ...)`で進行管理する際、QA経由の直接再生でも同じイベントが
   飛ぶ点に留意(QA専用の別イベント等は用意していない)。
7. **`Elephant.idleAt`のheadingRad引数はWorldApi契約(`elephantIdleAt(pos)`)には含まれない**
   (`docs/INTERFACES.md`は変更していない)。`world.ts`内部の`runSpotBehavior`のみが
   `elephant.idleAt(pos, headingRad)`の2引数版を直接呼んでおり、`WorldHooks.elephantIdleAt`
   (外部公開フック)は従来通り1引数のままで後方互換。

## 実行コマンドと結果
```
$ npm run lint        # PASS (0 errors)
$ npm run typecheck   # PASS (0 errors)
$ npm run test        # PASS - 10 files, 113 tests (既存102 + 新規11: behaviors.test.ts 10 + world.test.ts +1)
$ npm run build       # PASS - dist/ generated
```

## 完了条件
lint/typecheck/test/build すべて成功。既存102テストは(S3同様の理由による`world.test.ts`1件の
最小限の更新を除き)壊していない(113 = 102 - 1更新 + 1更新後 + 10新規)。5行動それぞれの
スクリーンショットで姿勢・カメラ角・環境変化が明確に異なることを目視確認。
