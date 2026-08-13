// main.ts全面配線の要: FSM×UI×world×cameras×hints×session×album×debugをここで束ねる。
// フェーズが変わるたびに対応するscreens/*をmount/unmountし、hint:showを飼育員演出へ橋渡しする。
import type { CameraRig } from "../scene/cameras";
import type { World } from "../scene/world";
import type { FoodKind, GamePhase, GameStateMachine, SpotKind } from "../core/types";
import type { AppContext } from "./context";
import { createAlbum, loadSave, persistSave, recordBehavior } from "../game/album";
import { createSession, isHideComplete, recordFound, recordHidden, type CreateSessionOptions } from "../game/session";
import { getSpot } from "../game/spots";
import { getOrientation, onOrientationChange } from "./dom";
import { createHintBubble } from "./components/hintBubble";
import { mountTitleScreen } from "./screens/title";
import { mountIntroScreen } from "./screens/intro";
import { mountHideScreen } from "./screens/hide";
import { mountGateScreen } from "./screens/gate";
import { mountSeekScreen } from "./screens/seek";
import { mountAlbumScreen } from "./screens/album";

// docs/INTERFACES.mdのFSM遷移表をここでも参照する(core/fsm.tsは内部にしか持たないため複製、
// jumpToの経路探索専用。正当な遷移の定義そのものはcore/fsm.ts側が引き続き強制する)。
const PHASE_GRAPH: Record<GamePhase, GamePhase[]> = {
  boot: ["title"],
  title: ["intro", "hide"],
  intro: ["hide"],
  hide: ["gate"],
  gate: ["seek"],
  seek: ["album"],
  album: ["hide", "title"]
};

function findPath(from: GamePhase, to: GamePhase): GamePhase[] {
  if (from === to) return [];
  const queue: GamePhase[] = [from];
  const prev = new Map<GamePhase, GamePhase>();
  const visited = new Set<GamePhase>([from]);
  while (queue.length > 0) {
    const cur = queue.shift();
    if (!cur) break;
    for (const next of PHASE_GRAPH[cur]) {
      if (visited.has(next)) continue;
      visited.add(next);
      prev.set(next, cur);
      if (next === to) {
        const path: GamePhase[] = [to];
        let c = cur;
        while (c !== from) {
          path.unshift(c);
          const p = prev.get(c);
          if (!p) break;
          c = p;
        }
        return path;
      }
      queue.push(next);
    }
  }
  return [];
}

export interface CreateGameAppOptions {
  uiRoot: HTMLElement;
  world: World;
  cameraRig: CameraRig;
  fsm: GameStateMachine & { setFreePlay(on: boolean): void };
  seed: number;
}

export interface GameApp {
  /** 必要な前提状態を自動構築してphaseへ遷移する(docs/INTERFACES.mdのDebugApi.jumpTo契約)。 */
  jumpTo(phase: GamePhase): void;
  /** ドラッグ操作を経由せず1食材を直接隠す(E2E/QA向け、手動ドラッグ経路は screens/hide.ts に別途残る)。 */
  hideFoodDirect(spotId: SpotKind, food: FoodKind): Promise<void>;
  getDebugSnapshot(): unknown;
  destroy(): void;
}

export function createGameApp(opts: CreateGameAppOptions): GameApp {
  const { uiRoot, world, cameraRig, fsm } = opts;
  const events = world.events;

  const save = loadSave();
  if (save.settings.reducedMotion) {
    world.setReducedMotion(true);
    cameraRig.setReducedMotion(true);
  }

  const album = createAlbum();
  let session: ReturnType<typeof createSession> | null = null;
  let seedCounter = opts.seed >>> 0;

  function regenerateSession(sessionOpts: CreateSessionOptions): ReturnType<typeof createSession> {
    const next = createSession(seedCounter, sessionOpts);
    seedCounter = (seedCounter + 1) >>> 0;
    session = next;
    album.sessionBehaviors = [];
    return next;
  }

  // 常設のヒント吹き出し(画面フェーズが変わっても生き続ける唯一のオーバーレイ)。
  const hintBubble = createHintBubble();
  hintBubble.node.classList.add("hint-bubble--floating");
  uiRoot.appendChild(hintBubble.node);
  const unsubHint = events.on("hint:show", ({ spotId }) => {
    hintBubble.pulse();
    if (spotId) {
      const spot = getSpot(spotId);
      world.keeperPointAt(spot.position);
    } else {
      world.keeperPointAt(null);
    }
  });
  // elephant:arrived(docs/INTERFACES.md契約)はbehavior:startと同時に成立したとみなし橋渡しする
  // (S3bのworld.tsはbehavior:start/completeのみemitするため、S4側でこのイベントを補完する)。

  const ctx: AppContext = {
    uiRoot,
    world,
    cameraRig,
    fsm,
    events,
    getSession: () => session,
    setSession: (s) => {
      session = s;
    },
    album,
    save,
    persistSaveNow: () => persistSave(save),
    getOrientation,
    onOrientation: onOrientationChange,
    regenerateSession,
    transition: (to) => fsm.transition(to),
    hideFoodDirect
  };

  const SCREEN_MOUNTERS: Partial<Record<GamePhase, (c: AppContext) => () => void>> = {
    title: mountTitleScreen,
    intro: mountIntroScreen,
    hide: mountHideScreen,
    gate: mountGateScreen,
    seek: mountSeekScreen,
    album: mountAlbumScreen
  };

  let currentUnmount: (() => void) | null = null;
  const unsubFsm = fsm.onChange((phase, prev) => {
    events.emit("phase:changed", { phase, prev });
    currentUnmount?.();
    currentUnmount = null;
    const mounter = SCREEN_MOUNTERS[phase];
    if (mounter) currentUnmount = mounter(ctx);
  });

  // boot -> title は起動直後に1回だけ自動で進める(main.ts側でact指定が無い通常起動の場合)。
  if (fsm.phase === "boot") {
    fsm.transition("title");
  }

  async function hideFoodDirect(spotId: SpotKind, food: FoodKind): Promise<void> {
    if (!session) {
      console.warn("[app] hideFoodDirect: no active session, ignoring");
      return;
    }
    await cameraRig.goTo(`spot:${spotId}`);
    world.placeFood(spotId, food);
    recordHidden(session, spotId, food);
    events.emit("food:hidden", { spotId, food });
    if (isHideComplete(session)) {
      events.emit("hide:complete", { count: session.hidden.length });
      if (fsm.phase === "hide") fsm.transition("gate");
    }
  }

  function prepareForPhase(next: GamePhase): void {
    switch (next) {
      case "hide": {
        const guided = !save.firstPlayDone;
        regenerateSession({ guided, freePlay: fsm.freePlay });
        world.clearFoods();
        break;
      }
      case "gate": {
        if (session) {
          const s = session;
          for (const spotId of s.config.spots) {
            if (s.hidden.some((h) => h.spotId === spotId)) continue;
            const spot = getSpot(spotId);
            const food = spot.acceptedFoodTypes[0];
            if (!food) continue;
            world.placeFood(spotId, food);
            recordHidden(s, spotId, food);
            events.emit("food:hidden", { spotId, food });
          }
          events.emit("hide:complete", { count: s.hidden.length });
        }
        break;
      }
      case "seek": {
        void world.openGate().then(() => world.elephantEnter());
        events.emit("gate:opened", {});
        break;
      }
      case "album": {
        if (session) {
          const s = session;
          for (const h of s.hidden) {
            if (s.found.includes(h.spotId)) continue;
            recordFound(s, h.spotId);
            recordBehavior(album, getSpot(h.spotId).elephantBehavior);
          }
        }
        break;
      }
      case "title":
      case "intro":
      case "boot":
        break;
    }
  }

  function jumpTo(target: GamePhase): void {
    if (target === "boot") return; // bootへ戻る遷移は無い(初期状態のみ)。QAからは無視する。
    if (fsm.phase === target) return; // 既にそのphaseなら何もしない(冪等)
    const path = findPath(fsm.phase, target);
    if (path.length === 0) {
      console.warn(`[app] jumpTo(${target}): no reachable path from "${fsm.phase}"`);
      return;
    }
    for (const step of path) {
      prepareForPhase(step);
      fsm.transition(step);
    }
  }

  function getDebugSnapshot(): unknown {
    return {
      phase: fsm.phase,
      freePlay: fsm.freePlay,
      session,
      album: { session: album.sessionBehaviors, observed: album.observedBehaviors },
      elephant: world.getDebugInfo().elephant
    };
  }

  function destroy(): void {
    unsubFsm();
    unsubHint();
    hintBubble.dispose();
    currentUnmount?.();
    currentUnmount = null;
  }

  return { jumpTo, hideFoodDirect, getDebugSnapshot, destroy };
}
