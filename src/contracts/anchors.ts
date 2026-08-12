// src/contracts/anchors.ts
// Screen-space anchor registry: the boundary between Renderer (publishes
// where things are on screen) and Input/UI (hit-tests without 3D knowledge).

import type { Anchor, AnchorId } from './types';

export interface AnchorRegistry {
  set(anchor: Anchor): void;
  get(id: AnchorId): Anchor | undefined;
  all(): Anchor[];
  clear(): void;
  /** Topmost (most-recently-registered) active anchor containing (x,y), or undefined. */
  hitTest(x: number, y: number, padding?: number): Anchor | undefined;
}

export function createAnchorRegistry(): AnchorRegistry {
  const anchors = new Map<AnchorId, Anchor>();

  function set(anchor: Anchor): void {
    anchors.set(anchor.id, anchor);
  }

  function get(id: AnchorId): Anchor | undefined {
    return anchors.get(id);
  }

  function all(): Anchor[] {
    return Array.from(anchors.values());
  }

  function clear(): void {
    anchors.clear();
  }

  function hitTest(x: number, y: number, padding = 0): Anchor | undefined {
    const list = Array.from(anchors.values());
    // Iterate newest-registered-first so the most recently added anchor
    // (i.e. topmost by registration order) wins on overlap.
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const anchor = list[i];
      if (!anchor || !anchor.active) continue;
      const radius = anchor.r + padding;
      const dx = x - anchor.x;
      const dy = y - anchor.y;
      if (dx * dx + dy * dy <= radius * radius) return anchor;
    }
    return undefined;
  }

  return { set, get, all, clear, hitTest };
}
