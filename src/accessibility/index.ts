// src/accessibility/index.ts
// prefers-reduced-motion detection + manual override, and dim-light mode
// state. Publishes a signal other layers can read, mirroring the ctx/bus
// subscribe pattern used by src/contracts/bus.ts (get/subscribe), since
// GameEvent itself has no accessibility variant yet — see handoff "Open
// issues" for a request to add one to src/contracts.
//
// Cross-worker consumers that cannot import this module directly can read
// the effective state from `document.documentElement.dataset` (
// `reducedMotion`, `dimLight`) or from `window.__accessibility`, both kept
// in sync with every state change.

import type { SceneContext } from '../contracts';

export interface AccessibilityState {
  /** Effective reduced-motion flag: manual override if set, else system preference. */
  reducedMotion: boolean;
  reducedMotionSystemPreference: boolean;
  reducedMotionOverride: boolean | null;
  dimLight: boolean;
}

export type AccessibilityListener = (state: AccessibilityState) => void;

let state: AccessibilityState = {
  reducedMotion: false,
  reducedMotionSystemPreference: false,
  reducedMotionOverride: null,
  dimLight: false,
};

const listeners = new Set<AccessibilityListener>();
let dimmedCanvas: HTMLCanvasElement | null = null;

const DIM_FILTER = 'brightness(0.55) saturate(0.85)';

function applyDomEffects(): void {
  const root = document.documentElement;
  root.dataset.reducedMotion = String(state.reducedMotion);
  root.dataset.dimLight = String(state.dimLight);
  root.classList.toggle('versailles-reduce-motion', state.reducedMotion);
  root.classList.toggle('versailles-dim-light', state.dimLight);
  if (dimmedCanvas) {
    dimmedCanvas.style.filter = state.dimLight ? DIM_FILTER : '';
  }
}

function publish(): void {
  applyDomEffects();
  for (const fn of Array.from(listeners)) fn(state);
}

export function getAccessibilityState(): AccessibilityState {
  return state;
}

export function subscribeAccessibility(fn: AccessibilityListener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function setDimLight(value: boolean): void {
  if (state.dimLight === value) return;
  state = { ...state, dimLight: value };
  publish();
}

export function toggleDimLight(): void {
  setDimLight(!state.dimLight);
}

/** Pass null to clear the override and fall back to the system preference. */
export function setReducedMotionOverride(value: boolean | null): void {
  const effective = value ?? state.reducedMotionSystemPreference;
  if (state.reducedMotionOverride === value && state.reducedMotion === effective) return;
  state = { ...state, reducedMotionOverride: value, reducedMotion: effective };
  publish();
}

/**
 * Wires prefers-reduced-motion detection and applies dim-light as a cheap CSS
 * filter on the canvas so the setting is perceptible even before Wave 3
 * integration touches the 3D scene's own lighting. Safe to call repeatedly
 * (re-init tears down the previous media-query listener first).
 */
let activeMediaQueryCleanup: (() => void) | null = null;

export function registerAccessibility(ctx: SceneContext): () => void {
  activeMediaQueryCleanup?.();

  dimmedCanvas = ctx.renderer.domElement;

  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  state = {
    ...state,
    reducedMotionSystemPreference: mq.matches,
    reducedMotion: state.reducedMotionOverride ?? mq.matches,
  };
  publish();

  const handleChange = (e: MediaQueryListEvent): void => {
    state = {
      ...state,
      reducedMotionSystemPreference: e.matches,
      reducedMotion: state.reducedMotionOverride ?? e.matches,
    };
    publish();
  };
  mq.addEventListener?.('change', handleChange);

  (window as unknown as { __accessibility?: unknown }).__accessibility = {
    getState: getAccessibilityState,
    subscribe: subscribeAccessibility,
    setDimLight,
    toggleDimLight,
    setReducedMotionOverride,
  };

  function cleanup(): void {
    mq.removeEventListener?.('change', handleChange);
    if (dimmedCanvas === ctx.renderer.domElement) dimmedCanvas = null;
    activeMediaQueryCleanup = null;
  }

  activeMediaQueryCleanup = cleanup;
  return cleanup;
}
