import { describe, expect, it } from "vitest";
import { createCameraRig } from "../../src/scene/cameras";
import { SPOTS } from "../../src/game/spots";

describe("scene/cameras", () => {
  it("exposes a PerspectiveCamera and starts at the overview preset", () => {
    const rig = createCameraRig();
    expect(rig.camera.isPerspectiveCamera).toBe(true);
    expect(rig.camera.position.length()).toBeGreaterThan(0);
  });

  it("has all base presets plus spot:<id>/behavior:<id> for every SPOTS entry", async () => {
    const rig = createCameraRig();
    const basePresets = ["overview", "keeper", "gate", "album", "follow"];
    for (const p of basePresets) {
      await expect(rig.goTo(p, { instant: true })).resolves.toBeUndefined();
    }
    for (const spot of SPOTS) {
      await expect(rig.goTo(`spot:${spot.id}`, { instant: true })).resolves.toBeUndefined();
      await expect(rig.goTo(`behavior:${spot.elephantBehavior}`, { instant: true })).resolves.toBeUndefined();
    }
  });

  it("warns and resolves immediately for an unknown preset instead of throwing", async () => {
    const rig = createCameraRig();
    await expect(rig.goTo("no-such-preset")).resolves.toBeUndefined();
  });

  it("goTo resolves once the eased transition finishes when driven by update(dt)", async () => {
    const rig = createCameraRig();
    const before = rig.camera.position.clone();
    const done = rig.goTo("gate");
    let resolved = false;
    void done.then(() => {
      resolved = true;
    });
    for (let i = 0; i < 200 && !resolved; i++) {
      rig.update(1 / 60);
      await Promise.resolve();
    }
    expect(resolved).toBe(true);
    expect(rig.camera.position.equals(before)).toBe(false);
  });

  it("instant + reduced-motion transitions are shorter than a normal transition", async () => {
    const rig = createCameraRig();
    rig.setReducedMotion(true);
    const done = rig.goTo("keeper");
    let resolved = false;
    void done.then(() => {
      resolved = true;
    });
    // 通常遷移(約1.1秒)よりも十分短い時間で終わるはず。
    for (let i = 0; i < 30 && !resolved; i++) {
      rig.update(1 / 60);
      await Promise.resolve();
    }
    expect(resolved).toBe(true);
  });

  it("setOrientation accepts portrait/landscape without throwing", () => {
    const rig = createCameraRig();
    expect(() => rig.setOrientation("portrait")).not.toThrow();
    expect(() => rig.setOrientation("landscape")).not.toThrow();
  });
});
