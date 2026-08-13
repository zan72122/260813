// 小さなDOMヘルパー(素のDOM+TS、UIフレームワーク不使用)。
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  opts?: { className?: string; text?: string; attrs?: Record<string, string> }
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (opts?.className) node.className = opts.className;
  if (opts?.text !== undefined) node.textContent = opts.text;
  if (opts?.attrs) {
    for (const [k, v] of Object.entries(opts.attrs)) node.setAttribute(k, v);
  }
  return node;
}

export function clear(node: HTMLElement): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export type Orientation = "portrait" | "landscape";

export function getOrientation(): Orientation {
  return window.innerWidth >= window.innerHeight ? "landscape" : "portrait";
}

/** resize/orientationchangeを購読し、向きが実際に変わった時だけcbを呼ぶ。戻り値で解除。 */
export function onOrientationChange(cb: (o: Orientation) => void): () => void {
  let last = getOrientation();
  const handler = (): void => {
    const next = getOrientation();
    if (next !== last) {
      last = next;
      cb(next);
    }
  };
  window.addEventListener("resize", handler);
  window.addEventListener("orientationchange", handler);
  return () => {
    window.removeEventListener("resize", handler);
    window.removeEventListener("orientationchange", handler);
  };
}
