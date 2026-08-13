// FSM+session+album+events(+worldはモック)で、
// 「隠す(hideFoodDirect)→gate→seek(behaviorイベント模擬)→album→再プレイ」の一周をjsdomで検証する。
import { beforeEach, describe, expect, it } from "vitest";
import type { PerspectiveCamera, Scene } from "three";
import { createEventBus } from "../../src/core/events";
import { createFsm } from "../../src/core/fsm";
import { createGameApp } from "../../src/ui/app";
import type { CameraRig } from "../../src/scene/cameras";
import type { World } from "../../src/scene/world";
import type { BehaviorId, EventBus, FoodKind, GamePhase, SpotKind } from "../../src/core/types";
import { getSpot, SPOTS } from "../../src/game/spots";
import { SAVE_KEY } from "../../src/game/album";

function createMockWorld(): { world: World; events: EventBus; placed: Map<SpotKind, FoodKind> } {
  const events = createEventBus();
  const placed = new Map<SpotKind, FoodKind>();
  const world: World = {
    scene: {} as unknown as Scene,
    update: () => {},
    setQuality: () => {},
    setTimeOfDay: () => {},
    setReducedMotion: () => {},
    placeFood: (spotId, food) => {
      placed.set(spotId, food);
    },
    clearFoods: () => {
      placed.clear();
    },
    openGate: async () => {},
    elephantSeek: async (spotId: SpotKind, food: FoodKind) => {
      const behaviorId = getSpot(spotId).elephantBehavior;
      placed.set(spotId, food);
      events.emit("behavior:start", { behaviorId, spotId });
      events.emit("behavior:complete", { behaviorId, spotId });
    },
    elephantEnter: async () => {},
    elephantIdleAt: () => {},
    highlightSpot: () => {},
    dispose: () => {},
    registerHooks: () => {},
    getDebugInfo: () => ({ elephant: { present: true, visible: true, state: "idle", position: { x: 0, y: 0, z: 0 } } }),
    events,
    playBehaviorDirect: async (id: BehaviorId) => {
      const spot = SPOTS.find((s) => s.elephantBehavior === id);
      if (!spot) return;
      events.emit("behavior:start", { behaviorId: id, spotId: spot.id });
      events.emit("behavior:complete", { behaviorId: id, spotId: spot.id });
    },
    setCameraRig: () => {},
    playIntro: async () => {},
    keeperPointAt: () => {}
  };
  return { world, events, placed };
}

function createMockCameraRig(): CameraRig {
  return {
    camera: {} as unknown as PerspectiveCamera,
    goTo: async () => {},
    setOrientation: () => {},
    update: () => {},
    registerPreset: () => {},
    setFollowTarget: () => {},
    setReducedMotion: () => {}
  };
}

function setup(seed = 42): {
  app: ReturnType<typeof createGameApp>;
  fsm: ReturnType<typeof createFsm>;
  world: World;
  events: EventBus;
  uiRoot: HTMLElement;
} {
  localStorage.clear();
  const uiRoot = document.createElement("div");
  document.body.appendChild(uiRoot);
  const { world, events } = createMockWorld();
  const cameraRig = createMockCameraRig();
  const fsm = createFsm();
  const app = createGameApp({ uiRoot, world, cameraRig, fsm, seed });
  return { app, fsm, world, events, uiRoot };
}

/** album画面に実際に描画された大ボタンを、表示ラベル(ひらがな文言)から探してクリックする。
 * screens/album.tsのボタンハンドラ(regenerateSession→transition)を実際のDOM経路で検証するため。 */
function clickAlbumButton(uiRoot: HTMLElement, label: string): void {
  const found = Array.from(uiRoot.querySelectorAll<HTMLElement>(".big-btn__label")).find((el) => el.textContent === label);
  const btn = found?.closest("button");
  if (!btn) throw new Error(`[test] album button not found: ${label}`);
  btn.click();
}

describe("integration: full play loop (world mocked)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("boots straight into the title phase", () => {
    const { fsm } = setup();
    expect(fsm.phase).toBe("title");
  });

  it("drives hide(3, guided) -> gate -> seek(3 behavior events) -> album, ending with a populated album and a persisted save", async () => {
    const { app, fsm, events } = setup(7);

    const phases: GamePhase[] = [];
    events.on("phase:changed", (p) => phases.push(p.phase));

    app.jumpTo("hide");
    expect(fsm.phase).toBe("hide");
    const snapshot1 = app.getDebugSnapshot() as { session: { config: { spots: SpotKind[]; guided: boolean } } };
    const spots = snapshot1.session.config.spots;
    expect(snapshot1.session.config.guided).toBe(true);
    expect(spots).toHaveLength(3);

    const foodHiddenSpots: SpotKind[] = [];
    const offFoodHidden = events.on("food:hidden", (p) => foodHiddenSpots.push(p.spotId));

    let hideCompleteCount = 0;
    const offHideComplete = events.on("hide:complete", () => {
      hideCompleteCount += 1;
    });

    for (const spotId of spots) {
      const food = getSpot(spotId).acceptedFoodTypes[0];
      if (!food) throw new Error("test setup: spot has no accepted food");
      await app.hideFoodDirect(spotId, food);
    }

    expect(foodHiddenSpots.sort()).toEqual([...spots].sort());
    expect(hideCompleteCount).toBe(1);
    expect(fsm.phase).toBe("gate"); // hide:complete後、hideFoodDirectが自動でgateへ進める

    offFoodHidden();
    offHideComplete();

    app.jumpTo("seek");
    expect(fsm.phase).toBe("seek");

    app.jumpTo("album");
    expect(fsm.phase).toBe("album");
    const snapshot2 = app.getDebugSnapshot() as { album: { observed: BehaviorId[] } };
    expect(snapshot2.album.observed).toHaveLength(3);

    const save = JSON.parse(localStorage.getItem(SAVE_KEY) ?? "null");
    expect(save.firstPlayDone).toBe(true);
    expect(save.freePlayUnlocked).toBe(true);
    expect(save.observedBehaviors).toHaveLength(3);

    expect(phases).toContain("hide");
    expect(phases).toContain("gate");
    expect(phases).toContain("seek");
    expect(phases).toContain("album");
  });

  it("simulates a free-play round with all 5 spots hidden and 5 behavior:complete events observed", () => {
    const { events, world } = setup(11);

    // 自由遊び(最大5スポット)を想定し、world.elephantSeekを5回模擬してseekの
    // 挙動(behavior:start/complete)がSPOTS全種を正しく網羅することを検証する。
    const behaviorEvents: BehaviorId[] = [];
    const off = events.on("behavior:complete", (p) => behaviorEvents.push(p.behaviorId));
    for (const spot of SPOTS) {
      void world.elephantSeek(spot.id, spot.acceptedFoodTypes[0] as FoodKind);
    }
    expect(behaviorEvents).toHaveLength(5);
    expect(new Set(behaviorEvents).size).toBe(5); // 5種の行動すべてが少なくとも1回観測された
    off();
  });

  it("jumpTo builds prerequisite state automatically for each phase (docs/INTERFACES.md DebugApi contract)", () => {
    const { app, fsm } = setup(3);

    app.jumpTo("gate");
    expect(fsm.phase).toBe("gate");
    const afterGate = app.getDebugSnapshot() as { session: { hidden: unknown[]; config: { spots: unknown[] } } };
    expect(afterGate.session.hidden.length).toBe(afterGate.session.config.spots.length);

    app.jumpTo("album");
    expect(fsm.phase).toBe("album");
    const afterAlbum = app.getDebugSnapshot() as { session: { found: unknown[] } };
    expect(afterAlbum.session.found.length).toBeGreaterThan(0);
  });

  it("replaying via the real album screen's 'もういちど' button starts a fresh session and returns to hide", () => {
    const { app, fsm, uiRoot } = setup(5);
    app.jumpTo("album");
    expect(fsm.phase).toBe("album");
    const before = app.getDebugSnapshot() as { session: { config: { seed: number } } };

    // screens/album.tsが実際に描画した「もういちど」ボタンをクリックする(regenerateSession→
    // transition("hide")という本物のUI経路を経由して検証する、fsm.transition直叩きではない)。
    clickAlbumButton(uiRoot, "もういちど");

    expect(fsm.phase).toBe("hide");
    const after = app.getDebugSnapshot() as { session: { config: { seed: number } } };
    expect(after.session.config.seed).not.toBe(before.session.config.seed);
  });

  it("ignores an out-of-order jumpTo('boot') without throwing (boot is not a legal transition target)", () => {
    const { app, fsm } = setup(1);
    app.jumpTo("hide");
    expect(() => app.jumpTo("boot")).not.toThrow();
    expect(fsm.phase).toBe("hide"); // 変化しない
  });

  it("emits phase:changed with the correct prev phase on every transition", () => {
    const { app, events } = setup(9);
    const seen: Array<{ phase: GamePhase; prev: GamePhase }> = [];
    events.on("phase:changed", (p) => seen.push(p));
    app.jumpTo("hide");
    app.jumpTo("gate");
    const hideTransition = seen.find((s) => s.phase === "gate");
    expect(hideTransition?.prev).toBe("hide");
  });
});
