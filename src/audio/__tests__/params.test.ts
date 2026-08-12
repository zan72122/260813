import { describe, expect, it } from 'vitest';
import {
  anvilRingFrequency,
  chugIntervalSeconds,
  coolingSizzleGain,
  forgeCrackleGain,
  hammerPitchForHit,
  steamHissGain,
} from '../params';

describe('hammerPitchForHit', () => {
  it('rises strictly with each successive hit', () => {
    const p1 = hammerPitchForHit(1);
    const p2 = hammerPitchForHit(2);
    const p3 = hammerPitchForHit(3);
    expect(p2).toBeGreaterThan(p1);
    expect(p3).toBeGreaterThan(p2);
  });

  it('is deterministic', () => {
    expect(hammerPitchForHit(2)).toBe(hammerPitchForHit(2));
  });
});

describe('anvilRingFrequency', () => {
  it('tracks above the hammer pitch for the same hit', () => {
    for (const hit of [1, 2, 3] as const) {
      expect(anvilRingFrequency(hit)).toBeGreaterThan(hammerPitchForHit(hit));
    }
  });
});

describe('chugIntervalSeconds', () => {
  it('shortens (speeds up) as progress approaches 1', () => {
    const early = chugIntervalSeconds(0);
    const mid = chugIntervalSeconds(0.5);
    const late = chugIntervalSeconds(1);
    expect(mid).toBeLessThan(early);
    expect(late).toBeLessThan(mid);
  });

  it('clamps out-of-range progress', () => {
    expect(chugIntervalSeconds(-5)).toBe(chugIntervalSeconds(0));
    expect(chugIntervalSeconds(5)).toBe(chugIntervalSeconds(1));
  });
});

describe('steamHissGain', () => {
  it('increases monotonically with lever opening and stays within a sane gain range', () => {
    const closed = steamHissGain(0);
    const open = steamHissGain(1);
    expect(open).toBeGreaterThan(closed);
    expect(closed).toBeGreaterThanOrEqual(0);
    expect(open).toBeLessThanOrEqual(1);
  });
});

describe('forgeCrackleGain', () => {
  it('is silent before heating starts and once fully heated', () => {
    expect(forgeCrackleGain(0)).toBe(0);
    expect(forgeCrackleGain(1)).toBe(0);
  });

  it('is audible mid-heat', () => {
    expect(forgeCrackleGain(0.5)).toBeGreaterThan(0);
  });
});

describe('coolingSizzleGain', () => {
  it('fades from loud to silent as cooled goes 0 -> 1', () => {
    const start = coolingSizzleGain(0);
    const mid = coolingSizzleGain(0.5);
    const done = coolingSizzleGain(1);
    expect(start).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(done);
    expect(done).toBe(0);
  });
});
