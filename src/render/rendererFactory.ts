/**
 * WebGL2 renderer factory. Owns renderer construction/tone-mapping/DPR only
 * — `setAnimationLoop`/RAF driving belongs to the integrator (`src/app`);
 * this module exposes a plain `render(scene, camera)` call the scene owner
 * invokes from `updateFromSnapshot`, per ARCHITECTURE_CONTRACT "Rendering
 * contracts".
 */

import * as THREE from 'three';

import { DPR_CAP_HIGH, PALETTE } from '../contracts/constants.ts';
import { clampDpr } from '../core/resize.ts';

export interface RendererHandle {
  readonly renderer: THREE.WebGLRenderer;
  /** Render one frame. */
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  /** Resize the drawing buffer (CSS size is left to the canvas's own styling). */
  setSize(width: number, height: number): void;
  /** Apply a new device-pixel-ratio cap (quality-tier driven). */
  setDpr(dpr: number): void;
  /** Enable/disable the shadow map wholesale (low tier: off). */
  setShadowsEnabled(enabled: boolean): void;
  /** Draw calls from the most recently rendered frame. */
  getDrawCalls(): number;
  /** Triangles rendered in the most recent frame. */
  getTriangles(): number;
  dispose(): void;
}

export interface CreateRendererOptions {
  readonly canvas: HTMLCanvasElement;
  readonly initialDpr?: number;
}

export function createRenderer(options: CreateRendererOptions): RendererHandle {
  const renderer = new THREE.WebGLRenderer({
    canvas: options.canvas,
    antialias: true,
    alpha: false,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: false,
  });

  renderer.setPixelRatio(clampDpr(options.initialDpr ?? (window.devicePixelRatio || 1), DPR_CAP_HIGH));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = true;
  renderer.info.autoReset = true;
  // Safety net so any uncovered gap (e.g. a camera angle beyond the sky
  // dome/ground extents) reads as pale sky rather than a jarring black hole.
  renderer.setClearColor(new THREE.Color(PALETTE.skyZenith), 1);

  return {
    renderer,
    render(scene: THREE.Scene, camera: THREE.Camera): void {
      renderer.render(scene, camera);
    },
    setSize(width: number, height: number): void {
      renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    },
    setDpr(dpr: number): void {
      renderer.setPixelRatio(dpr);
    },
    setShadowsEnabled(enabled: boolean): void {
      renderer.shadowMap.enabled = enabled;
    },
    getDrawCalls(): number {
      return renderer.info.render.calls;
    },
    getTriangles(): number {
      return renderer.info.render.triangles;
    },
    dispose(): void {
      renderer.dispose();
    },
  };
}
