// タイトル画面: ひらがなロゴ、大きな「あそぶ」ボタン(96px+)、解放後「じゆうにあそぶ」、じょうほう(i)。
import type { AppContext } from "../context";
import { createBigButton } from "../components/bigButton";
import { createInfoPanel } from "../components/infoPanel";
import { createSettingsPanel } from "../settings";
import { el } from "../dom";
import { drawCompassGlyph, drawInfoGlyph, drawPlayGlyph } from "../icons";

export function mountTitleScreen(ctx: AppContext): () => void {
  const root = el("div", { className: "screen screen--title" });
  ctx.uiRoot.appendChild(root);

  const logo = el("h1", { className: "title-logo" });
  logo.innerHTML = "ぞうの<br />かくれごはん";
  root.appendChild(logo);

  const sub = el("p", { className: "title-sub", text: "ごはんをかくして、ぞうさんをよぼう" });
  root.appendChild(sub);

  const buttonStack = el("div", { className: "title-buttons" });
  root.appendChild(buttonStack);

  let introSeenThisSession = ctx.save.firstPlayDone;

  const playBtn = createBigButton({
    label: "あそぶ",
    icon: drawPlayGlyph,
    iconSize: 44,
    size: "hero",
    variant: "primary",
    onTap: () => {
      const guided = !ctx.save.firstPlayDone;
      ctx.fsm.setFreePlay(false);
      ctx.regenerateSession({ guided, freePlay: false });
      const skipIntro = introSeenThisSession;
      introSeenThisSession = true;
      ctx.transition(skipIntro ? "hide" : "intro");
    }
  });
  buttonStack.appendChild(playBtn);

  if (ctx.save.freePlayUnlocked) {
    const freeBtn = createBigButton({
      label: "じゆうにあそぶ",
      icon: drawCompassGlyph,
      iconSize: 30,
      size: "large",
      variant: "secondary",
      onTap: () => {
        ctx.fsm.setFreePlay(true);
        ctx.regenerateSession({ guided: false, freePlay: true });
        ctx.transition("hide");
      }
    });
    buttonStack.appendChild(freeBtn);
  }

  const infoBtn = el("button", { className: "info-fab", attrs: { "aria-label": "じょうほう" } });
  infoBtn.type = "button";
  const infoCanvas = document.createElement("canvas");
  infoCanvas.width = 28;
  infoCanvas.height = 28;
  infoCanvas.style.width = "28px";
  infoCanvas.style.height = "28px";
  drawInfoGlyph(infoCanvas, 28);
  infoBtn.appendChild(infoCanvas);
  root.appendChild(infoBtn);

  const settingsPanel = createSettingsPanel(ctx);
  root.appendChild(settingsPanel.node);

  const infoPanel = createInfoPanel({
    onOpenSettings: () => settingsPanel.open()
  });
  root.appendChild(infoPanel.node);
  infoBtn.addEventListener("click", () => infoPanel.open());

  void ctx.cameraRig.goTo("overview");
  ctx.world.clearFoods();

  return () => {
    settingsPanel.dispose();
    infoPanel.dispose();
    root.remove();
  };
}
