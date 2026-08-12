/**
 * `dev/ui.html` harness: mounts `EiffelUiLayer` over a placeholder gradient
 * and drives it with a fake snapshot ticker so the UX owner can screenshot
 * and eyeball every state's layout without the real renderer/game logic.
 * Never imported by the production app (`src/app/**` never touches this
 * file) — dev-only, per FILE_OWNERSHIP "dev/ui.html (dev-only preview
 * harness; never built)".
 */

import { TypedEventBus } from '../contracts/events.ts';
import type { GameStateId } from '../contracts/states.ts';
import { GAME_STATE_IDS } from '../contracts/states.ts';
import type { GameSnapshot } from '../contracts/store.ts';
import type { InputIntent } from '../contracts/subsystems.ts';

import { EiffelUiLayer } from './EiffelUiLayer.ts';
import type { UiAction } from './types.ts';

function readState(): GameStateId {
  const raw = new URLSearchParams(window.location.search).get('state');
  return (GAME_STATE_IDS as readonly string[]).includes(raw ?? '')
    ? (raw as GameStateId)
    : 'attract';
}

function baseSnapshot(state: GameStateId): GameSnapshot {
  return {
    valveOpen: 0,
    direction: 0,
    pistonDisplacement: 0,
    cableTravel: 0,
    arcLength: 0,
    t: 0,
    thetaDeg: 54,
    carrierAngleDeg: 0,
    cabinTiltErrorDeg: 0,
    cabinWorldTiltDeg: 0,
    speed: 0,
    state,
    seed: 1,
    quality: 'high',
    soundOn: true,
    reducedMotion: false,
    paused: false,
  };
}

function buildDebugPanel(): { root: HTMLElement; log: (line: string) => void } {
  const root = document.createElement('pre');
  root.style.cssText =
    'position:fixed;top:0;left:0;max-width:60vw;max-height:40vh;overflow:auto;' +
    'margin:0;padding:6px 8px;font:11px monospace;color:#fff;background:rgba(0,0,0,0.45);' +
    'pointer-events:none;z-index:999;white-space:pre-wrap;';
  const lines: string[] = [];
  function log(line: string): void {
    lines.push(line);
    if (lines.length > 12) lines.shift();
    root.textContent = lines.join('\n');
  }
  return { root, log };
}

export function startDevPreview(stage: HTMLElement): void {
  const gradient = document.createElement('div');
  gradient.style.cssText =
    'position:absolute;inset:0;' +
    'background:linear-gradient(180deg,#cfd8e3 0%,#f2e8d8 55%,#2b2b30 55%,#1b1b1e 100%);';
  stage.appendChild(gradient);

  const debug = buildDebugPanel();
  stage.appendChild(debug.root);

  const bus = new TypedEventBus();
  bus.on('sound:cue', ({ cue }) => debug.log(`sound:cue ${cue}`));

  let snapshot = baseSnapshot(readState());

  const layer = new EiffelUiLayer({
    bus,
    onIntent: (intent: InputIntent) => {
      if (intent.kind === 'lever') snapshot = { ...snapshot, valveOpen: intent.value };
      if (intent.kind === 'throttle') snapshot = { ...snapshot, direction: intent.value };
      debug.log(`intent ${JSON.stringify(intent)}`);
    },
    onAction: (action: UiAction) => {
      debug.log(`action ${action}`);
      if (action === 'toggleSound') snapshot = { ...snapshot, soundOn: !snapshot.soundOn };
      if (action === 'pause') snapshot = { ...snapshot, state: 'pause', paused: true };
      if (action === 'resume') snapshot = { ...snapshot, state: readState(), paused: false };
    },
  });
  layer.mount(stage);
  layer.updateFromSnapshot(snapshot);

  let t = 0;
  function tick(): void {
    t += 1 / 60;
    if (snapshot.state === 'machineRoom' && snapshot.valveOpen > 0) {
      const eased = Math.max(0, snapshot.valveOpen - (1 / 60) * 0.15);
      snapshot = { ...snapshot, valveOpen: eased };
    }
    if (snapshot.state === 'transition') {
      snapshot = { ...snapshot, cabinWorldTiltDeg: 6 * Math.sin(t * 0.6) };
    }
    layer.updateFromSnapshot(snapshot);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
