import { beforeEach, describe, expect, it } from 'vitest';

import { FixedStepLoop } from '../../../src/app/loop.ts';

describe('FixedStepLoop', () => {
  const dt = 1 / 60;
  let stepCalls: number[];
  let renderCalls: number[];
  let loop: FixedStepLoop;

  beforeEach(() => {
    stepCalls = [];
    renderCalls = [];
    loop = new FixedStepLoop({
      dt,
      step: (stepDt) => {
        stepCalls.push(stepDt);
      },
      render: (alpha) => {
        renderCalls.push(alpha);
      },
    });
  });

  it('runs zero steps for a delta smaller than one step', () => {
    loop.advance(dt / 2);
    expect(stepCalls).toHaveLength(0);
    expect(loop.alpha).toBeCloseTo(0.5, 10);
  });

  it('runs exactly one step for a delta of exactly one step', () => {
    loop.advance(dt);
    expect(stepCalls).toHaveLength(1);
    expect(stepCalls[0]).toBe(dt);
    expect(loop.alpha).toBeCloseTo(0, 10);
  });

  it('every step call always receives exactly dt, never a variable delta', () => {
    loop.advance(dt * 3.5);
    for (const stepDt of stepCalls) {
      expect(stepDt).toBe(dt);
    }
  });

  it('is deterministic: replaying the identical sequence of deltas yields the identical step trajectory', () => {
    // MATH_CONTRACT §6: "Same seed + same input script ⇒ bit-identical
    // readout trajectory." Two independently-constructed loops fed the
    // exact same wall-clock delta script must produce the exact same
    // per-call step counts, every time.
    const deltas = [0.0137, 0.02, 0.0059, dt, 0.1, 0.003, 0.0421, 0.0168, dt, 0.077];
    const uncapped = { maxStepsPerAdvance: 100_000 };

    const replay = (): number[] => {
      const run = new FixedStepLoop({ dt, step: () => {}, ...uncapped });
      return deltas.map((delta) => {
        const before = run.steps;
        run.advance(delta);
        return run.steps - before;
      });
    };

    const first = replay();
    const second = replay();
    expect(second).toEqual(first);
  });

  it('chunking an exact multiple of dt never loses or gains a step versus one big advance', () => {
    const targetStepCount = 120;
    const totalSeconds = targetStepCount * dt;
    const uncapped = { maxStepsPerAdvance: 100_000 };

    const oneShot = new FixedStepLoop({ dt, step: () => {}, ...uncapped });
    oneShot.advance(totalSeconds);
    expect(oneShot.steps).toBe(targetStepCount);

    const chunked = new FixedStepLoop({ dt, step: () => {}, ...uncapped });
    const chunk = 10 * dt; // an exact multiple of dt: no float-rounding ambiguity
    for (let i = 0; i < targetStepCount / 10; i += 1) {
      chunked.advance(chunk);
    }
    expect(chunked.steps).toBe(targetStepCount);
  });

  it('reports a render alpha between 0 and 1, matching the accumulator remainder', () => {
    loop.advance(dt * 2 + dt * 0.25);
    expect(renderCalls).toHaveLength(1);
    expect(renderCalls[0]).toBeCloseTo(0.25, 10);
  });

  it('caps steps per advance to guard against a spiral of death after a long stall', () => {
    const guarded = new FixedStepLoop({ dt, step: () => stepCalls.push(dt), maxStepsPerAdvance: 5 });
    guarded.advance(100); // a huge stall (e.g. backgrounded tab)
    expect(guarded.steps).toBe(5);
    expect(guarded.alpha).toBe(0); // remainder dropped, not carried forward
  });

  it('stepExact advances exactly n steps regardless of any pending accumulator', () => {
    loop.advance(dt * 0.9); // leaves a large pending remainder, zero steps run
    loop.stepExact(3);
    expect(stepCalls).toHaveLength(3);
    expect(loop.alpha).toBe(0);
    expect(loop.steps).toBe(3);
  });

  it('stepExact(0) still triggers exactly one render call at alpha = 1', () => {
    loop.stepExact(0);
    expect(stepCalls).toHaveLength(0);
    expect(renderCalls).toEqual([1]);
  });

  it('stepExact always renders at alpha = 1 (fully settled)', () => {
    loop.stepExact(4);
    expect(renderCalls.at(-1)).toBe(1);
  });

  it('reset() clears the accumulator and step counter', () => {
    loop.advance(dt * 2.5);
    loop.reset();
    expect(loop.steps).toBe(0);
    expect(loop.alpha).toBe(0);
  });

  it('rejects a non-positive dt', () => {
    expect(() => new FixedStepLoop({ dt: 0, step: () => {} })).toThrow(RangeError);
    expect(() => new FixedStepLoop({ dt: -1, step: () => {} })).toThrow(RangeError);
  });

  it('rejects a negative advance delta', () => {
    expect(() => loop.advance(-0.1)).toThrow(RangeError);
  });

  it('rejects a negative or non-integer stepExact count', () => {
    expect(() => loop.stepExact(-1)).toThrow(RangeError);
    expect(() => loop.stepExact(1.5)).toThrow(RangeError);
  });
});
