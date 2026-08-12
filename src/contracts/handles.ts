/**
 * Operation-handle contract (render → input). Renderer registers the
 * screen-space location of every interactive 3D handle each frame; `input`
 * depends only on this registry, never on Three.js. See
 * ARCHITECTURE_CONTRACT.md § handles.ts.
 */

export type HandleId = 'sandGate' | 'pumpHandle' | 'wedge' | 'hammer' | 'replayButton';

export interface HandleInfo {
  id: HandleId;
  /** CSS px, screen space. */
  x: number;
  y: number;
  /** CSS px. Must be >= 48 (PRODUCT_SPEC primary touch target rule allows a larger practical corridor on top of this). */
  radius: number;
  axis: 'vertical' | 'horizontal' | 'free';
  /** Drag corridor range in CSS px, meaning depends on axis/handle. */
  range: number;
  /** Whether this handle currently accepts input (matches the active leg-phase's single verb). */
  active: boolean;
}

export interface HandleRegistry {
  set(h: HandleInfo): void;
  get(id: HandleId): HandleInfo | undefined;
  all(): HandleInfo[];
}

/**
 * Minimal in-memory HandleRegistry. Renderer calls `set` once per handle
 * per frame (last write wins); input reads via `get`/`all`. Deliberately
 * has no notion of "stale" entries — a handle that renderer stops writing
 * (e.g. leaves the active leg) simply keeps its last known transform until
 * overwritten, since callers gate on `active` rather than presence.
 */
export class DefaultHandleRegistry implements HandleRegistry {
  private readonly handles = new Map<HandleId, HandleInfo>();

  set(h: HandleInfo): void {
    this.handles.set(h.id, h);
  }

  get(id: HandleId): HandleInfo | undefined {
    return this.handles.get(id);
  }

  all(): HandleInfo[] {
    return [...this.handles.values()];
  }
}
