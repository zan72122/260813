// イベント(core/events.ts)→SfxIdの対応表を網羅的に検証する。AudioContextの実物は使わず、
// createAudioSystem()のDI口(AudioSystemDeps)へフェイクのSfx/Ambience/Engineを差し込み、
// bindEvents()が実際にどのSfxId/volumeScaleでplay()を呼ぶかだけを記録して検証する
// (実機音出しは検証していない。ops/reports/S5.mdに明記)。
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEventBus } from "../../src/core/events";
import { createAudioSystem } from "../../src/audio";
import type { Sfx } from "../../src/audio/sfx";
import type { Ambience } from "../../src/audio/ambience";
import type { AudioEngine } from "../../src/audio/engine";
import type { BehaviorId, SfxId, SpotKind } from "../../src/core/types";

interface PlayCall {
  id: SfxId;
  volumeScale: number;
}

function createFakeSfx(): { sfx: Sfx; calls: PlayCall[]; squeakCalls: number[] } {
  const calls: PlayCall[] = [];
  const squeakCalls: number[] = [];
  const sfx: Sfx = {
    play(id: SfxId, volumeScale = 1): void {
      calls.push({ id, volumeScale });
    },
    playPulleySqueak(volumeScale = 1): void {
      squeakCalls.push(volumeScale);
    }
  };
  return { sfx, calls, squeakCalls };
}

function createFakeAmbience(): Ambience {
  return { start: () => {}, stop: () => {}, setVolume: () => {} };
}

function createFakeEngine(): AudioEngine {
  return {
    getContext: () => null,
    getMasterGain: () => null,
    unlock: () => {},
    unlocked: false,
    setMuted: () => {},
    muted: false,
    suspend: () => {},
    resume: () => {}
  };
}

function ids(calls: PlayCall[]): SfxId[] {
  return calls.map((c) => c.id);
}

describe("audio: event -> SfxId mapping", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function setup() {
    const events = createEventBus();
    const { sfx, calls, squeakCalls } = createFakeSfx();
    const system = createAudioSystem({ sfx, ambience: createFakeAmbience(), engine: createFakeEngine() });
    const unbind = system.bindEvents(events);
    return { events, calls, squeakCalls, unbind };
  }

  it("food:hidden(stone-gap) plays food-tuck", () => {
    const { events, calls } = setup();
    events.emit("food:hidden", { spotId: "stone-gap", food: "vegetable" });
    expect(ids(calls)).toEqual(["food-tuck"]);
  });

  it("food:hidden(sand) plays sand-cover", () => {
    const { events, calls } = setup();
    events.emit("food:hidden", { spotId: "sand", food: "hay-cube" });
    expect(ids(calls)).toEqual(["sand-cover"]);
  });

  it("food:hidden(pipe) plays trunk-pipe (rolling-sound reuse, per spec)", () => {
    const { events, calls } = setup();
    events.emit("food:hidden", { spotId: "pipe", food: "vegetable" });
    expect(ids(calls)).toEqual(["trunk-pipe"]);
  });

  it("food:hidden(banyan-root) plays leaf-rustle", () => {
    const { events, calls } = setup();
    events.emit("food:hidden", { spotId: "banyan-root", food: "grass" });
    expect(ids(calls)).toEqual(["leaf-rustle"]);
  });

  it("food:hidden(high-branch) plays leaf-rustle immediately, then the pulley squeak shortly after", () => {
    const { events, calls, squeakCalls } = setup();
    events.emit("food:hidden", { spotId: "high-branch", food: "branch" });
    expect(ids(calls)).toEqual(["leaf-rustle"]);
    expect(squeakCalls).toHaveLength(0);
    vi.advanceTimersByTime(140);
    expect(squeakCalls).toHaveLength(1);
  });

  it("gate:opened plays gate-open", () => {
    const { events, calls } = setup();
    events.emit("gate:opened", {});
    expect(ids(calls)).toEqual(["gate-open"]);
  });

  it("behavior:start(probe-gap) plays a quiet leaf-rustle + quiet trunk-pipe", () => {
    const { events, calls } = setup();
    events.emit("behavior:start", { behaviorId: "probe-gap", spotId: "stone-gap" });
    expect(calls).toEqual([
      { id: "leaf-rustle", volumeScale: 0.5 },
      { id: "trunk-pipe", volumeScale: 0.4 }
    ]);
  });

  it("behavior:start(dig-sand) plays sand-cover three times in a row (連打)", () => {
    const { events, calls } = setup();
    events.emit("behavior:start", { behaviorId: "dig-sand", spotId: "sand" });
    expect(ids(calls)).toEqual(["sand-cover"]);
    vi.advanceTimersByTime(600);
    expect(ids(calls)).toEqual(["sand-cover", "sand-cover", "sand-cover"]);
  });

  it("behavior:start(reach-pipe) plays trunk-pipe", () => {
    const { events, calls } = setup();
    events.emit("behavior:start", { behaviorId: "reach-pipe", spotId: "pipe" });
    expect(ids(calls)).toEqual(["trunk-pipe"]);
  });

  it("behavior:start(peel-banana) repeats banana-peel", () => {
    const { events, calls } = setup();
    events.emit("behavior:start", { behaviorId: "peel-banana", spotId: "banyan-root" });
    expect(ids(calls)).toEqual(["banana-peel"]);
    vi.advanceTimersByTime(300);
    expect(ids(calls)).toEqual(["banana-peel", "banana-peel"]);
  });

  it("behavior:start(break-branch) plays branch-creak immediately, and branch-snap ~2.8s later if no complete arrives", () => {
    const { events, calls } = setup();
    events.emit("behavior:start", { behaviorId: "break-branch", spotId: "high-branch" });
    expect(ids(calls)).toEqual(["branch-creak"]);
    vi.advanceTimersByTime(2900);
    expect(ids(calls)).toEqual(["branch-creak", "branch-snap"]);
  });

  it("behavior:complete(break-branch) arriving before the approximated timer cancels it and plays branch-snap immediately (no double snap later)", () => {
    const { events, calls } = setup();
    events.emit("behavior:start", { behaviorId: "break-branch", spotId: "high-branch" });
    vi.advanceTimersByTime(500); // まだ2.8sのタイマーは発火していない
    events.emit("behavior:complete", { behaviorId: "break-branch", spotId: "high-branch" });
    expect(ids(calls)).toEqual(["branch-creak", "branch-snap", "found-chime"]);
    vi.advanceTimersByTime(3000); // タイマーは既にキャンセル済みなので二重に鳴らない
    expect(ids(calls).filter((id) => id === "branch-snap")).toHaveLength(1);
  });

  it("behavior:complete always plays found-chime, and plays elephant-rumble when the random roll succeeds", () => {
    const { events, calls } = setup();
    vi.spyOn(Math, "random").mockReturnValue(0); // < 0.35 => 鳴る
    events.emit("behavior:complete", { behaviorId: "reach-pipe", spotId: "pipe" });
    expect(ids(calls)).toContain("found-chime");
    vi.advanceTimersByTime(300);
    expect(ids(calls)).toContain("elephant-rumble");
  });

  it("behavior:complete does not play elephant-rumble when the random roll fails", () => {
    const { events, calls } = setup();
    vi.spyOn(Math, "random").mockReturnValue(0.99); // >= 0.35 => 鳴らない
    events.emit("behavior:complete", { behaviorId: "reach-pipe", spotId: "pipe" });
    vi.advanceTimersByTime(300);
    expect(ids(calls)).toEqual(["found-chime"]);
  });

  it("all 5 SpotKind values used by food:hidden are covered by the mapping (exhaustive)", () => {
    const spots: SpotKind[] = ["stone-gap", "sand", "pipe", "banyan-root", "high-branch"];
    const { events, calls } = setup();
    for (const spotId of spots) events.emit("food:hidden", { spotId, food: "grass" });
    vi.advanceTimersByTime(200);
    expect(calls.length).toBeGreaterThanOrEqual(spots.length);
  });

  it("all 5 BehaviorId values used by behavior:start are covered by the mapping (exhaustive, no crash)", () => {
    const behaviorIds: BehaviorId[] = ["probe-gap", "dig-sand", "reach-pipe", "peel-banana", "break-branch"];
    const { events, calls } = setup();
    for (const behaviorId of behaviorIds) events.emit("behavior:start", { behaviorId, spotId: "stone-gap" });
    vi.advanceTimersByTime(3000);
    expect(calls.length).toBeGreaterThanOrEqual(behaviorIds.length);
  });

  it("unbind() stops future events from producing any sound", () => {
    const { events, calls, unbind } = setup();
    unbind();
    events.emit("gate:opened", {});
    events.emit("food:hidden", { spotId: "sand", food: "hay-cube" });
    expect(calls).toEqual([]);
  });
});
