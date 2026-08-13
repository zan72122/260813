import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEventBus } from "../../src/core/events";
import { createHintTimer, difficultyToDelaySeconds } from "../../src/game/hints";
import type { GameEvents } from "../../src/core/types";

describe("game/hints", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("difficultyToDelaySeconds maps easy(1) to 5s and hard(3) to 3s", () => {
    expect(difficultyToDelaySeconds(1)).toBeCloseTo(5);
    expect(difficultyToDelaySeconds(3)).toBeCloseTo(3);
    expect(difficultyToDelaySeconds(2)).toBeCloseTo(4);
  });

  it("difficultyToDelaySeconds clamps out-of-range difficulty into [3,5]", () => {
    expect(difficultyToDelaySeconds(0)).toBeCloseTo(5);
    expect(difficultyToDelaySeconds(99)).toBeCloseTo(3);
  });

  it("emits hint:show after the configured delay when left untouched", () => {
    const events = createEventBus();
    const seen: GameEvents["hint:show"][] = [];
    events.on("hint:show", (p) => seen.push(p));
    const timer = createHintTimer({ events, getDelaySeconds: () => 4, getSpotId: () => "sand" });
    timer.start();
    vi.advanceTimersByTime(3999);
    expect(seen).toHaveLength(0);
    vi.advanceTimersByTime(2);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toEqual({ spotId: "sand" });
    timer.dispose();
  });

  it("reset() postpones the pending hint", () => {
    const events = createEventBus();
    const seen: unknown[] = [];
    events.on("hint:show", (p) => seen.push(p));
    const timer = createHintTimer({ events, getDelaySeconds: () => 4, getSpotId: () => null });
    timer.start();
    vi.advanceTimersByTime(3000);
    timer.reset(); // 入力があった想定、3秒消費分をリセット
    vi.advanceTimersByTime(3000);
    expect(seen).toHaveLength(0); // まだ4秒経っていない
    vi.advanceTimersByTime(1000);
    expect(seen).toHaveLength(1);
    timer.dispose();
  });

  it("stop() prevents any further hint:show", () => {
    const events = createEventBus();
    const seen: unknown[] = [];
    events.on("hint:show", (p) => seen.push(p));
    const timer = createHintTimer({ events, getDelaySeconds: () => 3, getSpotId: () => null });
    timer.start();
    timer.stop();
    vi.advanceTimersByTime(10000);
    expect(seen).toHaveLength(0);
  });

  it("keeps re-emitting hint:show on repeated inactivity (not just once)", () => {
    const events = createEventBus();
    const seen: unknown[] = [];
    events.on("hint:show", (p) => seen.push(p));
    const timer = createHintTimer({ events, getDelaySeconds: () => 3, getSpotId: () => "pipe" });
    timer.start();
    vi.advanceTimersByTime(3000);
    vi.advanceTimersByTime(3000);
    vi.advanceTimersByTime(3000);
    expect(seen.length).toBeGreaterThanOrEqual(3);
    timer.dispose();
  });

  it("reset() before start() has no effect (no timer scheduled)", () => {
    const events = createEventBus();
    const seen: unknown[] = [];
    events.on("hint:show", (p) => seen.push(p));
    const timer = createHintTimer({ events, getDelaySeconds: () => 3, getSpotId: () => null });
    timer.reset();
    vi.advanceTimersByTime(10000);
    expect(seen).toHaveLength(0);
  });

  it("getDelaySeconds is re-queried on each scheduling (difficulty can change over time)", () => {
    const events = createEventBus();
    const seen: unknown[] = [];
    events.on("hint:show", (p) => seen.push(p));
    let delay = 5;
    const timer = createHintTimer({ events, getDelaySeconds: () => delay, getSpotId: () => null });
    timer.start();
    delay = 3;
    timer.reset();
    vi.advanceTimersByTime(2999);
    expect(seen).toHaveLength(0);
    vi.advanceTimersByTime(2);
    expect(seen).toHaveLength(1);
    timer.dispose();
  });
});
