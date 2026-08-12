# CONTRACTS — 共有契約（src/core/** にIntegratorが実装。変更はIntegratorのみ）

以下と**同等**のTypeScript契約を src/core/ に置く。命名の微調整は可、意味の変更は不可。
すべて strict で型付けし、any禁止。

```ts
// ---- phases ----
export type GamePhase =
  | 'boot' | 'title' | 'establish' | 'cue' | 'descend' | 'unlock'
  | 'pull1' | 'reveal1' | 'cue2' | 'pull2' | 'reveal2'
  | 'finale' | 'choice' | 'freePlay';

// ---- progress ----
/** 0..1。変換の唯一の真実。ここから全装置状態を純関数で導出する。 */
export type StageTransformProgress = number; // clamp [0,1]
export type SceneId = 'salon' | 'forest' | 'rustic';
export interface TransformPair { from: SceneId; to: SceneId; }
// TRANSFORM_TIMELINE: STAGE_MECHANISM_ABSTRACTION.md の区間定数表を定義する定数オブジェクト。

// ---- input ----
export type ActionIntent =
  | { kind: 'tap'; x: number; y: number }                       // 正規化座標 0..1
  | { kind: 'ropeGrab'; y: number }
  | { kind: 'ropeDrag'; deltaProgress: number }                 // 補正済み。下=正
  | { kind: 'ropeRelease' }
  | { kind: 'lockRelease' }
  | { kind: 'uiToggle'; control: 'mute' | 'quality' | 'exitFree' };

// ---- events（EventBus: on/off/emit、型付き） ----
export type GameEvent =
  | { type: 'phaseChanged'; from: GamePhase; to: GamePhase }
  | { type: 'transformProgress'; pair: TransformPair; p: StageTransformProgress; velocity: number }
  | { type: 'transformComplete'; pair: TransformPair }          // p=1.0スナップ時
  | { type: 'transformReset'; pair: TransformPair }             // p=0.0スナップ時
  | { type: 'lockReleased' }
  | { type: 'hintShown'; hint: 'tapFloor' | 'releaseLock' | 'pullRope' | 'choose' }
  | { type: 'beatStarted' | 'beatFinished'; beatId: string }
  | { type: 'qualityChanged'; tier: QualityTier }
  | { type: 'viewportChanged'; profile: ViewportProfile }
  | { type: 'audioCue'; cue: AudioCue; velocity?: number };

// ---- scenes ----
export interface SceneContext {
  three: { scene: Scene; camera: PerspectiveCamera; renderer: WebGLRenderer };
  bus: EventBus; quality: QualityTier; viewport: ViewportProfile;
}
export interface SceneModule {
  readonly id: SceneId | 'auditorium' | 'understage';
  init(ctx: SceneContext): Promise<void> | void;
  /** 毎フレーム。transform中の装置位置は p から決定的に設定する。 */
  update(dt: number, state: Readonly<GameStateSnapshot>): void;
  applyQuality(tier: QualityTier): void;
  dispose(): void;   // geometry/material/texture/RT/listener全解放
}

// ---- camera ----
export interface CameraPose { position: Vec3; target: Vec3; fov: number; }
export interface CinematicBeat {
  id: string; durationMs: number; from?: CameraPose; to: CameraPose;
  easing: 'linear' | 'easeInOut' | 'easeOut';
  reducedMotionScale?: number;  // Reduce Motion時のduration倍率（既定0.5）
}

// ---- quality / viewport ----
export type QualityTier = 'low' | 'medium' | 'high';
export interface ViewportProfile {
  width: number; height: number; dpr: number;             // dprはtierでcap済み
  orientation: 'portrait' | 'landscape';
  safeArea: { top: number; bottom: number; left: number; right: number };
}

// ---- audio ----
export type AudioCue =
  | 'knock3' | 'lockClick' | 'ropeCreak' | 'pulleySpin' | 'woodClatter'
  | 'flatSlide' | 'settleThud' | 'releaseSoft' | 'birds' | 'wind'
  | 'applause' | 'footlightsOn' | 'ambienceRoom' | 'ambienceUnder';
// 連続系cue（ropeCreak/pulleySpin/woodClatter/flatSlide）はvelocity(=dp/dt)で強度・速さ変調、velocity 0で無音。

// ---- state ----
export interface GameStateSnapshot {
  phase: GamePhase;
  pair: TransformPair;                 // 現在の変換ペア
  progress: StageTransformProgress;
  currentScene: SceneId;               // 完了済みの景
  quality: QualityTier; viewport: ViewportProfile;
  muted: boolean; reducedMotion: boolean;
}
```

## 責務境界

- **core（Integrator）**: 上記契約、EventBus、GameStateストア、clamp/スナップ規則、TRANSFORM_TIMELINE定数。
- **game（A）**: phase state machine、ActionIntent消費、progress更新、hint timer、choreography（pをTIMELINEで各装置の局所progressへ変換するヘルパ）。
- **scenes/camera（A）**: シーングラフ構築とbeat実行。装置メッシュの実体はrenderの材質APIを使って構築。
- **render/vfx/audio（B）**: 材質・テクスチャ生成API、QualityTier適用、renderer管理、AudioCue再生系。
- **input/ui（C）**: DOM/pointer→ActionIntent変換のみ。ゲームロジックを持たない。UIはGameEvent購読で表示更新。

## 不変条件（テスト対象）

1. 同じpを2回与えたら全装置は同一状態（決定性）。
2. `ropeDrag`が来ない限りpは変化しない（自走禁止。beat中の演出遷移はphaseで別扱い）。
3. p=0.5で旧袖・新袖が同時に可視。
4. orientation change前後で `phase/pair/progress` が不変。
5. dispose後にWebGLリソースリークなし（renderer.info確認）。
