import { describe, expect, it, vi } from "vitest";
import { createFsm } from "../../src/core/fsm";
import type { GamePhase } from "../../src/core/types";

function driveTo(fsm: ReturnType<typeof createFsm>, path: GamePhase[]): void {
  for (const phase of path) {
    const ok = fsm.transition(phase);
    expect(ok).toBe(true);
  }
}

describe("core/fsm", () => {
  it("starts at boot", () => {
    const fsm = createFsm();
    expect(fsm.phase).toBe("boot");
  });

  it("allows the documented happy path boot->title->intro->hide->gate->seek->album", () => {
    const fsm = createFsm();
    driveTo(fsm, ["title", "intro", "hide", "gate", "seek", "album"]);
    expect(fsm.phase).toBe("album");
  });

  it("allows album->hide (replay/free)", () => {
    const fsm = createFsm();
    driveTo(fsm, ["title", "intro", "hide", "gate", "seek", "album"]);
    expect(fsm.transition("hide")).toBe(true);
    expect(fsm.phase).toBe("hide");
  });

  it("allows album->title (home)", () => {
    const fsm = createFsm();
    driveTo(fsm, ["title", "intro", "hide", "gate", "seek", "album"]);
    expect(fsm.transition("title")).toBe(true);
    expect(fsm.phase).toBe("title");
  });

  it("allows title->hide directly (2nd+ play skips intro)", () => {
    const fsm = createFsm();
    fsm.transition("title");
    expect(fsm.canTransition("hide")).toBe(true);
    expect(fsm.transition("hide")).toBe(true);
    expect(fsm.phase).toBe("hide");
  });

  it("rejects an illegal transition and stays put", () => {
    const fsm = createFsm();
    // boot -> seek is not allowed
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const ok = fsm.transition("seek");
    expect(ok).toBe(false);
    expect(fsm.phase).toBe("boot");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("does not throw on illegal transitions (child mashing buttons)", () => {
    const fsm = createFsm();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(() => {
      for (let i = 0; i < 20; i++) fsm.transition("album");
    }).not.toThrow();
    expect(fsm.phase).toBe("boot");
    vi.restoreAllMocks();
  });

  it("canTransition reports without mutating state", () => {
    const fsm = createFsm();
    expect(fsm.canTransition("title")).toBe(true);
    expect(fsm.canTransition("gate")).toBe(false);
    expect(fsm.phase).toBe("boot");
  });

  it("notifies onChange listeners with (phase, prev)", () => {
    const fsm = createFsm();
    const calls: Array<[GamePhase, GamePhase]> = [];
    fsm.onChange((phase, prev) => calls.push([phase, prev]));
    fsm.transition("title");
    fsm.transition("intro");
    expect(calls).toEqual([
      ["title", "boot"],
      ["intro", "title"]
    ]);
  });

  it("onChange returns an unsubscribe function", () => {
    const fsm = createFsm();
    const cb = vi.fn();
    const unsub = fsm.onChange(cb);
    fsm.transition("title");
    unsub();
    fsm.transition("intro");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("does not notify listeners on rejected transitions", () => {
    const fsm = createFsm();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const cb = vi.fn();
    fsm.onChange(cb);
    fsm.transition("album"); // illegal from boot
    expect(cb).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("supports multiple independent listeners", () => {
    const fsm = createFsm();
    const a = vi.fn();
    const b = vi.fn();
    fsm.onChange(a);
    fsm.onChange(b);
    fsm.transition("title");
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
  });
});
