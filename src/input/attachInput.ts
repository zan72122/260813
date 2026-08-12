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
import type { AttachInputOptions, InputHandle, IntentSink } from './types';

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

  let gesture: ActiveGesture | null = null;

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

  function onPointerDown(ev: Event): void {
    if (gesture !== null) return; // one pointer at a time — first wins (multi-touch safety)
    const pe = ev as PointerEvent;
    if (getState?.()?.paused) return;

    const x = pe.clientX;
    const y = pe.clientY;
    const handle = closestActiveHandle(handles, x, y);

    if (typeof pe.preventDefault === 'function') pe.preventDefault();
    tryCapture(pe.pointerId);

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
  }

  /** pointercancel/pointerleave: clean release, never fires a gesture's *completion* — see module doc. */
  function onPointerCancel(ev: Event): void {
    if (!gesture) return;
    const pe = ev as PointerEvent;
    if (pe.pointerId !== gesture.pointerId) return;
    const g = gesture;

    if (g.kind === 'sandGate') {
      gateCoalescer.flushNow();
      sink.applyIntent({ type: 'gateSet', open: 0 });
    } else if (g.kind === 'wedge') {
      wedgeCoalescer.flushNow();
      sink.applyIntent({ type: 'wedgeRelease' });
    }

    releaseCapture(pe.pointerId);
    gesture = null;
  }

  const bound: [string, (ev: Event) => void][] = [
    ['pointerdown', onPointerDown],
    ['pointermove', onPointerMove],
    ['pointerup', onPointerUp],
    ['pointercancel', onPointerCancel],
    ['pointerleave', onPointerCancel],
  ];
  for (const [type, fn] of bound) root.addEventListener(type, fn);

  return {
    dispose(): void {
      for (const [type, fn] of bound) root.removeEventListener(type, fn);
      gateCoalescer.cancel();
      wedgeCoalescer.cancel();
      gesture = null;
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
