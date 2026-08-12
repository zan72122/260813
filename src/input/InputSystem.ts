/**
 * STUB — owner C (mobile-qa) owns src/input/**.
 * Real responsibility: pointer events -> ActionIntent, rope-drag correction
 * (Y-only, diagonal biasing), scroll/pinch suppression. This placeholder only
 * wires a pointerdown -> 'tap' ActionIntent so the app boots end-to-end;
 * it deliberately holds no game logic (per docs/CONTRACTS.md boundary).
 */
import type { ActionIntent } from '../core';

export class InputSystem {
  private element: HTMLElement | null = null;
  private onIntent: ((intent: ActionIntent) => void) | null = null;

  private readonly handlePointerDown = (event: PointerEvent): void => {
    const el = this.element;
    if (!el || !this.onIntent) return;
    const rect = el.getBoundingClientRect();
    const x = rect.width > 0 ? (event.clientX - rect.left) / rect.width : 0;
    const y = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0;
    this.onIntent({ kind: 'tap', x, y });
  };

  attach(element: HTMLElement, onIntent: (intent: ActionIntent) => void): () => void {
    this.element = element;
    this.onIntent = onIntent;
    element.addEventListener('pointerdown', this.handlePointerDown);
    return () => this.detach();
  }

  detach(): void {
    this.element?.removeEventListener('pointerdown', this.handlePointerDown);
    this.element = null;
    this.onIntent = null;
  }
}
