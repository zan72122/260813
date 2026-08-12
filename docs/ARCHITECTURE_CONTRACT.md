# ARCHITECTURE_CONTRACT

Wave 2完了後、`src/contracts/**`・`package.json`・lockfile・設定ファイルは**凍結**。変更はFable 5(統括)の承認が必要。実装ownerは契約に合わせる側であり、契約を動かす側ではない。

## Stack(固定)

Vite / TypeScript strict / Three.js / Vitest / Playwright / ESLint(flat config)。npm。runtime外部通信なし(フォント・テクスチャ・音は全てローカル生成またはbundle)。音はWebAudioで手続き生成(音源ファイル不要)を標準とする。

## モジュール境界

```
src/contracts/   型・定数・イベント・インターフェース(凍結、実装を含まない純粋型+純関数のみ)
src/core/        engine loop, quality manager, resize, context recovery   [Renderer owner]
src/render/      Three.js renderer, materials, camera director, magnifier [Renderer owner]
src/scene/       procedural geometry(塔・砂箱・ジャッキ・楔・足場・作業員) [Renderer owner]
src/visual/      sand particles/stream/surface, glow, effects             [Renderer owner]
src/game/        state machine, leg model, seed, assist, replay           [Gameplay owner]
src/input/       pointer→intent変換, drag corridor, 近接吸着               [Gameplay owner]
src/ui/          DOM overlay(loading, hint hand, sound/pause, complete)   [UX/audio owner]
src/audio/       WebAudio手続き音源, cue router                            [UX/audio owner]
src/styles/      CSS, safe area, portrait/landscape                        [UX/audio owner]
src/app/         組み立て・配線のみ                                         [Integrator]
src/main.ts      entry                                                     [Integrator]
```

依存方向: `app → {core,render,scene,visual,game,input,ui,audio} → contracts`。owner領域同士の直接import禁止。全ての領域間通信は contracts の型とevent busを通す。

## 中核契約(Wave 2で src/contracts/ に実装する。以下がAPIの正)

### types.ts

```ts
export type LegId = 0 | 1 | 2 | 3;                       // 0:NE 1:SE 2:SW 3:NW(順に攻略)
export type LegPhase = 'idle'|'intro'|'sand'|'jack'|'snap'|'wedge'|'locked';
export type GamePhase = 'boot'|'establish'|'leg'|'finalReveal'|'complete';

export interface LegState {
  sandLevel: number;        // 0..1 残砂率
  sandboxSupportY: number;  // 支持部高さ(units)
  jackExtension: number;    // 0..maxJack (units)
  legOffsetY: number;       // 目標との差(units)。+は高い、0で一致
  alignmentError: number;   // |legOffsetY|
  wedgeProgress: number;    // 0..1 楔挿入率(hammer後1)
  locked: boolean;
  phase: LegPhase;
}

export interface GameState {
  phase: GamePhase;
  activeLeg: LegId;
  legs: [LegState, LegState, LegState, LegState];
  seed: number;
  elapsed: number;          // 論理時間(s)
  paused: boolean;
  soundOn: boolean;
  reducedMotion: boolean;
}
```

単位: 1 unit = 史実の1mm相当。snapTolerance = 1.0 unit(=「1ミリ」)。初期ずれ +18〜+30、砂undershoot −2〜−5。

### constants.ts

SNAP_TOLERANCE, ASSIST_RADIUS(=6 units: この残距離以下でadaptive gain開始), SAND_MAX_RATE, JACK_MAX_STROKE, 各phaseのタイミング定数, PARTICLE_BUDGET(400), DPR_CAP{high:1.75, medium:1.5, low:1.25}。

### events.ts — 型付きEventBus

```ts
export type GameEvent =
  | { type:'phaseChanged'; phase:GamePhase }
  | { type:'legPhaseChanged'; leg:LegId; legPhase:LegPhase }
  | { type:'gateOpened'; leg:LegId; open:number }          // 0..1、毎変化
  | { type:'sandFlow'; leg:LegId; rate:number }            // 0で停止
  | { type:'sandDepleted'; leg:LegId }
  | { type:'jackPumped'; leg:LegId; stroke:number }        // 一往復確定ごと
  | { type:'nearTarget'; leg:LegId; error:number }         // ASSIST_RADIUS進入時
  | { type:'magnifierShown'; leg:LegId; shown:boolean }
  | { type:'snapped'; leg:LegId }
  | { type:'wedgeSeated'; leg:LegId }                      // 吸着完了、hammer待ち
  | { type:'hammered'; leg:LegId }
  | { type:'legLocked'; leg:LegId }
  | { type:'allLegsLocked' }
  | { type:'revealBeat'; index:0|1|2|3 }                   // finale各接合点発光
  | { type:'settled' }                                     // 第一層沈み込み完了
  | { type:'replayRequested' }
  | { type:'pauseChanged'; paused:boolean }
  | { type:'soundToggled'; on:boolean }
  | { type:'cameraCue'; cue:CameraCue };
export interface EventBus { emit(e:GameEvent):void; on<T extends GameEvent['type']>(t:T, fn:(e)=>void):()=>void; }
```

### intents.ts — 入力契約(input→game)

```ts
export type Intent =
  | { type:'gateSet'; open:number }        // 0..1(離した=0)
  | { type:'jackStroke' }                  // 有効な一往復
  | { type:'wedgeDrag'; progress:number }  // 0..1
  | { type:'wedgeRelease' }
  | { type:'hammerTap' }
  | { type:'advance' }                     // 演出スキップ相当の軽タップ(罰なし)
  | { type:'replay' };
```

### camera.ts

```ts
export type CameraCue =
  | { kind:'establish' } | { kind:'activeLeg'; leg:LegId }
  | { kind:'sandboxCutaway'; leg:LegId } | { kind:'jackCloseup'; leg:LegId }
  | { kind:'alignment'; leg:LegId } | { kind:'wedge'; leg:LegId }
  | { kind:'orbitToNext'; from:LegId; to:LegId }
  | { kind:'topReveal' } | { kind:'pullback' };
```

因果カットの禁止則: sand中とjack中はcauseとeffect(gate+砂+脚 / pump+ピストン+脚)が**同一フレーム内に両方写る**構図をcamera directorが保証する。

### handles.ts — 操作ハンドル契約(render→input)

rendererは毎フレーム、名前付きハンドルのスクリーン座標を登録する:

```ts
export type HandleId = 'sandGate'|'pumpHandle'|'wedge'|'hammer'|'replayButton';
export interface HandleInfo { id:HandleId; x:number; y:number; radius:number; // CSS px, radius>=48
  axis:'vertical'|'horizontal'|'free'; range:number; active:boolean; }
export interface HandleRegistry { set(h:HandleInfo):void; get(id):HandleInfo|undefined; all():HandleInfo[]; }
```

input(gameplay owner)はこのregistryにのみ依存し、Three.jsに依存しない。近接吸着・drag corridor・gain変換はinput側。

### audio.ts

AudioCue = イベント購読で完結(audio ownerはEventBusを購読)。追加契約: `sandFlow`はrate連続値でループ音強度を制御。`snapped`は低い金属共鳴+カコン。`revealBeat`は四回で音高が収束。

### quality.ts

```ts
export type QualityTier = 'high'|'medium'|'low';
export interface QualityState { tier:QualityTier; dprCap:number; particleMax:number; shadows:boolean; }
```

core が frame time 移動平均で自動降格(昇格はしない)。renderer/visual は QualityState を毎フレーム参照。

### rng.ts

mulberry32 seeded PRNG(純関数)。`legScenario(seed, leg): {initialOffset, sandUndershoot, pumpGain, cameraYaw, propVariant, pitchShift}`。

### testing.ts — Test inspector契約

```ts
export interface TestApi {
  ready: boolean;                    // scene ready(初回描画完了)
  settled(): boolean;                // カメラ・アニメ静止
  state(): GameState;                // deep copy
  alignmentError(leg:LegId): number;
  locked(leg:LegId): boolean;
  step(frames:number): void;         // fixedStep時のみ論理+描画を進める
  drive: {                           // 実gestureと同一のintent経路を通る(バイパス禁止)
    setGate(open:number): void; pump(): void;
    dragWedge(p:number): void; releaseWedge(): void; hammer(): void; advance(): void; replay(): void;
  };
  renderInfo(): { geometries:number; textures:number; drawCalls:number };
}
declare global { interface Window { __eiffel: TestApi } }
```

URL params: `?seed=N`(決定論)、`?fixedStep=1`(RAF自走停止、step()駆動)、`?quality=low|medium|high`。`drive.*` はintent層に注入するため、no-softlock不変条件・assist・snapは実プレイと同一コードを通る。

## 状態機械の不変条件(unitでテスト)

1. sand phase中、gate>0なら legOffsetY は単調減少。gate=0で停止。
2. sandはundershoot点(目標−2〜−5)で必ず尽き、それ以上下がらない。
3. jack phase中、pumpごとに legOffsetY は単調増加、ただし **0を超えない**(overshootなし)。
4. |legOffsetY| ≤ SNAP_TOLERANCE で自動snap→wedgeへ。
5. locked後、そのlegの値は不変。
6. 全4本locked以前にfinalRevealへ遷移しない。
7. orientation変更・pause/resume・visibilitychangeで状態を失わない。
8. replayで全state・全シーン資源が初期化され、同seedなら同一初期ずれ。
9. どの入力列(連打・逆方向・途中離し)でもphaseが前進不能になるsoftlockが存在しない。

## Engine loop

固定タイムステップ(1/60s)accumulator + 描画補間。`fixedStep=1`時はRAF自走せずTestApi.step()のみで進む。hidden時はRAF停止しaccumulatorを凍結(復帰時に巻き戻しなし)。context lost→`preventDefault`→restored時に全材質・RTを再構築。

## 禁止事項

owner領域外への書き込み / contracts変更 / 実rigid-body・粒状physics / runtime fetch / テキストUI(DOM文字列は`aria-label`とREADMEのみ可) / console.log残し / TODO・placeholder。
