import type { ActionIntent, InputSystem } from '../core';

/**
 * Null-object stub — owner C (mobile-qa) replaces this wholesale with real
 * pointer-event -> ActionIntent translation (rope-drag Y-only correction,
 * scroll/pinch suppression, GamePhase-driven mode switching) per
 * docs/CONTRACTS_ADDENDUM.md. This placeholder only wires pointerdown ->
 * 'tap' so the app boots end-to-end; it deliberately holds no game logic
 * (per docs/CONTRACTS.md boundary).
 */
export class NullInputSystem implements InputSystem {
  private element: HTMLElement | null = null;
  private callback: ((intent: ActionIntent) => void) | null = null;
  private mode: 'tap' | 'lock' | 'rope' | 'choice' | 'none' = 'none';

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const el = this.element;
    if (!el || !this.callback) return;
    const rect = el.getBoundingClientRect();
    const x = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
    this.callback({ kind: 'tap', x, y });
  };

  attach(el: HTMLElement): void {
    this.element = el;
    el.addEventListener('pointerdown', this.handlePointerDown);
  }

  onIntent(cb: (intent: ActionIntent) => void): void {
    this.callback = cb;
  }

  setMode(mode: 'tap' | 'lock' | 'rope' | 'choice' | 'none'): void {
    // TODO(owner C): branch pointer interpretation (rope-drag vs tap vs choice) on mode.
    this.mode = mode;
  }

  getMode(): 'tap' | 'lock' | 'rope' | 'choice' | 'none' {
    return this.mode;
  }

  dispose(): void {
    this.element?.removeEventListener('pointerdown', this.handlePointerDown);
    this.element = null;
    this.callback = null;
  }
}
