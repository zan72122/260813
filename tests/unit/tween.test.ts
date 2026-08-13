import { describe, expect, it, vi } from "vitest";
import { createClock } from "../../src/core/clock";
import { Easing, delay, parallel, sequence, to } from "../../src/core/tween";

describe("core/tween", () => {
  it("to() moves numeric props toward target over duration", () => {
    const clock = createClock();
    const obj = { x: 0 };
    to(clock, obj, { x: 10 }, 1);
    clock.tick(0.5);
    expect(obj.x).toBeCloseTo(5, 5);
    clock.tick(0.5);
    expect(obj.x).toBeCloseTo(10, 5);
  });

  it("to() resolves its done promise on completion", async () => {
    const clock = createClock();
    const obj = { x: 0 };
    const tw = to(clock, obj, { x: 1 }, 1);
    clock.tick(1);
    await expect(tw.done).resolves.toBeUndefined();
    expect(tw.finished).toBe(true);
  });

  it("to() with duration 0 completes immediately", async () => {
    const clock = createClock();
    const obj = { x: 0 };
    const tw = to(clock, obj, { x: 5 }, 0);
    expect(obj.x).toBe(5);
    await expect(tw.done).resolves.toBeUndefined();
  });

  it("to() applies easing function to progress", () => {
    const clock = createClock();
    const obj = { x: 0 };
    to(clock, obj, { x: 10 }, 1, { easing: Easing.easeInQuad });
    clock.tick(0.5);
    // easeInQuad(0.5) = 0.25 -> x should be 2.5, not 5 (linear)
    expect(obj.x).toBeCloseTo(2.5, 5);
  });

  it("to() calls onUpdate for each tick", () => {
    const clock = createClock();
    const obj = { x: 0 };
    const onUpdate = vi.fn();
    to(clock, obj, { x: 10 }, 1, { onUpdate });
    clock.tick(0.25);
    clock.tick(0.25);
    expect(onUpdate).toHaveBeenCalledTimes(2);
  });

  it("to() only touches properties listed in props", () => {
    const clock = createClock();
    const obj = { x: 0, y: 100 };
    to(clock, obj, { x: 10 }, 1);
    clock.tick(1);
    expect(obj.x).toBeCloseTo(10, 5);
    expect(obj.y).toBe(100);
  });

  it("cancel() stops further updates and resolves done", async () => {
    const clock = createClock();
    const obj = { x: 0 };
    const tw = to(clock, obj, { x: 10 }, 1);
    clock.tick(0.3);
    tw.cancel();
    const valueAtCancel = obj.x;
    clock.tick(0.7);
    expect(obj.x).toBe(valueAtCancel);
    expect(tw.cancelled).toBe(true);
    await expect(tw.done).resolves.toBeUndefined();
  });

  it("cancel() is a no-op once finished", async () => {
    const clock = createClock();
    const obj = { x: 0 };
    const tw = to(clock, obj, { x: 1 }, 1);
    clock.tick(1);
    await tw.done;
    tw.cancel();
    expect(tw.cancelled).toBe(false);
    expect(tw.finished).toBe(true);
  });

  it("delay() resolves after the given scaled duration", async () => {
    const clock = createClock();
    const onComplete = vi.fn();
    const tw = delay(clock, 2, onComplete);
    clock.tick(1);
    expect(tw.finished).toBe(false);
    clock.tick(1);
    expect(tw.finished).toBe(true);
    expect(onComplete).toHaveBeenCalledTimes(1);
    await expect(tw.done).resolves.toBeUndefined();
  });

  it("sequence() runs tweens one after another", () => {
    const clock = createClock();
    const obj = { x: 0, y: 0 };
    sequence([() => to(clock, obj, { x: 10 }, 1), () => to(clock, obj, { y: 10 }, 1)]);
    clock.tick(1); // finishes first tween
    expect(obj.x).toBeCloseTo(10, 5);
    expect(obj.y).toBe(0);
    clock.tick(1); // finishes second tween
    expect(obj.y).toBeCloseTo(10, 5);
  });

  it("sequence() resolves once all steps complete", async () => {
    const clock = createClock();
    const obj = { x: 0 };
    const seq = sequence([() => to(clock, obj, { x: 1 }, 0.5), () => to(clock, obj, { x: 2 }, 0.5)]);
    clock.tick(0.5);
    clock.tick(0.5);
    await expect(seq.done).resolves.toBeUndefined();
    expect(obj.x).toBeCloseTo(2, 5);
  });

  it("sequence() cancel() stops the currently running step", () => {
    const clock = createClock();
    const obj = { x: 0, y: 0 };
    const seq = sequence([() => to(clock, obj, { x: 10 }, 1), () => to(clock, obj, { y: 10 }, 1)]);
    clock.tick(0.3);
    seq.cancel();
    clock.tick(1);
    expect(obj.y).toBe(0); // second step never started
  });

  it("parallel() resolves only when all tweens finish", async () => {
    const clock = createClock();
    const obj = { x: 0, y: 0 };
    const par = parallel([to(clock, obj, { x: 10 }, 0.5), to(clock, obj, { y: 10 }, 1)]);
    clock.tick(0.5);
    expect(par.finished).toBe(false);
    clock.tick(0.5);
    expect(par.finished).toBe(true);
    await expect(par.done).resolves.toBeUndefined();
  });

  it("parallel() runs tweens concurrently, not sequentially", () => {
    const clock = createClock();
    const obj = { x: 0, y: 0 };
    parallel([to(clock, obj, { x: 10 }, 1), to(clock, obj, { y: 10 }, 1)]);
    clock.tick(0.5);
    expect(obj.x).toBeCloseTo(5, 5);
    expect(obj.y).toBeCloseTo(5, 5);
  });

  it("parallel() with an empty array resolves", async () => {
    const par = parallel([]);
    await expect(par.done).resolves.toBeUndefined();
  });

  it("Easing.linear is the identity function", () => {
    expect(Easing.linear(0)).toBe(0);
    expect(Easing.linear(0.5)).toBe(0.5);
    expect(Easing.linear(1)).toBe(1);
  });

  it("Easing functions map 0->0 and 1->1", () => {
    const fns = [Easing.easeInQuad, Easing.easeOutQuad, Easing.easeInOutQuad, Easing.easeOutCubic, Easing.easeInOutCubic];
    for (const fn of fns) {
      expect(fn(0)).toBeCloseTo(0, 5);
      expect(fn(1)).toBeCloseTo(1, 5);
    }
  });
});
