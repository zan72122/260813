/**
 * Pure drag-state wrapper around the frozen `mapVerticalDrag` gesture-math
 * (src/input/gestures.ts). Kept DOM-free so the drag -> intent-value
 * round-trip is unit-testable without a browser. `EiffelUiLayer` owns one
 * instance per vertical control (master lever, up-throttle track visuals
 * are simple press buttons and don't need this).
 */

import { mapVerticalDrag } from '../input/gestures.ts';

export class LeverDragController {
  private readonly pixelRange: number;
  private dragging = false;
  private startY = 0;
  private startValue = 0;
  private value: number;

  constructor(pixelRange: number, initialValue = 0) {
    this.pixelRange = pixelRange;
    this.value = clamp01(initialValue);
  }

  get isDragging(): boolean {
    return this.dragging;
  }

  /** Current value, whether from an active drag or the last `setValue`. */
  getValue(): number {
    return this.value;
  }

  /** Reflect an externally-driven value (e.g. the snapshot) while not dragging. */
  setValue(value: number): void {
    if (this.dragging) return;
    this.value = clamp01(value);
  }

  /** Begin a drag at `startY`, anchored to the current value. */
  begin(startY: number): void {
    this.dragging = true;
    this.startY = startY;
    this.startValue = this.value;
  }

  /** Continue an active drag; no-op (returns current value) if not dragging. */
  move(currentY: number): number {
    if (!this.dragging) return this.value;
    this.value = mapVerticalDrag(this.startY, currentY, this.pixelRange, this.startValue);
    return this.value;
  }

  /** End the active drag; the last dragged value is retained. */
  end(): void {
    this.dragging = false;
  }
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
