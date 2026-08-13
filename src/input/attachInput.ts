/**
 * Pointer → Intent translation. Reads ONLY the HandleRegistry (screen-space
 * transforms the renderer publishes each frame) and emits Intents into the
 * provided sink — see ARCHITECTURE_CONTRACT.md §handles.ts. No Three.js
 * import anywhere in this module.
 *
 * One gesture at a time, tracked as a small discriminated union
 * (`ActiveGesture`): the first pointerdown that lands on an *active*
 * handle's generous grab radius (PRODUCT_SPEC "近接吸着...半径96px", widened
 * further to at least the handle's own declared radius) claims the single
 * gesture slot; every other pointer is ignored until release
 * (multi-touch safety). A pointerdown that lands on no active handle at
 * all still claims the slot as an "anywhere tap" candidate, so a light tap
 * anywhere during a cinematic (no handle active) resolves to `advance` on
 * release — PRODUCT_SPEC/intents.ts "advance...演出スキップ相当の軽タップ
 * (罰なし)".
 *
 * "Never punish" is structural, not an afterthought bolted on per-gesture:
 * every release path (pointerup AND pointercancel/pointerleave) always
 * clears the gesture slot and, for the two continuous drag gestures
 * (sandGate, wedge), always sends the input back to its safe rest value
 * (`gateSet(0)` / `wedgeRelease`) — a cancelled OS gesture can never leave
 * the sand gate stuck open or the wedge stuck mid-drag. `setPointerCapture`
 * is attempted (best-effort, guarded) on grab so a drag that wanders
 * outside the element's bounds keeps delivering move/up events instead of
 * silently going stale; `pointerleave` is still handled as a defensive
 * fallback wherever capture isn't available.
 */
import type { HandleId, HandleInfo, HandleRegistry } from '../contracts/handles';
import {
  PUMP_STROKE_THRESHOLD,
  TAP_MOVEMENT_TOLERANCE,
  applyMagneticEase,
  clamp01,
  distance,
  projectAlongAxis,
  withinGrabRadius,
} from './geometry';
import type { AttachInputOptions, EventTargetLike, InputHandle, IntentSink } from './types';

type Axis = HandleInfo['axis'];

type ActiveGesture =
  | { kind: 'sandGate'; pointerId: number; baselineY: number; range: number }
  | { kind: 'pump'; pointerId: number; baselineY: number; phase: 'neutral' | 'halfDone'; halfDoneDir: 1 | -1 | 0 }
  | { kind: 'wedge'; pointerId: number; startX: number; startY: number; axis: Axis; range: number }
  | { kind: 'hammerTap'; pointerId: number; startX: number; startY: number }
  | { kind: 'replayTap'; pointerId: number; startX: number; startY: number }
  | { kind: 'anywhereTap'; pointerId: number; startX: number; startY: number };

/**
 * Coalesces a rapidly-updating continuous value down to at most one
 * `flush` call per animation frame ("continuous emission throttled to
 * per-frame"). Falls back to flushing synchronously and immediately
 * wherever `requestAnimationFrame` is unavailable (Node/Vitest — this keeps
 * unit tests fully synchronous and deterministic; the browser production
 * path always has rAF).
 */
function createFrameCoalescer(flush: (value: number) => void): {
  queue(value: number): void;
  flushNow(): void;
  cancel(): void;
} {
  let pendingValue: number | null = null;
  let scheduledId: number | null = null;

  function run(): void {
    scheduledId = null;
    if (pendingValue !== null) {
      const v = pendingValue;
      pendingValue = null;
      flush(v);
    }
  }

  return {
    queue(value: number): void {
      pendingValue = value;
      if (scheduledId !== null) return;
      if (typeof requestAnimationFrame === 'function') {
        scheduledId = requestAnimationFrame(run);
      } else {
        run();
      }
    },
    flushNow(): void {
      if (typeof cancelAnimationFrame === 'function' && scheduledId !== null) {
        cancelAnimationFrame(scheduledId);
      }
      scheduledId = null;
      run();
    },
    cancel(): void {
      if (typeof cancelAnimationFrame === 'function' && scheduledId !== null) {
        cancelAnimationFrame(scheduledId);
      }
      scheduledId = null;
      pendingValue = null;
    },
  };
}

function closestActiveHandle(handles: HandleRegistry, x: number, y: number): HandleInfo | undefined {
  let closest: HandleInfo | undefined;
  let closestDist = Infinity;
  for (const h of handles.all()) {
    if (!h.active) continue;
    if (!withinGrabRadius(h, x, y)) continue;
    const d = distance(x, y, h.x, h.y);
    if (d < closestDist) {
      closestDist = d;
      closest = h;
    }
  }
  return closest;
}

/**
 * F5 (review round 1) palm-rejection tuning. A resting palm landing a
 * fraction of a second before (or after) the real fingertip touch is a
 * known failure mode of "first pointerdown wins": these thresholds decide
 * when a *second* pointerdown looks enough like "the real touch, palm
 * arrived first" to justify transferring the gesture slot, without ever
 * weakening ordinary first-wins single-finger/multi-touch-safety behavior
 * (see the module doc comment's "one gesture at a time" rule — this is a
 * narrow, additive exception to it, not a replacement).
 */
const PALM_TRANSFER_WINDOW_MS = 150;
/** How far (CSS px) the first (already-claimed) pointer may have moved since its own down and still be considered "a resting palm, not an intentional drag". */
const PALM_STATIONARY_TOLERANCE = 6;
/** `PointerEvent.width`/`height` (CSS px) above which a contact reads as a palm rather than a fingertip. Real fingertips are typically ~8-12px; a resting palm is much larger. Pointer types that never report width/height (most mice, some touch stacks) simply never qualify — see `isLargeContact`. */
const PALM_CONTACT_SIZE = 30;

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/** True only when `PointerEvent.width`/`height` are both present AND at least one exceeds the palm-contact threshold — absent fields (common: mouse, and some touch backends) never qualify, so environments/tests that don't set them see no behavior change at all. */
function isLargeContact(pe: PointerEvent): boolean {
  const w = pe.width;
  const h = pe.height;
  if (typeof w !== 'number' || typeof h !== 'number') return false;
  return w > PALM_CONTACT_SIZE || h > PALM_CONTACT_SIZE;
}

function gestureKindForHandle(id: HandleId): ActiveGesture['kind'] | undefined {
  switch (id) {
    case 'sandGate':
      return 'sandGate';
    case 'pumpHandle':
      return 'pump';
    case 'wedge':
      return 'wedge';
    case 'hammer':
      return 'hammerTap';
    case 'replayButton':
      return 'replayTap';
    default:
      return undefined;
  }
}

/**
 * Attaches pointer gesture recognition to `root`, translating gestures into
 * Intents (contracts/intents.ts) sent to `sink`. See module doc for the
 * grab/multi-touch/never-punish rules. Returns `{ dispose() }` to remove
 * every listener and release any in-progress gesture.
 */
export function attachInput(options: AttachInputOptions): InputHandle {
  const { root, handles, sink, getState } = options;
  const viewport: EventTargetLike | undefined =
    options.viewport ?? (typeof window !== 'undefined' ? window : undefined);

  let gesture: ActiveGesture | null = null;
  /** F5: metadata about whoever currently holds `gesture`'s pointer slot, tracked alongside it purely to judge a later second pointerdown's palm-transfer eligibility — see `shouldTransferToNewPointer`. */
  let firstMeta: {
    pointerId: number;
    downTimeMs: number;
    downX: number;
    downY: number;
    lastX: number;
    lastY: number;
    large: boolean;
  } | null = null;

  const gateCoalescer = createFrameCoalescer((open) => {
    sink.applyIntent({ type: 'gateSet', open });
  });
  const wedgeCoalescer = createFrameCoalescer((progress) => {
    sink.applyIntent({ type: 'wedgeDrag', progress });
  });

  function tryCapture(pointerId: number): void {
    try {
      root.setPointerCapture?.(pointerId);
    } catch {
      // Best-effort only — a fake test target or an environment without
      // capture support must never crash gesture recognition.
    }
  }

  function releaseCapture(pointerId: number): void {
    try {
      root.releasePointerCapture?.(pointerId);
    } catch {
      // ignore — see tryCapture.
    }
  }

  function startGesture(handle: HandleInfo, pointerId: number, x: number, y: number): ActiveGesture | undefined {
    const kind = gestureKindForHandle(handle.id);
    switch (kind) {
      case 'sandGate':
        return { kind: 'sandGate', pointerId, baselineY: y, range: Math.max(1, handle.range) };
      case 'pump':
        return { kind: 'pump', pointerId, baselineY: y, phase: 'neutral', halfDoneDir: 0 };
      case 'wedge':
        return {
          kind: 'wedge',
          pointerId,
          startX: x,
          startY: y,
          axis: handle.axis,
          range: Math.max(1, handle.range),
        };
      case 'hammerTap':
        return { kind: 'hammerTap', pointerId, startX: x, startY: y };
      case 'replayTap':
        return { kind: 'replayTap', pointerId, startX: x, startY: y };
      default:
        return undefined;
    }
  }

  /**
   * F5: whether an incoming pointerdown on a NEW pointer, while `gesture`
   * already holds the slot for `firstMeta.pointerId`, looks like "a resting
   * palm claimed the slot first, and this is the real touch arriving
   * shortly after" — see the constants' own doc comment for the individual
   * thresholds. ALL of these must hold, so any environment/test that never
   * reports `width`/`height` (the overwhelming majority — see
   * `isLargeContact`) never transfers, leaving ordinary first-wins
   * multi-touch-safety behavior completely unchanged.
   *
   * Deliberately does NOT gate on `PointerEvent.isPrimary`: per the Pointer
   * Events spec, `isPrimary` reflects touch ORDER (whichever pointer of a
   * type became active first stays primary while others of that type are
   * still down), not confidence-of-intent — in the exact palm-then-finger
   * scenario this exists to fix, the palm touched down FIRST and so is the
   * one left `isPrimary:true`, while the real finger arriving moments later
   * is `isPrimary:false`. Requiring the incoming pointer to be primary
   * would make this transfer path dead code in precisely the case it is
   * meant to handle, so "prefer isPrimary touches" is honored at the
   * policy level instead — the untouched default (this function returning
   * `false`) already always prefers whichever pointer is currently primary
   * (first-wins), and this is the one narrow, evidence-gated exception.
   */
  function shouldTransferToNewPointer(pe: PointerEvent): boolean {
    if (!firstMeta || pe.pointerId === firstMeta.pointerId) return false;
    if (now() - firstMeta.downTimeMs > PALM_TRANSFER_WINDOW_MS) return false;
    if (distance(firstMeta.lastX, firstMeta.lastY, firstMeta.downX, firstMeta.downY) > PALM_STATIONARY_TOLERANCE) {
      return false;
    }
    return firstMeta.large;
  }

  /** Ends whatever gesture is currently active exactly like `pointercancel` (never-punish release semantics — module doc). Shared by pointercancel/pointerleave, the F4 viewport-change handler, and the F5 palm-transfer path. */
  function endGestureCleanly(pointerIdToRelease: number): void {
    if (!gesture) return;
    if (gesture.kind === 'sandGate') {
      gateCoalescer.flushNow();
      sink.applyIntent({ type: 'gateSet', open: 0 });
    } else if (gesture.kind === 'wedge') {
      wedgeCoalescer.flushNow();
      sink.applyIntent({ type: 'wedgeRelease' });
    }
    releaseCapture(pointerIdToRelease);
    gesture = null;
    firstMeta = null;
  }

  function onPointerDown(ev: Event): void {
    const pe = ev as PointerEvent;

    if (gesture !== null) {
      // Normally a second touch while one gesture is active is ignored
      // entirely (multi-touch safety) — F5's narrow exception: a resting
      // palm claiming the slot first, with the real fingertip landing
      // shortly after, transfers the slot to the new pointer instead.
      // Never transfers while paused either — same "no new grabs" rule as
      // the first-ever claim below.
      const heldByPointerId = gesture.pointerId;
      if (getState?.()?.paused) return;
      if (!shouldTransferToNewPointer(pe)) return;
      endGestureCleanly(heldByPointerId);
    } else if (getState?.()?.paused) {
      return;
    }

    const x = pe.clientX;
    const y = pe.clientY;
    const handle = closestActiveHandle(handles, x, y);

    if (typeof pe.preventDefault === 'function') pe.preventDefault();
    tryCapture(pe.pointerId);

    firstMeta = {
      pointerId: pe.pointerId,
      downTimeMs: now(),
      downX: x,
      downY: y,
      lastX: x,
      lastY: y,
      large: isLargeContact(pe),
    };

    if (!handle) {
      gesture = { kind: 'anywhereTap', pointerId: pe.pointerId, startX: x, startY: y };
      return;
    }
    gesture = startGesture(handle, pe.pointerId, x, y) ?? { kind: 'anywhereTap', pointerId: pe.pointerId, startX: x, startY: y };
  }

  function onPointerMove(ev: Event): void {
    if (!gesture) return;
    const pe = ev as PointerEvent;
    if (pe.pointerId !== gesture.pointerId) return; // extra touches ignored safely

    const x = pe.clientX;
    const y = pe.clientY;

    if (firstMeta?.pointerId === pe.pointerId) {
      firstMeta.lastX = x;
      firstMeta.lastY = y;
    }

    switch (gesture.kind) {
      case 'sandGate': {
        const dy = y - gesture.baselineY; // downward displacement (+) opens the gate
        gateCoalescer.queue(clamp01(dy / gesture.range));
        break;
      }
      case 'pump': {
        const dy = y - gesture.baselineY;
        if (gesture.phase === 'neutral') {
          if (Math.abs(dy) >= PUMP_STROKE_THRESHOLD) {
            gesture.phase = 'halfDone';
            gesture.halfDoneDir = dy > 0 ? 1 : -1;
            gesture.baselineY = y; // measure the return half-stroke from here
          }
        } else {
          const neededDir = gesture.halfDoneDir === 1 ? -1 : 1;
          if (dy * neededDir >= PUMP_STROKE_THRESHOLD) {
            sink.applyIntent({ type: 'jackStroke' }); // exactly one full down+up (or up+down) cycle confirmed
            gesture.phase = 'neutral';
            gesture.halfDoneDir = 0;
            gesture.baselineY = y; // re-arm for the next cycle
          }
        }
        break;
      }
      case 'wedge': {
        const dx = x - gesture.startX;
        const dy = y - gesture.startY;
        const raw = clamp01(projectAlongAxis(gesture.axis, dx, dy) / gesture.range);
        wedgeCoalescer.queue(applyMagneticEase(raw));
        break;
      }
      case 'hammerTap':
      case 'replayTap':
      case 'anywhereTap':
        break; // tap-vs-drag is decided on release, from total movement
    }
  }

  function withinTapTolerance(g: { startX: number; startY: number }, x: number, y: number): boolean {
    return distance(x, y, g.startX, g.startY) <= TAP_MOVEMENT_TOLERANCE;
  }

  function onPointerUp(ev: Event): void {
    if (!gesture) return;
    const pe = ev as PointerEvent;
    if (pe.pointerId !== gesture.pointerId) return;
    const g = gesture;
    const x = pe.clientX;
    const y = pe.clientY;

    switch (g.kind) {
      case 'sandGate':
        gateCoalescer.flushNow();
        sink.applyIntent({ type: 'gateSet', open: 0 }); // release => valve springs shut
        break;
      case 'pump':
        break; // mid-stroke abandonment earns no credit — safe, never punished
      case 'wedge':
        wedgeCoalescer.flushNow();
        sink.applyIntent({ type: 'wedgeRelease' });
        break;
      case 'hammerTap':
        if (withinTapTolerance(g, x, y)) sink.applyIntent({ type: 'hammerTap' });
        break;
      case 'replayTap':
        if (withinTapTolerance(g, x, y)) sink.applyIntent({ type: 'replay' });
        break;
      case 'anywhereTap':
        if (withinTapTolerance(g, x, y)) sink.applyIntent({ type: 'advance' });
        break;
    }

    releaseCapture(pe.pointerId);
    gesture = null;
    firstMeta = null;
  }

  /** pointercancel/pointerleave: clean release, never fires a gesture's *completion* — see module doc. */
  function onPointerCancel(ev: Event): void {
    if (!gesture) return;
    const pe = ev as PointerEvent;
    if (pe.pointerId !== gesture.pointerId) return;
    endGestureCleanly(pe.pointerId);
  }

  /**
   * F4: window resize/orientationchange mid-gesture — a handle's on-screen
   * position (contracts/handles.ts's `HandleInfo`) is about to move out
   * from under wherever the gesture's baseline/start coordinates were
   * captured, so a subsequent `pointermove` would read as a spurious jump
   * (a rotation can slam `gateOpen` to 0/1 or the wedge to a random
   * progress in one frame). No pointerId to check here — a viewport change
   * ends whatever gesture is active, unconditionally, exactly like
   * `pointercancel`: never punished, gate eases back to released, wedge
   * releases.
   */
  function onViewportChange(): void {
    if (!gesture) return;
    endGestureCleanly(gesture.pointerId);
  }

  const bound: [string, (ev: Event) => void][] = [
    ['pointerdown', onPointerDown],
    ['pointermove', onPointerMove],
    ['pointerup', onPointerUp],
    ['pointercancel', onPointerCancel],
    ['pointerleave', onPointerCancel],
  ];
  for (const [type, fn] of bound) root.addEventListener(type, fn);

  const viewportBound: [string, (ev: Event) => void][] = [
    ['resize', onViewportChange],
    ['orientationchange', onViewportChange],
  ];
  if (viewport) {
    for (const [type, fn] of viewportBound) viewport.addEventListener(type, fn);
  }

  return {
    dispose(): void {
      for (const [type, fn] of bound) root.removeEventListener(type, fn);
      if (viewport) {
        for (const [type, fn] of viewportBound) viewport.removeEventListener(type, fn);
      }
      gateCoalescer.cancel();
      wedgeCoalescer.cancel();
      gesture = null;
      firstMeta = null;
    },
  };
}

/**
 * A plain callback for the "もう一回" DOM overlay button (UX/audio owner,
 * `src/ui`) to call directly on click — an alternative to (or in addition
 * to) tapping the in-scene `replayButton` handle, since the DOM button
 * isn't necessarily routed through the canvas gesture pipeline above.
 * `replayInjector(sink)()` sends the exact same `{type:'replay'}` Intent
 * through the exact same `sink.applyIntent` entry point.
 */
export function replayInjector(sink: IntentSink): () => void {
  return () => {
    sink.applyIntent({ type: 'replay' });
  };
}
