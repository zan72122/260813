// hide画面: 餌トレイからドラッグ→3D空間のスポットへ吸着→接写→スポット固有の仕上げ操作。
import * as THREE from "three";
import type { BehaviorId, SpotKind } from "../../core/types";
import type { AppContext } from "../context";
import { createFoodTray, type FoodTrayItem } from "../components/foodTray";
import { createBigButton } from "../components/bigButton";
import { createHintTimer, difficultyToDelaySeconds } from "../../game/hints";
import { isHideComplete, recordHidden, remainingSpots } from "../../game/session";
import { getSpot } from "../../game/spots";
import { createRng } from "../../core/rng";
import { el } from "../dom";
import { drawBehaviorIcon, drawShuffleGlyph, makeIconCanvas } from "../icons";

const REQUIRED_SWIPES: Record<SpotKind, number> = {
  "stone-gap": 1,
  sand: 2,
  pipe: 1,
  "banyan-root": 1,
  "high-branch": 1
};

const FINISH_LABEL: Record<SpotKind, string> = {
  "stone-gap": "そっと おしこもう",
  sand: "すなを かけよう",
  pipe: "おくへ おそう",
  "banyan-root": "ねっこの おくへ",
  "high-branch": "うえに あげよう"
};

const SNAP_SLACK = 1.7; // 4歳児向けに広めの吸着(spot.snapRadiusをさらに緩和)

function pickNearestSpot(clientX: number, clientY: number, camera: THREE.PerspectiveCamera, candidateIds: SpotKind[]): { id: SpotKind; distance: number } | null {
  if (candidateIds.length === 0) return null;
  const ndcX = (clientX / window.innerWidth) * 2 - 1;
  const ndcY = -(clientY / window.innerHeight) * 2 + 1;
  const raycaster = new THREE.Raycaster();
  raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
  let best: { id: SpotKind; distance: number } | null = null;
  for (const id of candidateIds) {
    const spot = getSpot(id);
    const p = new THREE.Vector3(spot.position.x, spot.position.y, spot.position.z);
    const d = raycaster.ray.distanceToPoint(p);
    if (!best || d < best.distance) best = { id, distance: d };
  }
  return best;
}

function runFinishGesture(root: HTMLElement, spotId: SpotKind, behaviorId: BehaviorId): Promise<void> {
  const required = REQUIRED_SWIPES[spotId];
  return new Promise<void>((resolve) => {
    const overlay = el("div", { className: "finish-gesture" });
    overlay.style.touchAction = "none";
    const iconWrap = el("div", { className: "finish-gesture__icon" });
    const canvas = makeIconCanvas(112);
    drawBehaviorIcon(canvas, behaviorId, 112);
    iconWrap.appendChild(canvas);
    overlay.appendChild(iconWrap);
    overlay.appendChild(el("p", { className: "finish-gesture__label", text: FINISH_LABEL[spotId] }));
    const dotsWrap = el("div", { className: "finish-gesture__dots" });
    const dotEls: HTMLElement[] = [];
    for (let i = 0; i < required; i++) {
      const dot = el("span", { className: "finish-gesture__dot" });
      dotsWrap.appendChild(dot);
      dotEls.push(dot);
    }
    overlay.appendChild(dotsWrap);
    root.appendChild(overlay);

    let count = 0;
    let tracking = false;
    let startX = 0;
    let startY = 0;

    overlay.addEventListener("pointerdown", (ev) => {
      tracking = true;
      startX = ev.clientX;
      startY = ev.clientY;
      overlay.setPointerCapture(ev.pointerId);
    });
    const finishSwipe = (ev: PointerEvent): void => {
      if (!tracking) return;
      tracking = false;
      const dist = Math.hypot(ev.clientX - startX, ev.clientY - startY);
      if (dist < 24) return; // 誤操作吸収: 小さすぎる動きは無視
      count = Math.min(required, count + 1);
      const dot = dotEls[count - 1];
      dot?.classList.add("finish-gesture__dot--on");
      iconWrap.classList.remove("finish-gesture__icon--pulse");
      void iconWrap.offsetWidth;
      iconWrap.classList.add("finish-gesture__icon--pulse");
      if (count >= required) {
        overlay.classList.add("finish-gesture--done");
        setTimeout(() => {
          overlay.remove();
          resolve();
        }, 320);
      }
    };
    overlay.addEventListener("pointerup", finishSwipe);
    overlay.addEventListener("pointercancel", () => {
      tracking = false;
    });
  });
}

export function mountHideScreen(ctx: AppContext): () => void {
  const session = ctx.getSession();
  if (!session) {
    console.warn("[hide] mounted without an active session, forcing title");
    ctx.transition("title");
    return () => {};
  }

  // hoistされるfunction宣言(下のplaceInto/finishHiding)はTSのnarrowing恩恵を受けられないため、
  // narrowing後のsessionを独立した非nullの束縛として持たせておく。
  const activeSession = session;

  const root = el("div", { className: "screen screen--hide" });
  ctx.uiRoot.appendChild(root);

  const trayRng = createRng(session.config.seed).fork("hide-tray");
  const items: FoodTrayItem[] = session.config.spots.map((spotId) => {
    const spot = getSpot(spotId);
    return { id: spotId, food: trayRng.pick(spot.acceptedFoodTypes) };
  });

  let busy = false; // 仕上げ演出中は次のドラッグを開始させない
  let snapTarget: SpotKind | null = null;

  const tray = createFoodTray(items, {
    onDragStart: () => {
      hint.reset();
    },
    onDragMove: (_item, clientX, clientY) => {
      hint.reset();
      if (busy) return;
      const candidates = remainingSpots(session);
      const nearest = pickNearestSpot(clientX, clientY, ctx.cameraRig.camera, candidates);
      const next = nearest && nearest.distance <= getSpot(nearest.id).snapRadius * SNAP_SLACK ? nearest.id : null;
      if (next !== snapTarget) {
        snapTarget = next;
        ctx.world.highlightSpot(snapTarget);
      }
    },
    onDragEnd: (item) => {
      hint.reset();
      if (busy || !snapTarget) {
        tray.returnItem(item.id);
        ctx.world.highlightSpot(null);
        snapTarget = null;
        return;
      }
      const spotId = snapTarget;
      snapTarget = null;
      ctx.world.highlightSpot(null);
      void placeInto(spotId, item);
    }
  });
  root.appendChild(tray.node);

  const proceedBtn = createBigButton({
    label: "ゲートへ",
    icon: drawShuffleGlyph,
    iconSize: 28,
    size: "large",
    variant: "secondary",
    onTap: () => finishHiding()
  });
  proceedBtn.classList.add("hide-proceed-btn");
  proceedBtn.style.display = "none";
  root.appendChild(proceedBtn);

  let done = false;
  async function placeInto(spotId: SpotKind, item: FoodTrayItem): Promise<void> {
    busy = true;
    const spot = getSpot(spotId);
    await ctx.cameraRig.goTo(`spot:${spotId}`);
    await runFinishGesture(root, spotId, spot.elephantBehavior);
    ctx.world.placeFood(spotId, item.food);
    recordHidden(activeSession, spotId, item.food);
    ctx.events.emit("food:hidden", { spotId, food: item.food });
    tray.markPlaced(item.id);
    await ctx.cameraRig.goTo("overview");
    busy = false;
    if (isHideComplete(activeSession)) {
      finishHiding();
    } else if (activeSession.config.freePlay && activeSession.hidden.length >= 1) {
      proceedBtn.style.display = "";
    }
  }

  function finishHiding(): void {
    if (done) return;
    if (activeSession.hidden.length === 0) return;
    done = true;
    ctx.events.emit("hide:complete", { count: activeSession.hidden.length });
    ctx.transition("gate");
  }

  const hint = createHintTimer({
    events: ctx.events,
    getDelaySeconds: () => {
      const remaining = remainingSpots(session);
      if (remaining.length === 0) return 5;
      const maxDifficulty = Math.max(...remaining.map((id) => getSpot(id).difficulty));
      return difficultyToDelaySeconds(maxDifficulty);
    },
    getSpotId: () => {
      const remaining = remainingSpots(session);
      return remaining.length > 0 ? (remaining[0] ?? null) : null;
    }
  });
  hint.start();
  root.addEventListener("pointerdown", () => hint.reset());

  void ctx.cameraRig.goTo("overview");
  ctx.world.clearFoods();

  const unsubOrientation = ctx.onOrientation((o) => tray.setOrientation(o));
  tray.setOrientation(ctx.getOrientation());

  return () => {
    hint.dispose();
    unsubOrientation();
    tray.dispose();
    ctx.world.highlightSpot(null);
    ctx.world.keeperPointAt(null);
    root.remove();
  };
}
