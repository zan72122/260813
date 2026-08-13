// src/save/save.ts: load()の壊れたデータからの復旧(throw禁止)、update()の部分更新、
// 設定の往復保存、既定値へのリセットを検証する。
import { beforeEach, describe, expect, it } from "vitest";
import { defaultSaveData, loadSave, persistSave, resetSave, SAVE_KEY, updateSave } from "../../src/save/save";

describe("save/save", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loadSave returns the default shape when nothing is stored", () => {
    expect(loadSave()).toEqual(defaultSaveData());
  });

  it("loadSave never throws and recovers to defaults on malformed JSON", () => {
    localStorage.setItem(SAVE_KEY, "{this is not json");
    expect(() => loadSave()).not.toThrow();
    expect(loadSave()).toEqual(defaultSaveData());
  });

  it("loadSave recovers to defaults when the stored value is a JSON array (not an object)", () => {
    localStorage.setItem(SAVE_KEY, "[1,2,3]");
    expect(loadSave()).toEqual(defaultSaveData());
  });

  it("loadSave recovers to defaults when the stored value is a bare JSON primitive", () => {
    localStorage.setItem(SAVE_KEY, "42");
    expect(loadSave()).toEqual(defaultSaveData());
  });

  it("loadSave fills in missing top-level keys (e.g. an old/partial save) with defaults", () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ firstPlayDone: true }));
    const save = loadSave();
    expect(save.firstPlayDone).toBe(true);
    expect(save.freePlayUnlocked).toBe(false);
    expect(save.observedBehaviors).toEqual([]);
    expect(save.settings).toEqual(defaultSaveData().settings);
  });

  it("loadSave fills in missing settings keys individually (partial settings object)", () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ settings: { muted: true } }));
    const save = loadSave();
    expect(save.settings.muted).toBe(true);
    expect(save.settings.ambienceVolume).toBe(defaultSaveData().settings.ambienceVolume);
    expect(save.settings.quality).toBe("auto");
  });

  it("loadSave drops unknown behavior ids while keeping the known ones", () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ ...defaultSaveData(), observedBehaviors: ["dig-sand", "not-a-real-behavior", "peel-banana"] })
    );
    expect(loadSave().observedBehaviors).toEqual(["dig-sand", "peel-banana"]);
  });

  it("loadSave falls back to a valid quality setting when the stored value is not one of low/medium/high/auto", () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ settings: { quality: "ultra" } }));
    expect(loadSave().settings.quality).toBe("auto");
  });

  it("loadSave clamps an out-of-range ambienceVolume into 0..1", () => {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ settings: { ambienceVolume: 4.2 } }));
    expect(loadSave().settings.ambienceVolume).toBe(1);
    localStorage.setItem(SAVE_KEY, JSON.stringify({ settings: { ambienceVolume: -2 } }));
    expect(loadSave().settings.ambienceVolume).toBe(0);
  });

  it("persistSave never throws even if localStorage.setItem throws (quota exceeded, etc.)", () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("QuotaExceededError");
    };
    try {
      expect(() => persistSave(defaultSaveData())).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it("persistSave + loadSave round-trips a fully populated save", () => {
    persistSave({ ...defaultSaveData(), firstPlayDone: true, observedBehaviors: ["probe-gap", "dig-sand"] });
    expect(loadSave().observedBehaviors).toEqual(["probe-gap", "dig-sand"]);
    expect(loadSave().firstPlayDone).toBe(true);
  });

  it("updateSave applies a top-level partial patch without touching unrelated fields", () => {
    persistSave({ ...defaultSaveData(), freePlayUnlocked: true });
    const result = updateSave({ firstPlayDone: true });
    expect(result.firstPlayDone).toBe(true);
    expect(result.freePlayUnlocked).toBe(true); // 既存値を保持
  });

  it("updateSave merges a settings patch at the key level (settings round-trip)", () => {
    updateSave({ settings: { muted: true } });
    updateSave({ settings: { ambienceVolume: 0.2 } });
    const save = loadSave();
    expect(save.settings.muted).toBe(true); // 前のupdateSave呼び出しの値を保持
    expect(save.settings.ambienceVolume).toBe(0.2);
    expect(save.settings.reducedMotion).toBe(false); // 触っていない値は既定のまま
  });

  it("updateSave persists immediately (visible to a subsequent loadSave)", () => {
    updateSave({ settings: { dimLight: true, quality: "low" } });
    const reloaded = loadSave();
    expect(reloaded.settings.dimLight).toBe(true);
    expect(reloaded.settings.quality).toBe("low");
  });

  it("resetSave overwrites any existing save with defaults and returns them", () => {
    persistSave({ ...defaultSaveData(), firstPlayDone: true, observedBehaviors: ["break-branch"] });
    const result = resetSave();
    expect(result).toEqual(defaultSaveData());
    expect(loadSave()).toEqual(defaultSaveData());
  });
});
