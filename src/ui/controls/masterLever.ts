/**
 * Master lever DOM: a tall brass/iron slot with a wooden knob, ≥120 CSS px
 * of travel (PRODUCT_SPEC verb 1), ≥72 CSS px knob hit target. Purely a
 * visual/structural builder — drag math and spring-back policy live in
 * `EiffelUiLayer` (via `LeverDragController`), which calls `setKnobValue`.
 */

import { DATA_TESTID } from '../../contracts/testing.ts';

export interface MasterLeverHandle {
  readonly root: HTMLElement;
  readonly knob: HTMLElement;
  /** Position the knob for value `[0,1]` along the track (0 = bottom/shut). */
  setKnobValue(value: number, animated: boolean): void;
}

export function createMasterLever(): MasterLeverHandle {
  const root = document.createElement('div');
  root.className = 'eiffel-control eiffel-lever';
  root.dataset.testid = DATA_TESTID.masterLever;

  const track = document.createElement('div');
  track.className = 'eiffel-lever-track';

  const slot = document.createElement('div');
  slot.className = 'eiffel-lever-slot';
  track.appendChild(slot);

  const knob = document.createElement('div');
  knob.className = 'eiffel-lever-knob';
  const knobGrip = document.createElement('div');
  knobGrip.className = 'eiffel-lever-knob-grip';
  knob.appendChild(knobGrip);
  track.appendChild(knob);

  root.appendChild(track);

  function setKnobValue(value: number, animated: boolean): void {
    knob.classList.toggle('eiffel-animated', animated);
    knob.style.setProperty('--eiffel-lever-value', String(clamp01(value)));
  }

  return { root, knob, setKnobValue };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
