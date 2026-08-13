// seek画面: UIは最小(上部に小さな進行ドット)。world.elephantSeek()をseekOrder順に自動実行し、
// behavior:completeごとに小さな絵カードをふわっと出す。全完了でseek:complete→album。
import type { BehaviorId } from "../../core/types";
import type { AppContext } from "../context";
import { createProgressDots } from "../hud";
import { nextSeekTarget, recordFound } from "../../game/session";
import { recordBehavior } from "../../game/album";
import { getSpot } from "../../game/spots";
import { el } from "../dom";
import { drawBehaviorIcon, makeIconCanvas } from "../icons";

export function mountSeekScreen(ctx: AppContext): () => void {
  const session = ctx.getSession();
  if (!session) {
    console.warn("[seek] mounted without an active session, forcing title");
    ctx.transition("title");
    return () => {};
  }

  // hoistされるfunction宣言(下のrun())はTSのnarrowing恩恵を受けられないため、
  // narrowing後のsessionを独立した非nullの束縛として持たせておく。
  const activeSession = session;

  const root = el("div", { className: "screen screen--seek" });
  ctx.uiRoot.appendChild(root);

  const dots = createProgressDots();
  dots.node.classList.add("seek-progress");
  dots.setTotal(session.hidden.length);
  dots.setFound(session.found.length);
  root.appendChild(dots.node);

  const cardLayer = el("div", { className: "seek-card-layer" });
  root.appendChild(cardLayer);

  function popCard(behaviorId: BehaviorId): void {
    const card = el("div", { className: "seek-pop-card" });
    const canvas = makeIconCanvas(84);
    drawBehaviorIcon(canvas, behaviorId, 84);
    card.appendChild(canvas);
    cardLayer.appendChild(card);
    requestAnimationFrame(() => card.classList.add("seek-pop-card--show"));
    setTimeout(() => {
      card.classList.remove("seek-pop-card--show");
      setTimeout(() => card.remove(), 500);
    }, 1400);
  }

  const unsubComplete = ctx.events.on("behavior:complete", ({ spotId, behaviorId }) => {
    recordFound(session, spotId);
    recordBehavior(ctx.album, behaviorId);
    dots.setFound(session.found.length);
    popCard(behaviorId);
  });
  // elephant:arrived契約(docs/INTERFACES.md)の橋渡し: 採食行動が始まる時点で「到着」とみなす。
  const unsubArrived = ctx.events.on("behavior:start", ({ spotId }) => {
    ctx.events.emit("elephant:arrived", { spotId });
  });

  void ctx.cameraRig.goTo("overview");

  let cancelled = false;
  async function run(): Promise<void> {
    let next = nextSeekTarget(activeSession);
    while (next && !cancelled) {
      await ctx.world.elephantSeek(next.spotId, next.food);
      if (cancelled) return;
      next = nextSeekTarget(activeSession);
    }
    if (cancelled) return;
    ctx.events.emit("seek:complete", { behaviors: activeSession.found.map((id) => getSpot(id).elephantBehavior) });
    setTimeout(() => {
      if (!cancelled) ctx.transition("album");
    }, 900);
  }
  void run();

  return () => {
    cancelled = true;
    unsubComplete();
    unsubArrived();
    dots.dispose();
    root.remove();
  };
}
