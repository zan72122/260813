// src/game/debug.ts
// window.__versailles read-only Debug API, per docs/CONTRACTS.md, for Worker
// C's e2e automation. Hotspots are projected live from the 3D whistle/valve
// anchors (src/scenes/anchors.ts) through the current camera, so they track
// the actual on-screen position through the whole camera storyboard.

import * as THREE from 'three';
import type { FountainId, GamePhase, SceneContext } from '../contracts';
import { getSceneAnchors } from '../scenes/anchors';
import type { GameDirector } from './director';

export interface HotspotRect {
  x: number; // normalized screen coords 0..1
  y: number;
  r: number; // normalized radius (roughly the ~88px min hit target)
}

export interface VersaillesDebug {
  readonly phase: GamePhase;
  readonly fountain: FountainId | null;
  readonly openness: number;
  readonly waterProgress: number;
  readonly flowIntensity: number;
  readonly hotspots: { whistle?: HotspotRect; valve?: HotspotRect };
  readonly rendererInfo: { drawCalls: number; triangles: number };
}

const MIN_HIT_TARGET_PX = 88;

/** Installs window.__versailles. Returns a disposer (removes the global). */
export function installDebugApi(ctx: SceneContext, director: GameDirector): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const anchors = getSceneAnchors();
  const scratch = new THREE.Vector3();

  function projectToScreen(position: THREE.Vector3): HotspotRect {
    scratch.copy(position).project(ctx.camera);
    const x = (scratch.x + 1) / 2;
    const y = (1 - scratch.y) / 2;
    const width = ctx.viewport.width || 1;
    const r = MIN_HIT_TARGET_PX / Math.max(1, width);
    return { x, y, r };
  }

  const api: VersaillesDebug = {
    get phase() {
      return director.getState().phase;
    },
    get fountain() {
      return director.getState().fountain;
    },
    get openness() {
      return director.getState().openness;
    },
    get waterProgress() {
      return director.getState().waterProgress;
    },
    get flowIntensity() {
      return director.getState().flowIntensity;
    },
    get hotspots() {
      return {
        whistle: projectToScreen(anchors.whistlePosition),
        valve: projectToScreen(anchors.valve.position),
      };
    },
    get rendererInfo() {
      const info = ctx.renderer.info;
      return { drawCalls: info.render.calls, triangles: info.render.triangles };
    },
  };

  (window as unknown as { __versailles?: VersaillesDebug }).__versailles = api;

  return () => {
    delete (window as unknown as { __versailles?: VersaillesDebug }).__versailles;
  };
}
