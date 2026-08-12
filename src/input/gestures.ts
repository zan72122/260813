/**
 * Frozen single-finger gesture-math mini-API (ARCHITECTURE_CONTRACT "Wiring
 * conventions"). Pure math only — no DOM, no event listeners, no globals —
 * so it is usable both by `src/ui` (the sanctioned cross-owner import) and
 * by this module's own unit tests without a browser environment.
 */

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/**
 * Master-lever / throttle drag gesture: a vertical drag of `currentY -
 * startY` pixels (screen coordinates, y grows downward) starting from
 * `startValue`, mapped through a linear `pixelRange`-pixel throw. Dragging
 * UP (decreasing Y) increases the returned value. Clamped to `[0, 1]`.
 *
 * `pixelRange <= 0` (degenerate control geometry) returns `startValue`
 * clamped, rather than dividing by zero.
 */
export function mapVerticalDrag(
  startY: number,
  currentY: number,
  pixelRange: number,
  startValue: number,
): number {
  const clampedStart = clamp01(startValue);
  if (!(pixelRange > 0) || !Number.isFinite(startY) || !Number.isFinite(currentY)) {
    return clampedStart;
  }
  const draggedUp = startY - currentY; // positive when the finger moves up
  return clamp01(clampedStart + draggedUp / pixelRange);
}

/** Wrap an angle (radians) into `(-PI, PI]`. */
function wrapAngle(angleRad: number): number {
  const twoPi = 2 * Math.PI;
  let wrapped = angleRad % twoPi;
  if (wrapped > Math.PI) wrapped -= twoPi;
  if (wrapped <= -Math.PI) wrapped += twoPi;
  return wrapped;
}

/**
 * Level-wheel rotation gesture: the shortest-arc signed angle (radians) the
 * finger swept around pivot `(cx, cy)` between the previous touch point
 * `(prevX, prevY)` and the current one `(x, y)`.
 *
 * SIGN CONVENTION (screen/DOM pixel coordinates, y grows downward):
 * **positive = clockwise as the player sees it on screen.** This falls out
 * of using `atan2(y - cy, x - cx)` directly in y-down pixel space (the same
 * expression would read counterclockwise-positive in a math y-up plane —
 * screen coordinates flip that sense). A player dragging the wheel's right
 * edge downward (a clockwise turn on screen) therefore yields a positive
 * `deltaRadians`; dragging it upward (counterclockwise) yields negative.
 * `src/game/leveling.ts` only consumes the *magnitude* of wheel input (any
 * turning direction boosts the assist — see its module doc), so this sign
 * is exposed for `src/ui`'s wheel-graphic rotation, not consumed directionally
 * by the leveling math itself.
 *
 * Degenerate input (finger exactly on the pivot) yields `0` for that
 * sample's angle rather than `NaN` (`Math.atan2(0, 0) === 0`).
 */
export function rotationDeltaRadians(
  cx: number,
  cy: number,
  prevX: number,
  prevY: number,
  x: number,
  y: number,
): number {
  const prevAngle = Math.atan2(prevY - cy, prevX - cx);
  const angle = Math.atan2(y - cy, x - cx);
  const delta = wrapAngle(angle - prevAngle);
  return Number.isFinite(delta) ? delta : 0;
}

/**
 * Debounce for double-tap / button-mash protection (PRODUCT_SPEC "Button
 * mashing / double taps never double-trigger state transitions"). Stateful
 * but otherwise pure — takes wall-clock time as an explicit argument rather
 * than reading it itself, so it stays trivially testable.
 */
export class TapGuard {
  private readonly minIntervalMs: number;
  private lastFireMs: number | null = null;

  constructor(minIntervalMs = 350) {
    this.minIntervalMs = minIntervalMs;
  }

  /** Whether a tap at `nowMs` is allowed to fire; if so, records it as the new last-fire time. */
  canFire(nowMs: number): boolean {
    if (this.lastFireMs !== null && nowMs - this.lastFireMs < this.minIntervalMs) {
      return false;
    }
    this.lastFireMs = nowMs;
    return true;
  }
}
