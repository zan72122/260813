import { describe, expect, it } from 'vitest';
import { approach, createPulse, decayPulse, triggerPulse } from '../../src/render/pulse';

describe('createPulse / triggerPulse', () => {
  it('starts at 0 by default, jumps to `amount` (default 1) on trigger', () => {
    const p = createPulse();
    expect(p.value).toBe(0);
    triggerPulse(p);
    expect(p.value).toBe(1);
    triggerPulse(p, 0.4);
    expect(p.value).toBe(0.4);
  });
});

describe('decayPulse', () => {
  it('halves the value after exactly one half-life', () => {
    const p = createPulse(1);
    decayPulse(p, 0.5, 0.5);
    expect(p.value).toBeCloseTo(0.5, 6);
  });

  it('is monotonically decreasing while value > 0', () => {
    const p = createPulse(1);
    let prev = 1;
    for (let i = 0; i < 20; i++) {
      decayPulse(p, 0.05, 0.3);
      expect(p.value).toBeLessThanOrEqual(prev);
      prev = p.value;
    }
  });

  it('snaps to exactly 0 once negligible (guarantees settled() can observe true rest)', () => {
    const p = createPulse(1);
    for (let i = 0; i < 200; i++) decayPulse(p, 0.1, 0.05);
    expect(p.value).toBe(0);
  });

  it('is a no-op at value=0 or dt<=0', () => {
    const p = createPulse(0);
    decayPulse(p, 1, 0.5);
    expect(p.value).toBe(0);
    const q = createPulse(1);
    decayPulse(q, 0, 0.5);
    expect(q.value).toBe(1);
  });
});

describe('approach', () => {
  it('moves halfway to the target after one half-life, converges to the target, holds there', () => {
    let v = 0;
    v = approach(v, 1, 0.5, 0.5);
    expect(v).toBeCloseTo(0.5, 6);
    for (let i = 0; i < 200; i++) v = approach(v, 1, 0.1, 0.3);
    expect(v).toBe(1);
    v = approach(v, 1, 0.1, 0.3); // already at target: stays exactly there
    expect(v).toBe(1);
  });

  it('approaches a lower target too (not just upward)', () => {
    let v = 1;
    for (let i = 0; i < 200; i++) v = approach(v, 0, 0.1, 0.2);
    expect(v).toBe(0);
  });

  it('dt<=0 is a no-op', () => {
    expect(approach(0.3, 1, 0, 0.5)).toBe(0.3);
  });
});
