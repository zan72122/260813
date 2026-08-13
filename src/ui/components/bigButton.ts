// 大きなタッチボタン(最低64px、hit areaはさらに+8px、:active時にスケール0.95+色変化)。
// 絵(canvasアイコン)+ひらがな短文の併記(文字が読めなくても分かるように)。
import { el } from "../dom";

export type IconDrawer = (canvas: HTMLCanvasElement, size: number) => void;

export interface BigButtonOptions {
  label: string;
  icon?: IconDrawer;
  iconSize?: number;
  variant?: "primary" | "secondary" | "ghost";
  size?: "hero" | "large" | "medium";
  /** 省略時はlabel(ひらがな表示文言)をそのままaria-labelに使う。 */
  ariaLabel?: string;
  onTap: () => void;
}

export function createBigButton(opts: BigButtonOptions): HTMLButtonElement {
  const btn = el("button", {
    className: `big-btn big-btn--${opts.variant ?? "primary"} big-btn--${opts.size ?? "medium"}`,
    attrs: { "aria-label": opts.ariaLabel ?? opts.label }
  });
  if (opts.icon) {
    const size = opts.iconSize ?? (opts.size === "hero" ? 48 : 32);
    const iconWrap = el("span", { className: "big-btn__icon" });
    const canvas = document.createElement("canvas");
    iconWrap.appendChild(canvas);
    btn.appendChild(iconWrap);
    // canvasの実描画はmakeIconCanvas相当のDPR対応込みで呼び出し側アイコン関数に任せる形にすると
    // 呼び出しが煩雑になるため、ここではサイズ設定込みで直接描かせる。
    canvas.width = size;
    canvas.height = size;
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;
    opts.icon(canvas, size);
  }
  const labelEl = el("span", { className: "big-btn__label", text: opts.label });
  btn.appendChild(labelEl);
  btn.type = "button";
  btn.addEventListener("click", () => opts.onTap());
  return btn;
}
