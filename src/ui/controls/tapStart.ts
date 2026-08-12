/**
 * Whole-screen "tap anywhere to begin" target for `attract`
 * (PRODUCT_SPEC "attract"). Debounced via `TapGuard` in `EiffelUiLayer`.
 */

export interface TapStartHandle {
  readonly root: HTMLElement;
}

export function createTapStart(): TapStartHandle {
  const root = document.createElement('div');
  root.className = 'eiffel-control eiffel-tap-start';
  root.dataset.testid = 'tap-start';
  return { root };
}
