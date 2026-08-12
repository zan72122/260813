/* TEMPORARY Wave2 entry — replaced by Integrator in Wave 4 */
import type { TestApi } from './contracts/testing';
import { createGameState } from './contracts/stateMachine';

const app = document.getElementById('app');
if (!app) throw new Error('missing #app root');

const loading = document.createElement('div');
loading.setAttribute('aria-label', 'loading');
loading.style.cssText =
  'position:fixed;inset:0;background:#1a1410;display:flex;align-items:center;justify-content:center;';
app.appendChild(loading);

const canvas = document.createElement('canvas');
canvas.setAttribute('aria-label', 'scene');
app.appendChild(canvas);

const state = createGameState(1);
const api: TestApi = {
  ready: false,
  settled: () => true,
  state: () => structuredClone(state),
  alignmentError: (leg) => state.legs[leg].alignmentError,
  locked: (leg) => state.legs[leg].locked,
  step: () => undefined,
  drive: {
    setGate: () => undefined,
    pump: () => undefined,
    dragWedge: () => undefined,
    releaseWedge: () => undefined,
    hammer: () => undefined,
    advance: () => undefined,
    replay: () => undefined,
  },
  renderInfo: () => ({ geometries: 0, textures: 0, drawCalls: 0 }),
};

document.addEventListener('DOMContentLoaded', () => {
  api.ready = true;
  loading.remove();
  window.__eiffel = api;
});
