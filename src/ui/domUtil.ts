/**
 * Tiny DOM helpers shared by the overlay component modules. Not unit
 * tested directly (no DOM in the Vitest `node` environment this project
 * uses) — kept intentionally trivial so the untested surface is as small
 * as possible; all non-trivial logic lives in the pure modules
 * (hintScheduler.ts, legProgress.ts, svg.ts) that ARE tested.
 */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  attrs?: Record<string, string>,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  }
  return node;
}

export function setSvg(node: HTMLElement, markup: string): void {
  node.innerHTML = markup;
}
