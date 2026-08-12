/**
 * DOM wrapper around the pure `HintScheduler`: renders a pulse ring at the
 * active handle's screen position at 3s idle, and a ghost-hand
 * demonstration at 5s. Any pointerdown anywhere (listened on `window`, so
 * it catches taps on the 3D canvas too, not just DOM overlay elements)
 * clears the hint instantly and resets the idle clock.
 */
import type { EventBus } from '../contracts/events';
import type { HandleId, HandleInfo, HandleRegistry } from '../contracts/handles';
import { el, setSvg } from './domUtil';
import { ghostHand } from './svg';
import type { HintDemoKind } from './svg';
import { HintScheduler } from './hintScheduler';

const DEMO_KIND_BY_HANDLE: Record<HandleId, HintDemoKind> = {
  sandGate: 'gateDrag',
  pumpHandle: 'pumpStrokes',
  wedge: 'wedgeSlide',
  hammer: 'hammerTap',
  replayButton: 'hammerTap',
};

export interface HintOverlayHandle {
  pause(): void;
  resume(): void;
  dispose(): void;
}

export function createHintOverlay(
  root: HTMLElement,
  handles: HandleRegistry,
  bus: EventBus,
  reducedMotion: boolean,
): HintOverlayHandle {
  const ring = el('div', 'eiffel-hint-pulse-ring eiffel-layer');
  ring.style.display = 'none';
  const hand = el('div', 'eiffel-ghost-hand eiffel-layer');
  hand.style.display = 'none';
  root.appendChild(ring);
  root.appendChild(hand);

  function position(node: HTMLElement, h: HandleInfo): void {
    node.style.left = `${h.x}px`;
    node.style.top = `${h.y}px`;
  }

  function clearVisuals(): void {
    ring.style.display = 'none';
    hand.style.display = 'none';
  }

  const scheduler = new HintScheduler({
    getActiveHandle: () => handles.all().find((h) => h.active),
    demoKindForHandle: (h) => DEMO_KIND_BY_HANDLE[h.id],
    onPulseStart: (h) => {
      position(ring, h);
      ring.classList.toggle('eiffel-animated', !reducedMotion);
      ring.style.display = 'block';
    },
    onDemoStart: (h, kind) => {
      position(hand, h);
      setSvg(hand, ghostHand(kind, reducedMotion));
      hand.style.display = 'block';
      ring.style.display = 'none';
    },
    onClear: clearVisuals,
  });

  const onPointer = (): void => {
    scheduler.registerInput();
  };
  window.addEventListener('pointerdown', onPointer);

  const offLegPhase = bus.on('legPhaseChanged', () => {
    scheduler.resetForPhase();
    clearVisuals();
  });
  const offPhase = bus.on('phaseChanged', () => {
    scheduler.resetForPhase();
    clearVisuals();
  });

  return {
    pause: () => {
      scheduler.pause();
    },
    resume: () => {
      scheduler.resume();
    },
    dispose() {
      scheduler.dispose();
      window.removeEventListener('pointerdown', onPointer);
      offLegPhase();
      offPhase();
      ring.remove();
      hand.remove();
    },
  };
}
