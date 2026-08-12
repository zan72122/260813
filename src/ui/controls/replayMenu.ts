/**
 * Four big pictogram replay tiles (PRODUCT_SPEC "replayMenu"). Each tile is
 * ≥72 CSS px (actually sized much larger — full quadrant tiles) and carries
 * its frozen `data-testid`.
 */

import { DATA_TESTID } from '../../contracts/testing.ts';
import type { UiAction } from '../types.ts';
import {
  replayAgainGlyph,
  replayDescendGlyph,
  replayMachineGlyph,
  replayTransitionGlyph,
} from '../icons.ts';

export interface ReplayMenuHandle {
  readonly root: HTMLElement;
  readonly tiles: ReadonlyMap<UiAction, HTMLElement>;
}

const TILE_SPECS: readonly { action: UiAction; testid: string; glyph: () => SVGSVGElement }[] = [
  { action: 'replayAgain', testid: DATA_TESTID.replayAgain, glyph: replayAgainGlyph },
  { action: 'replayDescend', testid: DATA_TESTID.replayDescend, glyph: replayDescendGlyph },
  { action: 'replayMachine', testid: DATA_TESTID.replayMachine, glyph: replayMachineGlyph },
  { action: 'replayTransition', testid: DATA_TESTID.replayTransition, glyph: replayTransitionGlyph },
];

export function createReplayMenu(): ReplayMenuHandle {
  const root = document.createElement('div');
  root.className = 'eiffel-control eiffel-replay-menu';

  const tiles = new Map<UiAction, HTMLElement>();
  for (const spec of TILE_SPECS) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'eiffel-replay-tile';
    tile.dataset.testid = spec.testid;
    tile.appendChild(spec.glyph());
    root.appendChild(tile);
    tiles.set(spec.action, tile);
  }

  return { root, tiles };
}
