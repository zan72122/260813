// S3b: 5固有行動の純ロジック部分(three描画に依存しない範囲)のテスト。
// BEHAVIORS dispatchテーブルの網羅性と、start→complete のemit順序/reducedMotion短縮を担う
// runBehaviorLifecycle/scaledDuration(src/scene/elephant/behaviors/support.ts)を直接検証する。
import { describe, expect, it } from "vitest";
import { createEventBus } from "../../src/core/events";
import type { BehaviorId, SpotKind } from "../../src/core/types";
import { BEHAVIORS, REDUCED_MOTION_SCALE, runBehaviorLifecycle, scaledDuration } from "../../src/scene/elephant/behaviors";

const ALL_BEHAVIOR_IDS: readonly BehaviorId[] = ["probe-gap", "dig-sand", "reach-pipe", "peel-banana", "break-branch"];

describe("behaviors/BEHAVIORS dispatch table", () => {
  it("covers exactly the 5 BehaviorId values, no more, no less", () => {
    const keys = Object.keys(BEHAVIORS).sort();
    expect(keys).toEqual([...ALL_BEHAVIOR_IDS].sort());
  });

  it("maps every BehaviorId to a callable function", () => {
    for (const id of ALL_BEHAVIOR_IDS) {
      expect(typeof BEHAVIORS[id]).toBe("function");
    }
  });
});

describe("behaviors/support scaledDuration (reducedMotion ~60% shortening, pure)", () => {
  it("passes seconds through unchanged when reducedMotion is false", () => {
    for (const s of [0, 0.5, 1, 6.5, 12]) {
      expect(scaledDuration(s, false)).toBeCloseTo(s, 10);
    }
  });

  it("scales seconds by REDUCED_MOTION_SCALE (~0.6) when reducedMotion is true", () => {
    expect(REDUCED_MOTION_SCALE).toBeCloseTo(0.6, 5);
    for (const s of [1, 2.5, 8, 10]) {
      expect(scaledDuration(s, true)).toBeCloseTo(s * REDUCED_MOTION_SCALE, 10);
    }
  });

  it("clamps negative input to 0 instead of returning a negative duration", () => {
    expect(scaledDuration(-3, false)).toBe(0);
    expect(scaledDuration(-3, true)).toBe(0);
  });
});

describe("behaviors/support runBehaviorLifecycle (behavior:start -> fn -> behavior:complete emit order)", () => {
  it("emits behavior:start before calling fn, and behavior:complete after fn resolves, in order", async () => {
    const events = createEventBus();
    const order: string[] = [];
    events.on("behavior:start", () => order.push("start"));
    events.on("behavior:complete", () => order.push("complete"));

    await runBehaviorLifecycle(events, "probe-gap", "stone-gap", async () => {
      order.push("fn-running");
    });

    expect(order).toEqual(["start", "fn-running", "complete"]);
  });

  it("waits for fn's promise to settle before emitting behavior:complete (async fn body)", async () => {
    const events = createEventBus();
    const order: string[] = [];
    events.on("behavior:start", () => order.push("start"));
    events.on("behavior:complete", () => order.push("complete"));

    await runBehaviorLifecycle(events, "dig-sand", "sand", async () => {
      order.push("fn-before-await");
      await Promise.resolve();
      await Promise.resolve();
      order.push("fn-after-await");
    });

    expect(order).toEqual(["start", "fn-before-await", "fn-after-await", "complete"]);
  });

  it("passes the correct {behaviorId, spotId} payload to both events", async () => {
    const events = createEventBus();
    const starts: Array<{ behaviorId: BehaviorId; spotId: SpotKind }> = [];
    const completes: Array<{ behaviorId: BehaviorId; spotId: SpotKind }> = [];
    events.on("behavior:start", (p) => starts.push(p));
    events.on("behavior:complete", (p) => completes.push(p));

    await runBehaviorLifecycle(events, "reach-pipe", "pipe", async () => {});

    expect(starts).toEqual([{ behaviorId: "reach-pipe", spotId: "pipe" }]);
    expect(completes).toEqual([{ behaviorId: "reach-pipe", spotId: "pipe" }]);
  });

  it("does not emit behavior:complete and propagates the rejection when fn throws", async () => {
    const events = createEventBus();
    const order: string[] = [];
    events.on("behavior:start", () => order.push("start"));
    events.on("behavior:complete", () => order.push("complete"));

    await expect(
      runBehaviorLifecycle(events, "break-branch", "high-branch", async () => {
        throw new Error("boom");
      })
    ).rejects.toThrow("boom");

    expect(order).toEqual(["start"]);
  });

  it("runs independently per BehaviorId (all 5 ids produce a matching start/complete pair)", async () => {
    for (const id of ALL_BEHAVIOR_IDS) {
      const events = createEventBus();
      const order: string[] = [];
      events.on("behavior:start", (p) => order.push(`start:${p.behaviorId}`));
      events.on("behavior:complete", (p) => order.push(`complete:${p.behaviorId}`));
      await runBehaviorLifecycle(events, id, "sand", async () => {});
      expect(order).toEqual([`start:${id}`, `complete:${id}`]);
    }
  });
});
