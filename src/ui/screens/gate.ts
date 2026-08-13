// gate画面: 大きなレバー(縦=縦スワイプ/横=横スワイプ)。閾値でopenGate()+elephantEnter()→seekへ。
import type { AppContext } from "../context";
import { createHintTimer } from "../../game/hints";
import { el } from "../dom";
import { drawHandSwipeGlyph, makeIconCanvas } from "../icons";

const OPEN_THRESHOLD = 0.8;

export function mountGateScreen(ctx: AppContext): () => void {
  const root = el("div", { className: "screen screen--gate" });
  ctx.uiRoot.appendChild(root);

  root.appendChild(el("p", { className: "gate-label", text: "レバーを ひいてね" }));

  const leverWrap = el("div", { className: "gate-lever-wrap" });
  const track = el("div", { className: "gate-lever-track" });
  const handle = el("div", {
    className: "gate-lever-handle",
    attrs: { role: "button", tabindex: "0", "aria-label": "ゲートを あける" }
  });
  handle.style.touchAction = "none";
  const handleCanvas = makeIconCanvas(52);
  drawHandSwipeGlyph(handleCanvas, 52);
  handle.appendChild(handleCanvas);
  track.appendChild(handle);
  leverWrap.appendChild(track);
  root.appendChild(leverWrap);

  let orientation = ctx.getOrientation();
  function applyOrientationClass(): void {
    leverWrap.classList.toggle("gate-lever-wrap--portrait", orientation === "portrait");
    leverWrap.classList.toggle("gate-lever-wrap--landscape", orientation === "landscape");
  }
  applyOrientationClass();
  const unsubOrientation = ctx.onOrientation((o) => {
    orientation = o;
    applyOrientationClass();
  });

  let progress = 0;
  let dragging = false;
  let startPos = 0;
  let opened = false;
  let returnRaf = 0;

  function setProgress(p: number): void {
    progress = Math.max(0, Math.min(1, p));
    const pct = progress * 100;
    handle.style.transform = orientation === "portrait" ? `translateY(${-pct}%)` : `translateX(${pct}%)`;
    track.style.setProperty("--fill", `${pct}%`);
  }
  setProgress(0);

  handle.addEventListener("pointerdown", (ev) => {
    if (opened) return;
    cancelAnimationFrame(returnRaf);
    dragging = true;
    startPos = orientation === "portrait" ? ev.clientY : ev.clientX;
    handle.setPointerCapture(ev.pointerId);
    hint.reset();
  });
  handle.addEventListener("pointermove", (ev) => {
    if (!dragging || opened) return;
    hint.reset();
    const pos = orientation === "portrait" ? ev.clientY : ev.clientX;
    const delta = orientation === "portrait" ? startPos - pos : pos - startPos;
    const trackLen = orientation === "portrait" ? track.clientHeight : track.clientWidth;
    const span = Math.max(80, trackLen - 72);
    setProgress(delta / span);
  });
  function endDrag(): void {
    if (!dragging) return;
    dragging = false;
    if (progress >= OPEN_THRESHOLD) {
      triggerOpen();
    } else {
      const springBack = (): void => {
        setProgress(progress - 0.09);
        if (progress > 0 && !opened) returnRaf = requestAnimationFrame(springBack);
      };
      returnRaf = requestAnimationFrame(springBack);
    }
  }
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);

  // キーボードQAフォールバック: スワイプできない場合、Enter/Spaceで即座にゲートを開ける。
  handle.addEventListener("keydown", (ev) => {
    if (ev.key !== "Enter" && ev.key !== " " && ev.key !== "Spacebar") return;
    ev.preventDefault();
    triggerOpen();
  });

  const label = root.firstElementChild as HTMLElement;

  function triggerOpen(): void {
    if (opened) return;
    opened = true;
    hint.stop();
    setProgress(1);
    label.textContent = "あいたよ";
    void (async () => {
      await ctx.cameraRig.goTo("gate");
      await ctx.world.openGate();
      ctx.events.emit("gate:opened", {});
      await ctx.cameraRig.goTo("overview");
      await ctx.world.elephantEnter();
      ctx.transition("seek");
    })();
  }

  const hint = createHintTimer({ events: ctx.events, getDelaySeconds: () => 4, getSpotId: () => null });
  const unsubHint = ctx.events.on("hint:show", () => {
    handle.classList.remove("gate-lever-handle--nudge");
    void handle.offsetWidth;
    handle.classList.add("gate-lever-handle--nudge");
  });
  hint.start();

  void ctx.cameraRig.goTo("gate");
  ctx.world.keeperPointAt(null);

  return () => {
    cancelAnimationFrame(returnRaf);
    hint.dispose();
    unsubHint();
    unsubOrientation();
    root.remove();
  };
}
