import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorld } from "../../src/scene/world";
import { SPOTS } from "../../src/game/spots";
import type { FoodKind, SpotKind } from "../../src/core/types";

// jsdom環境: canvas.getContext('2d')はnullを返す(canvasパッケージ未導入のため)。
// scene/environment/proc.ts のmakeCanvasTexture等はnullガード済みなので、
// world構築が例外を投げないことそのものがコード生成テクスチャの安全性の裏付けになる。

describe("scene/world smoke", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("builds a THREE.Scene with environment content without throwing", () => {
    const world = createWorld();
    expect(world.scene.isScene).toBe(true);
    expect(world.scene.children.length).toBeGreaterThan(5);
  });

  it("setQuality/setTimeOfDay/setReducedMotion and update(dt) do not throw", () => {
    const world = createWorld();
    expect(() => world.setQuality("low")).not.toThrow();
    expect(() => world.setQuality("high")).not.toThrow();
    expect(() => world.setTimeOfDay("noon")).not.toThrow();
    expect(() => world.setTimeOfDay("evening")).not.toThrow();
    expect(() => world.setReducedMotion(true)).not.toThrow();
    for (let i = 0; i < 10; i++) expect(() => world.update(1 / 60)).not.toThrow();
    world.dispose();
  });

  it("placeFood/clearFoods works for every SpotKind x FoodKind without throwing", () => {
    const world = createWorld();
    const foods: FoodKind[] = ["vegetable", "hay-cube", "banana-stem", "branch", "grass"];
    const before = world.scene.children.length;
    for (const spot of SPOTS) {
      for (const food of foods) {
        expect(() => world.placeFood(spot.id, food)).not.toThrow();
      }
    }
    // 各スポットにつき最後に置いた1食のみ残る(placeFoodは既存を差し替える)。
    expect(world.scene.children.length).toBe(before + SPOTS.length);
    expect(() => world.clearFoods()).not.toThrow();
    expect(world.scene.children.length).toBe(before);
    world.dispose();
  });

  it("highlightSpot toggles on/off for every SpotKind without throwing", () => {
    const world = createWorld();
    for (const spot of SPOTS) {
      expect(() => world.highlightSpot(spot.id)).not.toThrow();
      world.update(1 / 60);
    }
    expect(() => world.highlightSpot(null)).not.toThrow();
    world.dispose();
  });

  it("openGate falls back to warn+resolve when no hook is registered; elephantEnter/elephantIdleAt/elephantSeek are wired by S3/S3b by default", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const world = createWorld({ reducedMotion: true });

    const gateDone = world.openGate();
    let gateResolved = false;
    void gateDone.then(() => {
      gateResolved = true;
    });
    for (let i = 0; i < 60 && !gateResolved; i++) {
      world.update(1 / 60);
      await Promise.resolve();
    }
    expect(gateResolved).toBe(true);
    expect(warnSpy).toHaveBeenCalled();

    // elephantEnter/elephantIdleAtはS3がregisterHooksでデフォルト接続する。
    // 実際に歩行+匂い探索アニメーションを再生するのでupdate(dt)を積んで進める必要がある。
    let enterResolved = false;
    const enterDone = world.elephantEnter();
    void enterDone.then(() => {
      enterResolved = true;
    });
    for (let i = 0; i < 900 && !enterResolved; i++) {
      world.update(1 / 60);
      await Promise.resolve();
    }
    expect(enterResolved).toBe(true);
    expect(() => world.elephantIdleAt(null)).not.toThrow();

    // elephantSeekはS3b(このタスク)がregisterHooksでデフォルト接続する: 実際に歩行→匂い探索→
    // 行動再生→餌消費まで行うため即resolveではなくupdate(dt)を積んで進める必要がある。
    // 検証を軽くするため対象spotの近くへ事前に瞬間移動させておく(walkToSpotの距離を縮める)。
    world.elephantIdleAt({ x: 0, y: 0, z: 2.4 });
    let seekResolved = false;
    const seekDone = world.elephantSeek("sand", "hay-cube");
    void seekDone.then(() => {
      seekResolved = true;
    });
    for (let i = 0; i < 4000 && !seekResolved; i++) {
      world.update(1 / 60);
      await Promise.resolve();
    }
    expect(seekResolved).toBe(true);
    // behavior:start/completeがイベントバス経由で発火していること(S3bの契約)。
    world.dispose();
  });

  it("elephantSeek emits behavior:start then behavior:complete via world.events, and playBehaviorDirect works standalone", async () => {
    const world = createWorld({ reducedMotion: true, seed: 7 });
    const order: string[] = [];
    world.events.on("behavior:start", (p) => order.push(`start:${p.behaviorId}:${p.spotId}`));
    world.events.on("behavior:complete", (p) => order.push(`complete:${p.behaviorId}:${p.spotId}`));

    let done = false;
    const p = world.playBehaviorDirect("dig-sand");
    void p.then(() => {
      done = true;
    });
    for (let i = 0; i < 4000 && !done; i++) {
      world.update(1 / 60);
      await Promise.resolve();
    }
    expect(done).toBe(true);
    expect(order).toEqual(["start:dig-sand:sand", "complete:dig-sand:sand"]);

    world.dispose();
  });

  it("registerHooks lets S3 override the elephant/gate fallbacks", async () => {
    const world = createWorld();
    const openGate = vi.fn().mockResolvedValue(undefined);
    const elephantSeek = vi.fn().mockResolvedValue(undefined);
    const elephantEnter = vi.fn().mockResolvedValue(undefined);
    const elephantIdleAt = vi.fn();
    world.registerHooks({ openGate, elephantSeek, elephantEnter, elephantIdleAt });

    await world.openGate();
    expect(openGate).toHaveBeenCalledTimes(1);

    const spotId: SpotKind = "pipe";
    await world.elephantSeek(spotId, "grass");
    expect(elephantSeek).toHaveBeenCalledWith(spotId, "grass");

    await world.elephantEnter();
    expect(elephantEnter).toHaveBeenCalledTimes(1);

    world.elephantIdleAt(null);
    expect(elephantIdleAt).toHaveBeenCalledWith(null);

    world.dispose();
  });

  it("dispose() clears foods and does not throw when called twice", () => {
    const world = createWorld();
    world.placeFood("sand", "hay-cube");
    expect(() => world.dispose()).not.toThrow();
    expect(() => world.dispose()).not.toThrow();
  });
});
