import { describe, expect, it, vi } from "vitest";
import { createEventBus } from "../../src/core/events";

describe("core/events", () => {
  it("delivers emitted payloads to a listener", () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.on("food:picked", cb);
    bus.emit("food:picked", { food: "grass" });
    expect(cb).toHaveBeenCalledWith({ food: "grass" });
  });

  it("supports multiple listeners on the same key", () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    bus.on("gate:opened", a);
    bus.on("gate:opened", b);
    bus.emit("gate:opened", {});
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("on() returns an unsubscribe function", () => {
    const bus = createEventBus();
    const cb = vi.fn();
    const off = bus.on("hint:show", cb);
    off();
    bus.emit("hint:show", { spotId: null });
    expect(cb).not.toHaveBeenCalled();
  });

  it("does not call listeners of other event keys", () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.on("hide:complete", cb);
    bus.emit("gate:opened", {});
    expect(cb).not.toHaveBeenCalled();
  });

  it("clear() removes all listeners", () => {
    const bus = createEventBus();
    const cb = vi.fn();
    bus.on("hide:complete", cb);
    bus.clear();
    bus.emit("hide:complete", { count: 1 });
    expect(cb).not.toHaveBeenCalled();
  });

  it("emit with no listeners does not throw", () => {
    const bus = createEventBus();
    expect(() => bus.emit("audio:unlocked", {})).not.toThrow();
  });

  it("unsubscribing one listener does not affect others", () => {
    const bus = createEventBus();
    const a = vi.fn();
    const b = vi.fn();
    const offA = bus.on("phase:changed", a);
    bus.on("phase:changed", b);
    offA();
    bus.emit("phase:changed", { phase: "title", prev: "boot" });
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
});
