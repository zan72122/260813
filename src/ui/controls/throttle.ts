/**
 * Big up/down throttle lever button (PRODUCT_SPEC verb 2). One instance per
 * direction; `EiffelUiLayer` shows/hides each per `controlsForState`.
 */

import { DATA_TESTID } from '../../contracts/testing.ts';
import { directionGlyph } from '../icons.ts';

export interface ThrottleHandle {
  readonly root: HTMLElement;
  setPressed(pressed: boolean): void;
}

export function createThrottle(direction: 1 | -1): ThrottleHandle {
  const root = document.createElement('button');
  root.type = 'button';
  root.className = `eiffel-control eiffel-throttle eiffel-throttle-${direction === 1 ? 'up' : 'down'}`;
  root.dataset.testid = direction === 1 ? DATA_TESTID.throttleUp : DATA_TESTID.throttleDown;
  root.appendChild(directionGlyph(direction));

  function setPressed(pressed: boolean): void {
    root.classList.toggle('eiffel-pressed', pressed);
  }

  return { root, setPressed };
}
