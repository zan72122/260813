# ARCHITECTURE_CONTRACT — 実装契約

これは実装者全員が従う契約。ここに書かれた境界・API・スクリプト名は、統合者以外は変更禁止。

## スタック（凍結）

- Vite + TypeScript strict + Three.js（runtime依存は **three のみ**）
- devDeps: typescript, vite, vitest, @playwright/test, eslint + typescript-eslint, @types/three のみ
- 追加依存は禁止。物理エンジン・アニメライブラリ・状態管理ライブラリは使わない。
- アセットは**全て手続き生成**（Canvasテクスチャ / WebAudio合成音）。外部ファイル・外部ネットワーク不要。

## npmスクリプト（凍結）

```
dev        vite
build      vite build
preview    vite preview
typecheck  tsc --noEmit
lint       eslint .
test       vitest run
test:e2e   playwright test
verify     typecheck → lint → test → build → test:e2e を連続実行、いずれか失敗で非0
```

Playwrightは `vite preview`（dist）に対して実行。headlessでWebGLを使うため launch args に `--enable-unsafe-swiftshader` `--use-angle=swiftshader` を含める。ブラウザは環境変数 `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` の既存Chromiumを使い、`playwright install` を実行しない。

## ディレクトリと責務

```
src/contracts/   共有型・イベント・ストア・状態機械・anchor registry（Wave 2で凍結）
src/core/        renderer基盤: WebGLループ, resize, quality, context-loss   [Renderer]
src/render/      camera director, lighting, postなし                        [Renderer]
src/scene/       塔・クレーン・鉄骨・作業員・パリ遠景のprocedural構築       [Renderer]
src/visual/      蒸気/火花パーティクル, 赤熱emissive, procedural texture    [Renderer]
src/game/        フェーズごとのコントローラ, 進行ロジック, assist/hint制御   [Gameplay]
src/input/       pointer→intent変換, anchorヒットテスト                     [Gameplay]
src/ui/          DOM overlay: pictogram, HUD, メニュー, loading, pause      [UX]
src/audio/       WebAudio合成効果音, unlock, mute                           [UX]
src/styles/      CSS, safe-area, 縦横レイアウト                              [UX]
src/app/         全モジュールの結線, ライフサイクル                          [Integrator]
src/main.ts      エントリ                                                    [Integrator]
```

## 中核データフロー

単一の観測可能ストア `GameStore`（contracts）が真実。GameplayがInputIntentを受けて状態を進め、Renderer/UI/Audioはストア購読とイベントバスで反応する。モジュール間の直接import は contracts 経由のみ。

### GamePhase（凍結）

```ts
type GamePhase =
  | 'loading' | 'title' | 'opening'
  | 'hookDown' | 'hoist' | 'align' | 'bolts'
  | 'rivetHeat' | 'rivetCarry' | 'rivetInsert' | 'rivetHammer' | 'rivetCool'
  | 'sling' | 'climb' | 'reveal' | 'complete'
  | 'playRivet' | 'playClimb';
```

遷移表は `src/contracts/machine.ts` に定義（上記正順 + complete→{opening(同seed) | opening(新seed) | playRivet | playClimb} + playX→complete）。不正遷移は無視し console.warn しない（no console error方針、devのみwarn可）。

### GameState（骨子、Wave 2で確定）

```ts
interface GameState {
  phase: GamePhase; seed: number; towerLevel: number;
  beamShape: 'girder' | 'xpanel' | 'curved';
  hook: { depth: number; attached: boolean };        // 0..1
  hoist: { height: number; sway: number };           // height 0..1, sway rad
  align: { dx: number; dy: number; snapped: boolean };
  bolts: [boolean, boolean];
  rivet: { temp: number; station: 0|1|2|3; inserted: boolean; hits: 0|1|2|3; formed: number; cooled: number };
  sling: { released: boolean };
  climb: { lever: number; progress: number; locked: boolean };
  audio: { unlocked: boolean; muted: boolean };
  prefs: { reducedMotion: boolean };
  idleMs: number;                                     // assist用
}
```

### EventBus（凍結）

`src/contracts/bus.ts` の型付き `emit/on/off`。イベント名（追加はWave 2まで）:
`phase:enter, snap:hook, snap:align, bolt:seated, rivet:heated, rivet:handoff, rivet:inserted, rivet:hit, rivet:formed, rivet:cooled, sling:released, climb:start, climb:locked, reveal:done, assist:breathe, assist:point, cam:cue, sfx:*`

### AnchorRegistry（凍結・境界の要）

Rendererは毎フレーム、対話対象の**スクリーン座標**を registry へ publish する。Input/UIは3D知識なしで2Dヒットテスト・ヒント配置を行う。

```ts
type AnchorId = 'hook' | 'beam' | 'ghost' | 'lever' | 'bolt0' | 'bolt1' | 'hole0' | 'hole1'
  | 'forge' | 'tongs' | 'rivetHole' | 'hammerSpot' | 'slingClasp' | 'climbLever' | 'worker0'|'worker1'|'worker2'|'worker3';
interface Anchor { id: AnchorId; x: number; y: number; r: number; active: boolean }
```

### 各Ownerの公開API（factory シグネチャ凍結）

```ts
// Renderer:  src/core/index.ts
createRenderer(o: { canvas: HTMLCanvasElement; store: GameStore; bus: EventBus; anchors: AnchorRegistry }): {
  ready: Promise<void>; start(): void; stop(): void; resize(): void;
  setQuality(q: 'low'|'mid'|'high'): void; isSettled(): boolean;
  getStats(): { drawCalls: number; triangles: number; fps: number }; dispose(): void;
}
// Gameplay: src/game/index.ts
createGame(o: { store: GameStore; bus: EventBus; anchors: AnchorRegistry; element: HTMLElement }): {
  update(dtMs: number): void; dispose(): void;
}
// UX:       src/ui/index.ts
createUi(o: { root: HTMLElement; store: GameStore; bus: EventBus; anchors: AnchorRegistry }): { dispose(): void }
//           src/audio/index.ts
createAudio(o: { bus: EventBus; store: GameStore }): { unlock(): Promise<void>; dispose(): void }
```

app/はこれらを結線し、rAFループで `game.update(dt)` → renderer内部更新を回す。`document.hidden` でループ停止。

## テスト可能性契約（凍結）

- `window.__game`（常設・UI非表示）: `{ getState, dispatch(event), setPhase(p), sceneReady: boolean, settled(): boolean, stats(), seed }`
- URLパラメータ: `?seed=N`（決定的）, `?test=1`（fixed-step 16.67ms・idle演出の乱数固定・アニメ時間短縮係数0.25）, `?reduced=1`（reduced motion強制）
- DOM: `data-testid` を UI要素へ付与: `app-root, game-canvas, title-start, sound-toggle, pause-toggle, hint-layer, replay-same, replay-new, play-rivet, play-climb, back-to-complete, loading-screen, error-fallback`
- E2Eは固定sleep禁止。`window.__game.getState().phase` と `settled()` の状態待機のみ。

## 品質・堅牢性要件（全員）

- TypeScript strict でエラー0、ESLintエラー0、console error/unhandled rejection 0
- `visibilitychange` でrAF/音声停止・復帰
- `webglcontextlost/restored` で復旧（core担当、app結線）
- resize/orientationchange は debounce 200ms + visualViewport
- dispose() は listener/timer/geometry/material/texture を完全解放。replay 20回でリークなし
- prefers-reduced-motion 尊重（カメラ移動短縮・パーティクル削減・点滅なし）
- TODO/FIXME/placeholder/デバッグUI をproductionコードに残さない
