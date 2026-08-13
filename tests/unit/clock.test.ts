import { describe, expect, it, vi } from "vitest";
import { createClock } from "../../src/core/clock";

describe("core/clock", () => {
  it("defaults timeScale to 1", () => {
    const clock = createClock();
    expect(clock.timeScale).toBe(1);
  });

  it("starts with elapsed 0", () => {
    const clock = createClock();
    expect(clock.elapsed).toBe(0);
  });

  it("tick() accumulates elapsed by raw*timeScale", () => {
    const clock = createClock();
    clock.tick(1);
    clock.tick(0.5);
    expect(clock.elapsed).toBeCloseTo(1.5, 10);
  });

  it("tick() returns the scaled delta", () => {
    const clock = createClock();
    clock.timeScale = 4;
    const dt = clock.tick(0.25);
    expect(dt).toBeCloseTo(1, 10);
  });

  it("timeScale affects subsequent ticks (QA speed-up up to 16)", () => {
    const clock = createClock();
    clock.timeScale = 16;
    const dt = clock.tick(1);
    expect(dt).toBeCloseTo(16, 10);
  });

  it("clamps negative raw delta to zero", () => {
    const clock = createClock();
    const dt = clock.tick(-5);
    expect(dt).toBe(0);
    expect(clock.elapsed).toBe(0);
  });

  it("onTick listeners receive the scaled dt", () => {
    const clock = createClock();
    clock.timeScale = 2;
    const cb = vi.fn();
    clock.onTick(cb);
    clock.tick(1);
    expect(cb).toHaveBeenCalledWith(2);
  });

  it("onTick returns an unsubscribe function", () => {
    const clock = createClock();
    const cb = vi.fn();
    const off = clock.onTick(cb);
    off();
    clock.tick(1);
    expect(cb).not.toHaveBeenCalled();
  });

  it("supports multiple onTick listeners", () => {
    const clock = createClock();
    const a = vi.fn();
    const b = vi.fn();
    clock.onTick(a);
    clock.onTick(b);
    clock.tick(0.1);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
