// album画面: 点数なし。その回に見た行動を絵カードで1枚ずつ「ぽん」と並べる。
// 「もういちど」「ばしょをかえる」「じゆうにあそぶ」(初回クリア後解放)。2タップ以内で次プレイ開始。
import type { BehaviorId, SpotKind } from "../../core/types";
import type { AppContext } from "../context";
import { createBigButton } from "../components/bigButton";
import { commitAlbumToSave } from "../../game/album";
import { el } from "../dom";
import { drawAgainGlyph, drawBehaviorIcon, drawCompassGlyph, drawHomeGlyph, drawShuffleGlyph, makeIconCanvas } from "../icons";

function sameSpotSet(a: readonly SpotKind[], b: readonly SpotKind[]): boolean {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((id) => setB.has(id));
}

export function mountAlbumScreen(ctx: AppContext): () => void {
  const session = ctx.getSession();
  if (!session) {
    console.warn("[album] mounted without an active session, forcing title");
    ctx.transition("title");
    return () => {};
  }

  const updatedSave = commitAlbumToSave(ctx.album);
  Object.assign(ctx.save, updatedSave);

  const root = el("div", { className: "screen screen--album" });
  ctx.uiRoot.appendChild(root);

  const homeBtn = el("button", { className: "album-home-btn", attrs: { "aria-label": "たいとるへ" } });
  homeBtn.type = "button";
  const homeCanvas = document.createElement("canvas");
  homeCanvas.width = 24;
  homeCanvas.height = 24;
  homeCanvas.style.width = "24px";
  homeCanvas.style.height = "24px";
  drawHomeGlyph(homeCanvas, 24);
  homeBtn.appendChild(homeCanvas);
  homeBtn.addEventListener("click", () => ctx.transition("title"));
  root.appendChild(homeBtn);

  root.appendChild(el("p", { className: "album-title", text: "きょうの ぞうさん" }));

  const cardRow = el("div", { className: "album-card-row" });
  root.appendChild(cardRow);

  const behaviors: BehaviorId[] = ctx.album.sessionBehaviors;

  behaviors.forEach((id, i) => {
    const card = el("div", { className: "album-card" });
    const canvas = makeIconCanvas(78);
    drawBehaviorIcon(canvas, id, 78);
    card.appendChild(canvas);
    cardRow.appendChild(card);
    setTimeout(
      () => {
        card.classList.add("album-card--pop");
      },
      220 + i * 260
    );
  });

  const buttonRow = el("div", { className: "album-buttons" });
  root.appendChild(buttonRow);

  const againBtn = createBigButton({
    label: "もういちど",
    icon: drawAgainGlyph,
    iconSize: 30,
    size: "large",
    variant: "primary",
    onTap: () => {
      ctx.fsm.setFreePlay(false);
      ctx.regenerateSession({ guided: false, freePlay: session.config.freePlay });
      ctx.transition("hide");
    }
  });
  buttonRow.appendChild(againBtn);

  const changeBtn = createBigButton({
    label: "ばしょをかえる",
    icon: drawShuffleGlyph,
    iconSize: 28,
    size: "large",
    variant: "secondary",
    onTap: () => {
      ctx.fsm.setFreePlay(false);
      let next = ctx.regenerateSession({ guided: false, freePlay: false });
      let tries = 0;
      while (tries < 6 && sameSpotSet(next.config.spots, session.config.spots)) {
        next = ctx.regenerateSession({ guided: false, freePlay: false });
        tries += 1;
      }
      ctx.transition("hide");
    }
  });
  buttonRow.appendChild(changeBtn);

  if (updatedSave.freePlayUnlocked) {
    const freeBtn = createBigButton({
      label: "じゆうにあそぶ",
      icon: drawCompassGlyph,
      iconSize: 28,
      size: "large",
      variant: "secondary",
      onTap: () => {
        ctx.fsm.setFreePlay(true);
        ctx.regenerateSession({ guided: false, freePlay: true });
        ctx.transition("hide");
      }
    });
    buttonRow.appendChild(freeBtn);
  }

  void ctx.cameraRig.goTo("album");
  ctx.world.highlightSpot(null);
  ctx.world.keeperPointAt(null);

  return () => {
    root.remove();
  };
}
