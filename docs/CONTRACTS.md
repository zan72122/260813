# CONTRACTS — 共有データ契約

実装場所: `src/contracts/`（Wave 1 で Integrator が実装。以後の変更は Integrator への変更要求のみ。
worker が直接編集してはならない）。全 worker はこの契約だけに依存して並行開発する。

## 型定義（同等物を TypeScript strict で実装）

```ts
// src/contracts/phase.ts
export type GamePhase =
  | 'title' | 'garden-idle' | 'whistle-cue' | 'valve-approach'
  | 'valve-turn' | 'pipe-run' | 'fountain-reveal'
  | 'finale' | 'replay-choice';

export type FountainId = 'fountain-fan' | 'fountain-ring' | 'fountain-crown';

// src/contracts/intents.ts — 入力層(mobile-qa担当)が発行、ゲーム層(gameplay担当)が消費
export type ActionIntent =
  | { kind: 'tap'; x: number; y: number }                    // 正規化座標 0..1
  | { kind: 'whistle-blow' }                                  // 笛ヒット判定後
  | { kind: 'valve-rotate'; deltaAngleRad: number;            // +が時計回り
      angularVelocityRadPerSec: number }
  | { kind: 'choice'; choice: 'same' | 'restart' | 'free-valve' };

// src/contracts/events.ts — ゲーム層が発行、描画/音/UI層が購読
export type GameEvent =
  | { kind: 'phase-changed'; phase: GamePhase; fountain: FountainId | null }
  | { kind: 'whistle-blown' }
  | { kind: 'valve-progress'; openness: number;               // 0..1 単調増加
      angularVelocityRadPerSec: number }
  | { kind: 'valve-opened'; fountain: FountainId }
  | { kind: 'water-progress'; t: number; fountain: FountainId } // 配管内位置 0..1
  | { kind: 'water-arrived'; fountain: FountainId }
  | { kind: 'fountain-flow'; fountain: FountainId; intensity: number } // 0..1
  | { kind: 'finale-started' }
  | { kind: 'loop-completed' }
  | { kind: 'hint'; target: 'whistle' | 'valve' | 'choice' };  // 3–5s無操作で発火

// src/contracts/bus.ts — 型付き pub/sub（購読解除関数を返す）
export interface EventBus {
  emitIntent(i: ActionIntent): void;
  onIntent(fn: (i: ActionIntent) => void): () => void;
  emitEvent(e: GameEvent): void;
  onEvent(fn: (e: GameEvent) => void): () => void;
}

// src/contracts/scene.ts
export interface SceneContext {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer; bus: EventBus;
  quality: QualityTier; viewport: ViewportProfile;
  audio: AudioDirector;
}
export interface SceneModule {
  readonly id: string;
  init(ctx: SceneContext): void;         // 一度だけ
  enter(phase: GamePhase): void;
  update(dt: number, elapsed: number): void;
  onViewportChange(v: ViewportProfile): void;
  dispose(): void;                       // 全リソース解放
}

// src/contracts/cinematic.ts
export interface CameraPose { position: [number,number,number];
  lookAt: [number,number,number]; fov?: number }
export interface CinematicBeat {
  id: string; phase: GamePhase;
  portrait: CameraPose[]; landscape: CameraPose[];  // キーフレーム列
  durationSec: number | 'hold';
  easing: 'linear' | 'ease-in-out' | 'ease-out';
}

// src/contracts/quality.ts
export type QualityTier = 'low' | 'medium' | 'high';
export interface ViewportProfile { width: number; height: number;
  dpr: number; orientation: 'portrait' | 'landscape' }

// src/contracts/audio.ts — 実装は rendering-audio 担当
export type AudioCue =
  | 'whistle' | 'valve-creak' | 'valve-resist' | 'pipe-rush'
  | 'fountain-splash-fan' | 'fountain-splash-ring' | 'fountain-splash-crown'
  | 'ambient-morning' | 'finale-chord' | 'ui-tap';
export interface AudioDirector {
  unlock(): Promise<void>;               // 最初のユーザー操作で呼ぶ
  play(cue: AudioCue, opts?: { gain?: number; rate?: number }): void;
  setIntensity(cue: AudioCue, v: number): void; // 連続音の強度(水音等)
  muted: boolean;
}
```

## 因果のデータフロー（この一本線を壊さない）

```
touch円運動 →[input層: 角度追跡・時計回り補正]→ ActionIntent(valve-rotate)
→[game層: openness積分・角速度ローパス]→ GameEvent(valve-progress)
→[render層: レンチ回転角 = openness*2.5回転相当, 音: valve-creak rate]
openness>=1 → valve-opened → pipe-run beat → water-progress(t: 0→1, 速度は開けた時の平均角速度に比例)
→ water-arrived → fountain-flow(intensity 0→1) → 噴流メッシュ高・水音・濡れ石
```

指が止まる → valve-rotate が来ない → openness 停止 → water/音も現状維持で停止。

## 変更手続き

契約変更が必要な worker は、コードを変更せず handoff の「未解決事項」欄に
変更要求（型名・理由・提案差分）を書いて返す。Integrator だけが src/contracts を編集する。
