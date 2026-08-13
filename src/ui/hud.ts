// seek画面向けの最小HUD: 進行ドット(発見数の可視化)。文字なし、色と形だけで進行を示す。
import { el } from "./dom";

export interface ProgressDots {
  readonly node: HTMLElement;
  setTotal(n: number): void;
  setFound(n: number): void;
  dispose(): void;
}

export function createProgressDots(): ProgressDots {
  const node = el("div", { className: "progress-dots" });
  let dots: HTMLElement[] = [];

  function setTotal(n: number): void {
    node.textContent = "";
    dots = [];
    for (let i = 0; i < n; i++) {
      const dot = el("span", { className: "progress-dots__dot" });
      node.appendChild(dot);
      dots.push(dot);
    }
  }

  function setFound(n: number): void {
    dots.forEach((dot, i) => dot.classList.toggle("progress-dots__dot--found", i < n));
  }

  return {
    node,
    setTotal,
    setFound,
    dispose(): void {
      node.remove();
    }
  };
}
