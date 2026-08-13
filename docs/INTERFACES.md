# INTERFACES — モジュール間契約（これが正）

変更したい場合はFable（親）承認の上、本ファイルを先に更新すること。
実装は `src/core/types.ts` にこの型を置き、全モジュールがそこからimportする。

```ts
// ===== 基本 =====
export type Quality = "low" | "medium" | "high";
export type TimeOfDay = "morning" | "noon" | "evening";
export type FoodKind = "vegetable" | "hay-cube" | "banana-stem" | "branch" | "grass";
export type SpotKind = "stone-gap" | "banyan-root" | "pipe" | "sand" | "high-branch";
export type BehaviorId = "probe-gap" | "dig-sand" | "reach-pipe" | "peel-banana" | "break-branch";
export type GamePhase = "boot" | "title" | "intro" | "hide" | "gate" | "seek" | "album";

export interface Vec3 { x: number; y: number; z: number; }

// ===== データ定義 (game/spots.ts, game/foods.ts) =====
export interface HidingSpot {
  id: SpotKind;                 // スポットは各種1つなので kind=id
  position: Vec3;               // ワールド座標のanchor（餌の最終収まり位置）
  approach: Vec3;               // ゾウの立ち位置
  cameraPreset: string;         // cameras.ts のプリセット名 "spot:<id>" 等
  acceptedFoodTypes: FoodKind[];
  elephantBehavior: BehaviorId;
  difficulty: number;           // 1..3 ヒント発火の早さ等に使用
  snapRadius: number;           // ワールド単位の吸着半径（大きめ）
}
export interface FoodDef {
  kind: FoodKind;
  label: string;                // ひらがな表示名（UIは絵が主、文字は添え物）
  color: string;
}

// ===== セッション (game/session.ts) =====
export interface HiddenFood { spotId: SpotKind; food: FoodKind; }
export interface SessionConfig {
  seed: number;
  guided: boolean;              // 初回ガイド
  freePlay: boolean;
  spots: SpotKind[];            // この回に使うスポット（guided: 3固定）
  timeOfDay: TimeOfDay;
}
export interface SessionState {
  config: SessionConfig;
  hidden: HiddenFood[];
  found: SpotKind[];            // ゾウが見つけ終えたスポット
  seekOrder: SpotKind[];        // seed から決まる探索順
}

// ===== FSM (core/fsm.ts) =====
export interface GameStateMachine {
  readonly phase: GamePhase;
  readonly freePlay: boolean;
  /** 不正遷移は無視して false を返す（throwしない） */
  transition(to: GamePhase): boolean;
  canTransition(to: GamePhase): boolean;
  onChange(cb: (phase: GamePhase, prev: GamePhase) => void): () => void;
}
// 正当な遷移: boot→title→intro→hide→gate→seek→album→hide(再/自由)
// album→title も可（ホームへ）。intro は2回目以降スキップして title→hide 可。

// ===== イベントバス (core/events.ts) =====
export interface GameEvents {
  "phase:changed":     { phase: GamePhase; prev: GamePhase };
  "food:picked":       { food: FoodKind };
  "food:hidden":       { spotId: SpotKind; food: FoodKind };   // 仕上げ操作完了時
  "hide:complete":     { count: number };
  "gate:opened":       {};
  "elephant:arrived":  { spotId: SpotKind };
  "behavior:start":    { behaviorId: BehaviorId; spotId: SpotKind };
  "behavior:complete": { behaviorId: BehaviorId; spotId: SpotKind };
  "seek:complete":     { behaviors: BehaviorId[] };
  "hint:show":         { spotId: SpotKind | null };
  "quality:changed":   { quality: Quality };
  "audio:unlocked":    {};
}
export interface EventBus {
  on<K extends keyof GameEvents>(k: K, cb: (p: GameEvents[K]) => void): () => void;
  emit<K extends keyof GameEvents>(k: K, p: GameEvents[K]): void;
  clear(): void;
}

// ===== クロック / tween (core/clock.ts, core/tween.ts) =====
export interface GameClock {
  timeScale: number;                       // QAで最大16
  readonly elapsed: number;                // scaled秒
  tick(rawDeltaSeconds: number): number;   // scaled dt を返す
  onTick(cb: (dt: number) => void): () => void;
}

// ===== RNG (core/rng.ts) =====
export interface Rng {
  readonly seed: number;
  next(): number;                // [0,1)
  range(min: number, max: number): number;
  int(min: number, max: number): number;   // 両端含む
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: readonly T[]): T[];
  fork(label: string): Rng;      // サブシステム毎に独立の列
}

// ===== シーン層が実装する契約 (scene/) =====
export interface WorldApi {
  update(dt: number): void;                       // clockから毎フレーム
  setQuality(q: Quality): void;
  setTimeOfDay(t: TimeOfDay): void;
  setReducedMotion(on: boolean): void;
  /** 餌メッシュをスポットへ収める（隠す演出の最終確定） */
  placeFood(spotId: SpotKind, food: FoodKind): void;
  clearFoods(): void;
  openGate(): Promise<void>;                      // 扉アニメ完了で resolve
  /** ゾウを歩かせ、行動を再生。behavior:start/complete をemitし、完了でresolve */
  elephantSeek(spotId: SpotKind, food: FoodKind): Promise<void>;
  elephantEnter(): Promise<void>;                 // 登場+短い嗅ぎ探索
  elephantIdleAt(pos: Vec3 | null): void;
  highlightSpot(spotId: SpotKind | null): void;   // ヒント微振動+局所光
  dispose(): void;
}

export interface CameraApi {
  /** presetへ滑らかに遷移。"overview"|"keeper"|"gate"|"album"|"spot:<id>"|"behavior:<id>"|"follow" */
  goTo(preset: string, opts?: { instant?: boolean }): Promise<void>;
  setOrientation(o: "portrait" | "landscape"): void;
  update(dt: number): void;
}

// ===== 音 (audio/) =====
export type SfxId =
  | "food-tuck" | "sand-cover" | "gate-open" | "trunk-pipe" | "leaf-rustle"
  | "banana-peel" | "branch-creak" | "branch-snap" | "found-chime"
  | "ui-tap" | "elephant-rumble";
export interface AudioApi {
  unlock(): void;                 // 初回ユーザー操作で呼ぶ（Safari対応）
  play(id: SfxId): void;
  setMuted(m: boolean): void;
  setAmbienceVolume(v: number): void;  // 0..1 園内環境音
  startAmbience(): void;
  suspend(): void; resume(): void;
}

// ===== 保存 (save/save.ts) =====
export interface SaveData {
  version: 1;
  firstPlayDone: boolean;
  freePlayUnlocked: boolean;
  observedBehaviors: BehaviorId[];   // アルバム蓄積
  settings: {
    muted: boolean;
    ambienceVolume: number;         // 0..1
    reducedMotion: boolean;         // ユーザー明示設定（OS設定とOR）
    dimLight: boolean;
    quality: Quality | "auto";
  };
}
// localStorage key: "elephant-hidden-feast:v1"。parse失敗時は既定値で復旧（throwしない）。

// ===== QA (debug/qa.ts) =====
export interface DebugApi {
  ready: boolean;                    // 初期化完了+最初のフレーム描画後 true
  getState(): unknown;               // { phase, session, quality, ... } JSON化可能
  setTimeScale(v: number): void;
  setQuality(v: Quality): void;
  jumpTo(phase: GamePhase): void;    // 必要な前提状態を自動構築して遷移
  playBehavior(id: BehaviorId): Promise<void>;
  reset(seed?: number): void;
  screenshotReady(): boolean;        // カメラ遷移・tween静止で true
}
// window.__ELEPHANT_GAME_DEBUG__ は ?qa=1 時のみ完全機能。
// 本番でも ready/getState のみ露出（E2E最小依存）。debug UIは本番非表示。
```

## URLパラメータ
`?qa=1&quality=low&timeScale=8&seed=42&act=seek&spot=sand&nosw=1`
- qa=1: QAモード（debug API全機能、SW登録スキップ可）
- quality / timeScale / seed: 起動時適用
- act: 起動後 jumpTo
- nosw=1: service worker登録をスキップ（E2Eの安定化）

## スポット座標（基準レイアウト、微調整可）
放飼場は半径 ~14 の楕円。ゲートは -Z 奥。
- stone-gap: 左奥 (-8, 0.9, -6) / sand: 中央手前 (0, 0.05, 4)
- pipe: 右 (7, 0.5, -1) / banyan-root: 左手前 (-6, 0.3, 3)
- high-branch: 右奥の高木 (8, 3.6, -7)
- 餌カート: 手前中央 (0, 0, 8) 付近。カメラ手前側が「観察デッキ」。
