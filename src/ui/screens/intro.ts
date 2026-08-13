// intro画面: 飼育員がカートを押して入場する演出。文章説明なし、画面タップでスキップ可。
import type { AppContext } from "../context";
import { el } from "../dom";

export function mountIntroScreen(ctx: AppContext): () => void {
  const root = el("div", { className: "screen screen--intro" });
  ctx.uiRoot.appendChild(root);
  root.appendChild(el("p", { className: "intro-skip-hint", text: "タップで すすむ" }));
  root.style.touchAction = "none";

  let finished = false;
  function finish(): void {
    if (finished) return;
    finished = true;
    ctx.transition("hide");
  }

  void ctx.cameraRig.goTo("keeper");
  ctx.world.keeperPointAt(null);
  ctx.world.playIntro().then(finish, finish);

  root.addEventListener("pointerdown", () => {
    void ctx.world.playIntro({ instant: true });
    finish();
  });

  return () => {
    root.remove();
  };
}
