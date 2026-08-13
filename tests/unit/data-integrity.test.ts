import { describe, expect, it } from "vitest";
import { FOODS, getFood } from "../../src/game/foods";
import { GUIDED_SPOT_IDS, SPOTS, getSpot } from "../../src/game/spots";
import type { BehaviorId, FoodKind, SpotKind } from "../../src/core/types";

const VALID_FOOD_KINDS: readonly FoodKind[] = ["vegetable", "hay-cube", "banana-stem", "branch", "grass"];
const VALID_SPOT_KINDS: readonly SpotKind[] = ["stone-gap", "banyan-root", "pipe", "sand", "high-branch"];
const VALID_BEHAVIOR_IDS: readonly BehaviorId[] = [
  "probe-gap",
  "dig-sand",
  "reach-pipe",
  "peel-banana",
  "break-branch"
];

describe("game/spots data", () => {
  it("defines exactly 5 spots", () => {
    expect(SPOTS.length).toBe(5);
  });

  it("has unique ids covering all SpotKind values", () => {
    const ids = SPOTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual([...VALID_SPOT_KINDS].sort());
  });

  it("only uses real FoodKind values in acceptedFoodTypes", () => {
    for (const spot of SPOTS) {
      for (const food of spot.acceptedFoodTypes) {
        expect(VALID_FOOD_KINDS).toContain(food);
      }
    }
  });

  it("every spot accepts at least one food type", () => {
    for (const spot of SPOTS) {
      expect(spot.acceptedFoodTypes.length).toBeGreaterThan(0);
    }
  });

  it("only uses real BehaviorId values in elephantBehavior", () => {
    for (const spot of SPOTS) {
      expect(VALID_BEHAVIOR_IDS).toContain(spot.elephantBehavior);
    }
  });

  it("has a 1:1 mapping between spot and behavior (no duplicates)", () => {
    const behaviors = SPOTS.map((s) => s.elephantBehavior);
    expect(new Set(behaviors).size).toBe(behaviors.length);
  });

  it("difficulty is within 1..3", () => {
    for (const spot of SPOTS) {
      expect(spot.difficulty).toBeGreaterThanOrEqual(1);
      expect(spot.difficulty).toBeLessThanOrEqual(3);
    }
  });

  it("snapRadius is a positive number", () => {
    for (const spot of SPOTS) {
      expect(spot.snapRadius).toBeGreaterThan(0);
    }
  });

  it("cameraPreset follows the 'spot:<id>' convention", () => {
    for (const spot of SPOTS) {
      expect(spot.cameraPreset).toBe(`spot:${spot.id}`);
    }
  });

  it("position and approach are finite Vec3 values", () => {
    for (const spot of SPOTS) {
      for (const v of [spot.position, spot.approach]) {
        expect(Number.isFinite(v.x)).toBe(true);
        expect(Number.isFinite(v.y)).toBe(true);
        expect(Number.isFinite(v.z)).toBe(true);
      }
    }
  });

  it("getSpot() returns the matching spot", () => {
    expect(getSpot("sand").id).toBe("sand");
  });

  it("getSpot() throws for an unknown id", () => {
    expect(() => getSpot("nope" as SpotKind)).toThrow();
  });

  it("GUIDED_SPOT_IDS has exactly 3 spots per D7/D8", () => {
    expect(GUIDED_SPOT_IDS.length).toBe(3);
  });

  it("GUIDED_SPOT_IDS references real spots", () => {
    for (const id of GUIDED_SPOT_IDS) {
      expect(SPOTS.some((s) => s.id === id)).toBe(true);
    }
  });
});

describe("game/foods data", () => {
  it("defines exactly 5 foods", () => {
    expect(FOODS.length).toBe(5);
  });

  it("has unique kinds covering all FoodKind values", () => {
    const kinds = FOODS.map((f) => f.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
    expect([...kinds].sort()).toEqual([...VALID_FOOD_KINDS].sort());
  });

  it("every food has a non-empty label", () => {
    for (const food of FOODS) {
      expect(food.label.length).toBeGreaterThan(0);
    }
  });

  it("every food has a hex color string", () => {
    for (const food of FOODS) {
      expect(food.color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it("getFood() returns the matching food", () => {
    expect(getFood("grass").color).toBe("#5aa860");
  });

  it("getFood() throws for an unknown kind", () => {
    expect(() => getFood("nope" as FoodKind)).toThrow();
  });
});

describe("game/spots x foods cross-reference", () => {
  it("every FoodKind is accepted by at least one spot", () => {
    const accepted = new Set(SPOTS.flatMap((s) => s.acceptedFoodTypes));
    for (const kind of VALID_FOOD_KINDS) {
      expect(accepted.has(kind)).toBe(true);
    }
  });
});
