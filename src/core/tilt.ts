import { clamp, damp } from './math';

export interface Vec2 {
  x: number;
  y: number;
}

export type TiltSource = 'idle' | 'drag' | 'device';

/** Degrees of physical tilt that map to the full ±1 range. Small, so a kid barely moves. */
export const TILT_RANGE_DEG = 22;

/**
 * Turn raw `deviceorientation` angles into a screen-space tilt vector.
 * `screenAngle` is `screen.orientation.angle`, so the mapping keeps working
 * when the device is held in landscape.
 */
export function mapOrientationToTilt(
  beta: number,
  gamma: number,
  baseline: Vec2,
  screenAngle = 0,
): Vec2 {
  const rad = (screenAngle * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const g = gamma - baseline.x;
  const b = beta - baseline.y;
  const x = g * c + b * s;
  const y = b * c - g * s;
  return {
    x: clamp(x / TILT_RANGE_DEG, -1, 1),
    y: clamp(y / TILT_RANGE_DEG, -1, 1),
  };
}

/** Gentle never-ending sway, so the rainbow keeps moving even if nobody touches it. */
export function idleSway(t: number, amp = 1): Vec2 {
  return {
    x: amp * (0.46 * Math.sin(t * 0.85) + 0.16 * Math.sin(t * 2.13 + 1.1)),
    y: amp * (0.3 * Math.sin(t * 0.61 + 1.7) + 0.1 * Math.sin(t * 1.77)),
  };
}

/** Drag distance in px -> tilt, normalised by the card size so it feels the same on any screen. */
export function mapDragToTilt(dx: number, dy: number, cardW: number, cardH: number): Vec2 {
  return {
    x: clamp(dx / (cardW * 0.55), -1, 1),
    y: clamp(-dy / (cardH * 0.5), -1, 1),
  };
}

interface DeviceOrientationEventStatic {
  requestPermission?: () => Promise<'granted' | 'denied' | 'default'>;
}

export function deviceTiltNeedsPermission(): boolean {
  const ctor = (globalThis as { DeviceOrientationEvent?: DeviceOrientationEventStatic })
    .DeviceOrientationEvent;
  return typeof ctor?.requestPermission === 'function';
}

export function deviceTiltSupported(): boolean {
  return typeof globalThis !== 'undefined' && 'DeviceOrientationEvent' in globalThis;
}

/**
 * Owns the single tilt value the whole game reads. Sources blend smoothly:
 * a finger drag takes over instantly, and letting go eases back into the idle
 * sway instead of snapping.
 */
export class TiltController {
  value: Vec2 = { x: 0, y: 0 };
  source: TiltSource = 'idle';
  deviceEnabled = false;

  private dragging = false;
  private dragTarget: Vec2 = { x: 0, y: 0 };
  private deviceTarget: Vec2 = { x: 0, y: 0 };
  private baseline: Vec2 | null = null;
  private clock = 0;
  private handler: ((e: DeviceOrientationEvent) => void) | null = null;

  update(dt: number, idleAmp = 1): Vec2 {
    this.clock += dt;
    let target: Vec2;
    let rate: number;

    if (this.dragging) {
      target = this.dragTarget;
      rate = 14;
      this.source = 'drag';
    } else if (this.deviceEnabled) {
      const sway = idleSway(this.clock, idleAmp * 0.22);
      target = { x: this.deviceTarget.x + sway.x, y: this.deviceTarget.y + sway.y };
      rate = 9;
      this.source = 'device';
    } else {
      target = idleSway(this.clock, idleAmp);
      rate = 2.6;
      this.source = 'idle';
    }

    this.value = {
      x: damp(this.value.x, clamp(target.x, -1.2, 1.2), rate, dt),
      y: damp(this.value.y, clamp(target.y, -1.2, 1.2), rate, dt),
    };
    return this.value;
  }

  beginDrag(): void {
    this.dragging = true;
  }

  setDrag(v: Vec2): void {
    this.dragTarget = v;
  }

  endDrag(): void {
    this.dragging = false;
  }

  /** Re-zero the device baseline to however the child happens to be holding it. */
  recentre(): void {
    this.baseline = null;
  }

  async enableDeviceTilt(): Promise<boolean> {
    if (!deviceTiltSupported()) return false;
    const ctor = (globalThis as { DeviceOrientationEvent?: DeviceOrientationEventStatic })
      .DeviceOrientationEvent;
    if (typeof ctor?.requestPermission === 'function') {
      try {
        const res = await ctor.requestPermission();
        if (res !== 'granted') return false;
      } catch {
        return false;
      }
    }
    if (this.handler) return true;
    this.handler = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      if (!this.baseline) this.baseline = { x: e.gamma, y: e.beta };
      const angle = (globalThis.screen?.orientation?.angle ?? 0) as number;
      this.deviceTarget = mapOrientationToTilt(e.beta, e.gamma, this.baseline, angle);
      this.deviceEnabled = true;
    };
    globalThis.addEventListener('deviceorientation', this.handler);
    return true;
  }

  dispose(): void {
    if (this.handler) globalThis.removeEventListener('deviceorientation', this.handler);
    this.handler = null;
  }
}
