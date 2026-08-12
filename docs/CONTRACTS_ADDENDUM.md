# CONTRACTS_ADDENDUM — 領域間サービスインターフェース

Integratorが `src/core/interfaces.ts` に以下と同等のinterfaceを追加する（変更はIntegratorのみ）。
実装は各ownerの領域に置き、**consumer側はこのinterface型のみに依存**する。
Integratorは `SceneContext` を `services: { materials: MaterialLibrary; audio: AudioEngine; vfx: VfxSystem }`
を含むよう拡張し、main/app配線でインスタンスを生成・注入する。

```ts
import type { Material, Object3D } from 'three';
import type { AudioCue, QualityTier, SceneId, ActionIntent } from './types';

/** 実装: B → src/render/MaterialLibrary.ts */
export interface MaterialLibrary {
  /** 彩色平面装置。element: 'wing0'|'wing1'|'wing2'|'backdrop'|'border'|'foreground' */
  paintedFlat(scene: SceneId, element: string): Material;
  wood(kind: 'beam' | 'drum' | 'floor' | 'furniture' | 'pulley'): Material;
  rope(): Material;
  setRopeScroll(offset: number): void;   // rope travel(m)に比例したUVスクロール
  metal(): Material;
  goldTrim(): Material;
  auditorium(kind: 'wall' | 'seat' | 'marble' | 'curtain'): Material;
  applyQuality(tier: QualityTier): void;
  dispose(): void;
}

/** 実装: B → src/audio/AudioEngine.ts（全音は手続き合成、外部音源ファイル禁止） */
export interface AudioEngine {
  unlock(): Promise<void>;                              // 初回gestureで呼ぶ
  play(cue: AudioCue): void;                            // one-shot
  setContinuous(cue: AudioCue, velocity: number): void; // 連続音。velocity 0で無音
  setMuted(m: boolean): void;
  isMuted(): boolean;
  dispose(): void;
}

/** 実装: B → src/vfx/VfxSystem.ts */
export interface VfxSystem {
  attach(parent: Object3D): void;
  setDust(active: boolean): void;        // 地下の粉塵
  setGobo(intensity: number): void;      // 木漏れ日 0..1
  setFootlights(intensity: number): void;
  setBirds(active: boolean): void;
  update(dt: number): void;
  applyQuality(tier: QualityTier): void;
  dispose(): void;
}

/** 実装: C → src/input/InputSystem.ts */
export interface InputSystem {
  attach(el: HTMLElement): void;
  onIntent(cb: (intent: ActionIntent) => void): void;
  /** GamePhaseに応じた入力解釈の切替（app/gameが設定） */
  setMode(mode: 'tap' | 'lock' | 'rope' | 'choice' | 'none'): void;
  dispose(): void;
}

/** 実装: C → src/ui/UiSystem.ts（EventBus購読で表示更新、uiToggleはonIntent経由） */
export interface UiSystem {
  mount(root: HTMLElement, onIntent: (intent: ActionIntent) => void): void;
  dispose(): void;
}
```

## 利用規則

- A（scenes/camera/game）は `ctx.services.materials` で全材質を取得し、自前でmaterialを生成しない
  （プレースホルダ不可。ジオメトリ・メッシュ構築はAの責務）。
- 機構の回転・移動・ropeScroll値の計算はA（deriveTransformState使用）、材質・音・光粒子の中身はB。
- 音はAが `ctx.services.audio` を直接呼ぶ。連続音（ropeCreak等）はvelocity=dp/dtを渡す。
  appはbusの `audioCue` eventもengineへ転送する（どちらの経路も可）。
- Cの InputSystem はDOM層のみ。ゲームロジック（progress計算のstroke換算含む）は持たず、
  `ropeDrag.deltaProgress` への換算だけ MASTER_SPEC のストローク仕様定数で行う。
- 実装が未完成の間、Integratorのstubがこのinterfaceを満たすnull実装を提供し、常にコンパイル可能を保つ。
