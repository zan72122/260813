import { describe, expect, it } from 'vitest';
import {
  TILT_RANGE_DEG,
  TiltController,
  idleSway,
  mapDragToTilt,
  mapOrientationToTilt,
} from '../../src/core/tilt';

const ZERO = { x: 0, y: 0 };

describe('mapOrientationToTilt', () => {
  it('reads flat as neutral', () => {
    expect(mapOrientationToTilt(0, 0, ZERO)).toEqual({ x: 0, y: 0 });
  });

  it('reaches full deflection at the range limit', () => {
    expect(mapOrientationToTilt(0, TILT_RANGE_DEG, ZERO).x).toBeCloseTo(1, 5);
    expect(mapOrientationToTilt(TILT_RANGE_DEG, 0, ZERO).y).toBeCloseTo(1, 5);
  });

  it('clamps rather than letting a big tilt run away', () => {
    const t = mapOrientationToTilt(180, 90, ZERO);
    expect(t.x).toBeLessThanOrEqual(1);
    expect(t.y).toBeLessThanOrEqual(1);
  });

  it('subtracts the baseline, so any comfortable holding angle is neutral', () => {
    const baseline = { x: 12, y: -30 };
    const t = mapOrientationToTilt(-30, 12, baseline);
    expect(t.x).toBeCloseTo(0, 5);
    expect(t.y).toBeCloseTo(0, 5);
  });

  it('rotates with the screen so landscape still tilts the right way', () => {
    const portrait = mapOrientationToTilt(0, TILT_RANGE_DEG, ZERO, 0);
    const landscape = mapOrientationToTilt(0, TILT_RANGE_DEG, ZERO, 90);
    expect(portrait.x).toBeCloseTo(1, 5);
    expect(portrait.y).toBeCloseTo(0, 5);
    // the same physical tilt now shows up on the other axis
    expect(landscape.x).toBeCloseTo(0, 5);
    expect(landscape.y).toBeCloseTo(-1, 5);
  });
});

describe('mapDragToTilt', () => {
  it('is neutral with no movement', () => {
    const t = mapDragToTilt(0, 0, 300, 428);
    // the y axis is negated, so this is -0; compare numerically
    expect(t.x).toBeCloseTo(0, 10);
    expect(t.y).toBeCloseTo(0, 10);
  });

  it('inverts the vertical axis so dragging down tips the top away', () => {
    expect(mapDragToTilt(0, 100, 300, 428).y).toBeLessThan(0);
    expect(mapDragToTilt(0, -100, 300, 428).y).toBeGreaterThan(0);
  });

  it('normalises by card size, so it feels the same on any screen', () => {
    const small = mapDragToTilt(30, 0, 150, 214);
    const large = mapDragToTilt(60, 0, 300, 428);
    expect(small.x).toBeCloseTo(large.x, 5);
  });

  it('clamps at the extremes', () => {
    expect(mapDragToTilt(10000, 0, 300, 428).x).toBe(1);
    expect(mapDragToTilt(-10000, 0, 300, 428).x).toBe(-1);
  });
});

describe('idleSway', () => {
  it('stays within the unit range', () => {
    for (let t = 0; t < 60; t += 0.37) {
      const s = idleSway(t);
      expect(Math.abs(s.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(s.y)).toBeLessThanOrEqual(1);
    }
  });

  it('actually moves, so the rainbow is never frozen', () => {
    const a = idleSway(0);
    const b = idleSway(1.5);
    expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeGreaterThan(0.05);
  });

  it('scales with amplitude', () => {
    expect(Math.abs(idleSway(1, 0.2).x)).toBeLessThan(Math.abs(idleSway(1, 1).x));
  });
});

describe('TiltController', () => {
  it('drifts on its own when nothing is touching it', () => {
    const c = new TiltController();
    const start = { ...c.value };
    for (let i = 0; i < 120; i++) c.update(1 / 60);
    expect(c.source).toBe('idle');
    expect(Math.hypot(c.value.x - start.x, c.value.y - start.y)).toBeGreaterThan(0.05);
  });

  it('hands control to a drag and follows it closely', () => {
    const c = new TiltController();
    c.beginDrag();
    c.setDrag({ x: 0.8, y: -0.4 });
    for (let i = 0; i < 90; i++) c.update(1 / 60);
    expect(c.source).toBe('drag');
    expect(c.value.x).toBeCloseTo(0.8, 1);
    expect(c.value.y).toBeCloseTo(-0.4, 1);
  });

  it('eases back to the idle sway after release instead of snapping', () => {
    const c = new TiltController();
    c.beginDrag();
    c.setDrag({ x: 1, y: 0 });
    for (let i = 0; i < 90; i++) c.update(1 / 60);
    const atRelease = c.value.x;
    c.endDrag();
    const oneFrameLater = c.update(1 / 60).x;
    expect(Math.abs(oneFrameLater - atRelease)).toBeLessThan(0.15);
  });

  it('never exceeds the clamp, whatever it is fed', () => {
    const c = new TiltController();
    c.beginDrag();
    c.setDrag({ x: 99, y: -99 });
    for (let i = 0; i < 200; i++) c.update(1 / 60);
    expect(Math.abs(c.value.x)).toBeLessThanOrEqual(1.2);
    expect(Math.abs(c.value.y)).toBeLessThanOrEqual(1.2);
  });
});
