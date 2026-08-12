/**
 * Idle ghost-hand demonstration (PRODUCT_SPEC "Feedback rules": ≤5s idle on
 * any verb screen -> short gesture demo). Purely a CSS-driven overlay; the
 * animation choreography (which gesture) is selected via a `data-demo`
 * attribute so `src/styles/base.css` owns the keyframes and the
 * `prefers-reduced-motion` kill-switch lives in one place.
 */

import { handGlyph } from '../icons.ts';

export type GhostHandDemo = 'lever' | 'throttle' | 'wheel';

export interface GhostHandHandle {
  readonly root: HTMLElement;
  show(demo: GhostHandDemo): void;
  hide(): void;
}

export function createGhostHand(): GhostHandHandle {
  const root = document.createElement('div');
  root.className = 'eiffel-ghost-hand';
  root.appendChild(handGlyph());

  function show(demo: GhostHandDemo): void {
    root.dataset.demo = demo;
    root.classList.add('eiffel-visible');
  }

  function hide(): void {
    root.classList.remove('eiffel-visible');
  }

  return { root, show, hide };
}
