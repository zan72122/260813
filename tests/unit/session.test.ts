import { describe, expect, it } from "vitest";
import { createSession, isHideComplete, isSeekComplete, nextSeekTarget, recordFound, recordHidden, remainingSpots, traySize } from "../../src/game/session";
import { GUIDED_SPOT_IDS, SPOTS } from "../../src/game/spots";

describe("game/session", () => {
  it("guided sessions always use the 3 fixed GUIDED_SPOT_IDS", () => {
    const state = createSession(1, { guided: true, freePlay: false });
    expect(state.config.spots).toEqual([...GUIDED_SPOT_IDS]);
    expect(state.config.spots).toHaveLength(3);
  });

  it("guided sessions default to morning", () => {
    for (const seed of [1, 2, 3, 99, 12345]) {
      const state = createSession(seed, { guided: true, freePlay: false });
      expect(state.config.timeOfDay).toBe("morning");
    }
  });

  it("normal (non-guided, non-free) sessions propose exactly 3 spots out of the 5 known ones", () => {
    const state = createSession(7, { guided: false, freePlay: false });
    expect(state.config.spots).toHaveLength(3);
    const known = new Set(SPOTS.map((s) => s.id));
    for (const id of state.config.spots) expect(known.has(id)).toBe(true);
    // 重複なし
    expect(new Set(state.config.spots).size).toBe(3);
  });

  it("free play sessions offer up to all 5 spots", () => {
    const state = createSession(7, { guided: false, freePlay: true });
    expect(state.config.spots).toHaveLength(5);
    expect(new Set(state.config.spots).size).toBe(5);
  });

  it("same seed + same options reproduces the same proposed spots (normal mode)", () => {
    const a = createSession(2024, { guided: false, freePlay: false });
    const b = createSession(2024, { guided: false, freePlay: false });
    expect(a.config.spots).toEqual(b.config.spots);
  });

  it("same seed reproduces the same seekOrder", () => {
    const a = createSession(555, { guided: false, freePlay: false });
    const b = createSession(555, { guided: false, freePlay: false });
    expect(a.seekOrder).toEqual(b.seekOrder);
  });

  it("different seeds tend to produce different spot proposals (normal mode)", () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
    const proposals = seeds.map((s) => createSession(s, { guided: false, freePlay: false }).config.spots.join(","));
    const distinct = new Set(proposals);
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("seekOrder is a permutation of config.spots", () => {
    const state = createSession(42, { guided: false, freePlay: true });
    expect([...state.seekOrder].sort()).toEqual([...state.config.spots].sort());
  });

  it("non-guided sessions vary timeOfDay across seeds (not always morning)", () => {
    const timesOfDay = Array.from({ length: 30 }, (_, i) => createSession(i + 1, { guided: false, freePlay: false }).config.timeOfDay);
    const distinct = new Set(timesOfDay);
    expect(distinct.size).toBeGreaterThan(1);
  });

  it("starts with empty hidden/found arrays", () => {
    const state = createSession(1, { guided: true, freePlay: false });
    expect(state.hidden).toEqual([]);
    expect(state.found).toEqual([]);
  });

  it("recordHidden appends and is idempotent per spotId", () => {
    const state = createSession(1, { guided: true, freePlay: false });
    recordHidden(state, "stone-gap", "vegetable");
    recordHidden(state, "stone-gap", "hay-cube"); // 同じspotIdの二重呼び出しは無視
    expect(state.hidden).toEqual([{ spotId: "stone-gap", food: "vegetable" }]);
  });

  it("isHideComplete becomes true once every proposed spot has hidden food", () => {
    const state = createSession(1, { guided: true, freePlay: false });
    expect(isHideComplete(state)).toBe(false);
    recordHidden(state, "stone-gap", "vegetable");
    recordHidden(state, "sand", "hay-cube");
    expect(isHideComplete(state)).toBe(false);
    recordHidden(state, "high-branch", "branch");
    expect(isHideComplete(state)).toBe(true);
  });

  it("remainingSpots reflects what has not been hidden yet", () => {
    const state = createSession(1, { guided: true, freePlay: false });
    recordHidden(state, "stone-gap", "vegetable");
    expect(remainingSpots(state).sort()).toEqual(["high-branch", "sand"].sort());
  });

  it("recordFound + isSeekComplete track the seek phase", () => {
    const state = createSession(1, { guided: true, freePlay: false });
    recordHidden(state, "stone-gap", "vegetable");
    recordHidden(state, "sand", "hay-cube");
    recordHidden(state, "high-branch", "branch");
    expect(isSeekComplete(state)).toBe(false);
    recordFound(state, "stone-gap");
    recordFound(state, "sand");
    expect(isSeekComplete(state)).toBe(false);
    recordFound(state, "high-branch");
    expect(isSeekComplete(state)).toBe(true);
    recordFound(state, "high-branch"); // 冪等
    expect(state.found).toHaveLength(3);
  });

  it("nextSeekTarget follows seekOrder and skips already-found spots", () => {
    const state = createSession(3, { guided: true, freePlay: false });
    for (const spotId of state.config.spots) recordHidden(state, spotId, "vegetable");
    const first = nextSeekTarget(state);
    expect(first).not.toBeNull();
    expect(state.seekOrder[0]).toBe(first?.spotId);
    if (first) recordFound(state, first.spotId);
    const second = nextSeekTarget(state);
    expect(second?.spotId).toBe(state.seekOrder[1]);
  });

  it("nextSeekTarget returns null once nothing is left to find", () => {
    const state = createSession(1, { guided: true, freePlay: false });
    for (const spotId of state.config.spots) {
      recordHidden(state, spotId, "vegetable");
      recordFound(state, spotId);
    }
    expect(nextSeekTarget(state)).toBeNull();
  });

  it("traySize matches the number of proposed spots", () => {
    expect(traySize(createSession(1, { guided: true, freePlay: false }))).toBe(3);
    expect(traySize(createSession(1, { guided: false, freePlay: true }))).toBe(5);
  });
});
