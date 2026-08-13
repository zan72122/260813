// hint:show受信時に短く表示する、絵だけの吹き出し(矢印過多禁止、文字最小限)。
import { el } from "../dom";
import { drawPointingHandGlyph } from "../icons";

export interface HintBubble {
  readonly node: HTMLElement;
  /** 中央上寄りに一瞬ふわっと出して自動的に消える。 */
  pulse(): void;
  dispose(): void;
}

export function createHintBubble(): HintBubble {
  const node = el("div", { className: "hint-bubble" });
  const canvas = document.createElement("canvas");
  const SIZE = 56;
  canvas.width = SIZE;
  canvas.height = SIZE;
  canvas.style.width = `${SIZE}px`;
  canvas.style.height = `${SIZE}px`;
  drawPointingHandGlyph(canvas, SIZE);
  node.appendChild(canvas);

  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  function pulse(): void {
    node.classList.remove("hint-bubble--show");
    // reflow強制でアニメーションを再トリガーできるようにする
    void node.offsetWidth;
    node.classList.add("hint-bubble--show");
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      node.classList.remove("hint-bubble--show");
    }, 1600);
  }

  return {
    node,
    pulse,
    dispose(): void {
      if (hideTimer) clearTimeout(hideTimer);
    }
  };
}
