import { beforeEach, describe, expect, it } from "vitest";
import { commitAlbumToSave, createAlbum, defaultSaveData, loadSave, persistSave, recordBehavior, resetSessionAlbum, SAVE_KEY } from "../../src/game/album";

describe("game/album", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loadSave returns defaults when nothing is stored", () => {
    const save = loadSave();
    expect(save).toEqual(defaultSaveData());
  });

  it("loadSave recovers with defaults (never throws) on malformed JSON", () => {
    localStorage.setItem(SAVE_KEY, "{not json");
    expect(() => loadSave()).not.toThrow();
    expect(loadSave()).toEqual(defaultSaveData());
  });

  it("loadSave drops unknown behavior ids from a corrupted observedBehaviors array", () => {
    localStorage.setItem(
      SAVE_KEY,
      JSON.stringify({ version: 1, firstPlayDone: true, freePlayUnlocked: true, observedBehaviors: ["dig-sand", "not-a-behavior"], settings: {} })
    );
    const save = loadSave();
    expect(save.observedBehaviors).toEqual(["dig-sand"]);
  });

  it("persistSave + loadSave round-trips", () => {
    const data = defaultSaveData();
    data.firstPlayDone = true;
    data.observedBehaviors = ["probe-gap", "dig-sand"];
    persistSave(data);
    expect(loadSave()).toEqual(data);
  });

  it("createAlbum starts with an empty session list and loads cumulative observed behaviors from save", () => {
    persistSave({ ...defaultSaveData(), observedBehaviors: ["reach-pipe"] });
    const album = createAlbum();
    expect(album.sessionBehaviors).toEqual([]);
    expect(album.observedBehaviors).toEqual(["reach-pipe"]);
  });

  it("recordBehavior appends to sessionBehaviors (with duplicates) and observedBehaviors (deduped)", () => {
    const album = createAlbum();
    recordBehavior(album, "probe-gap");
    recordBehavior(album, "dig-sand");
    recordBehavior(album, "probe-gap");
    expect(album.sessionBehaviors).toEqual(["probe-gap", "dig-sand", "probe-gap"]);
    expect(album.observedBehaviors).toEqual(["probe-gap", "dig-sand"]);
  });

  it("resetSessionAlbum clears sessionBehaviors but keeps cumulative observedBehaviors", () => {
    const album = createAlbum();
    recordBehavior(album, "break-branch");
    resetSessionAlbum(album);
    expect(album.sessionBehaviors).toEqual([]);
    expect(album.observedBehaviors).toEqual(["break-branch"]);
  });

  it("commitAlbumToSave marks firstPlayDone/freePlayUnlocked and merges observed behaviors into the persisted save", () => {
    const album = createAlbum();
    recordBehavior(album, "peel-banana");
    const saved = commitAlbumToSave(album);
    expect(saved.firstPlayDone).toBe(true);
    expect(saved.freePlayUnlocked).toBe(true);
    expect(saved.observedBehaviors).toContain("peel-banana");
    expect(loadSave().observedBehaviors).toContain("peel-banana");
  });

  it("commitAlbumToSave accumulates across multiple sessions without losing earlier behaviors", () => {
    const first = createAlbum();
    recordBehavior(first, "probe-gap");
    commitAlbumToSave(first);

    const second = createAlbum();
    recordBehavior(second, "dig-sand");
    const saved = commitAlbumToSave(second);
    expect(saved.observedBehaviors.sort()).toEqual(["dig-sand", "probe-gap"].sort());
  });
});
