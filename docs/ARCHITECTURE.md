# アーキテクチャ

## スタック
Vite 6 / TypeScript (strict) / Three.js 0.17x / Vitest / Playwright / vite-plugin-pwa。
React不使用。UIはDOMオーバーレイ（HTML/CSS）、世界はThree.js WebGL2。バックエンド・外部API・実行時外部通信なし。

## レイヤー
```
src/
  core/      … 純ロジック（three非依存・DOM非依存・全てunitテスト可能）
    types.ts   共有型（INTERFACES.md が正）
    fsm.ts     ゲーム状態機械
    rng.ts     seeded RNG (mulberry32) + fork
    events.ts  型付きイベントバス
    clock.ts   timeScale付きゲームクロック
    tween.ts   clockベースtween/sequence
  game/      … ゲームルール（three非依存）
    spots.ts   HidingSpot データ定義
    foods.ts   FoodDef データ定義
    session.ts 1プレイのセッション状態（隠した餌、探索順、seed）
    album.ts   観察済み行動の集計
  scene/     … Three.js表現層
    renderer.ts   WebGLRenderer管理、DPR、resize、context lost、quality適用
    world.ts      シーングラフのroot。update(dt)を配布
    cameras.ts    カメラプリセット＋遷移（portrait/landscape別フレーミング）
    environment/  地形・石垣・ガジュマル・土管・砂場・高木・ゲート・カート・飼育員
    elephant/     ゾウモデル、trunk（spline+bone chain）、gait、behaviors/
    effects/      砂decal/morph、埃sprite、葉揺れ
  ui/        … DOMオーバーレイ（画面、ボタン、アルバム、設定、ヒント）
  audio/     … WebAudio合成（外部音源なし）、Safari unlock
  save/      … localStorage永続化（versioned key）
  debug/     … QAモード & window.__ELEPHANT_GAME_DEBUG__
  main.ts    … 組み立てのみ
```

依存方向: `ui / scene / audio → game → core`。core は何にも依存しない。
scene と ui は互いを知らず、`events.ts` のバス経由で連携する。

## 状態機械（core/fsm.ts）
Phases: `boot → title → intro → hide → gate → seek → album → (hide|free)`。
`free` は hide の自由版（同じ機構、guided=false）。遷移はイベント駆動で、
不正遷移は throw ではなく無視＋console.warn（子どもの連打で壊れない）。
orientation変更・resizeで状態は一切初期化しない。

## アニメーション方針
物理エンジンなし。deterministic tween + procedural skeletal animation。
- 鼻: 肩→目標のCatmull-Romスプラインに8–10boneのSkinnedMeshチューブを沿わせる。
  目標追従に遅れ（lag）と揺らぎ（seeded noise）を与え、重さ・しなりを出す。
- 歩行: waypoint spline上のroot motion + sineベースの脚gait。
- 砂: morph/デカール縮小＋少数sprite。バナナ: 事前分割メッシュ＋morph。枝: 曲げbone。

## 品質段階
low / medium / high。起動時 auto 判定（devicePixelRatio・UA・canvas性能）＋設定で変更可。
low: DPR1.0, 影なし(blob shadow), post-processingなし。med/high: DPR≤1.75, 影1光源。
draw calls目標 ≤120、triangles ≤250k（low: ≤70 / ≤120k）。

## PWA
vite-plugin-pwa (generateSW, autoUpdate)。初回ロード後オフライン起動可。
更新は新SW有効化時にリロードし、新旧バンドル混在を防ぐ。

## テスト
- unit (Vitest): core/game 全域＋save/quality。
- integration (Vitest+jsdom): FSM×session×album の一周。
- E2E (Playwright): QAモード(`?qa=1&quality=low&timeScale=8&seed=42`)でdebug APIを待って進行。
  固定sleepではなく `window.__ELEPHANT_GAME_DEBUG__.ready` と state を待つ。

## コマンド
`npm run dev / build / preview / lint / typecheck / test / qa:e2e / qa:screenshots / check`
（check = lint+typecheck+test+build。）
