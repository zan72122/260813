// src/core/index.ts — Renderer module (owner: Renderer, src/core/**).
// Wave 2 note: this is a MINIMAL-BUT-FUNCTIONAL skeleton — a real, finished
// sky/ground scene, deliberately simple — so `npm run verify` is green. Wave 3a
// Renderer replaces its internals but MUST keep the exported createRenderer()
// shape frozen by ARCHITECTURE_CONTRACT.md.

import * as THREE from 'three';
import type { AnchorRegistry } from '../contracts/anchors';
import type { EventBus } from '../contracts/bus';
import type { GameStore } from '../contracts/store';
import type { QualityLevel } from '../contracts/types';

export interface RendererStats {
  drawCalls: number;
  triangles: number;
  fps: number;
}

export interface RendererHandle {
  ready: Promise<void>;
  start(): void;
  stop(): void;
  resize(): void;
  setQuality(q: QualityLevel): void;
  isSettled(): boolean;
  getStats(): RendererStats;
  dispose(): void;
}

const DPR_BY_QUALITY: Record<QualityLevel, number> = { low: 1, mid: 1.25, high: 1.75 };

export function createRenderer(o: {
  canvas: HTMLCanvasElement;
  store: GameStore;
  bus: EventBus;
  anchors: AnchorRegistry;
}): RendererHandle {
  const { canvas } = o;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_BY_QUALITY.high));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#8fb6d9');
  scene.fog = new THREE.Fog('#c9d8e6', 40, 220);

  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
  camera.position.set(0, 8, 22);
  camera.lookAt(0, 5, 0);

  const hemi = new THREE.HemisphereLight('#ffffff', '#6b5a4a', 1.0);
  const sun = new THREE.DirectionalLight('#fff2d8', 1.2);
  sun.position.set(10, 20, 10);
  scene.add(hemi, sun);

  const groundGeometry = new THREE.PlaneGeometry(400, 400);
  const groundMaterial = new THREE.MeshStandardMaterial({ color: '#6b5a44', roughness: 1 });
  const ground = new THREE.Mesh(groundGeometry, groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  let settled = false;
  let running = false;
  let contextLost = false;
  let rafId = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsWindowStart = performance.now();

  function resize(): void {
    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;
    renderer.setSize(width, height, false);
    camera.aspect = width / Math.max(height, 1);
    camera.updateProjectionMatrix();
  }

  function onContextLost(event: Event): void {
    event.preventDefault();
    contextLost = true;
    running = false;
    cancelAnimationFrame(rafId);
  }
  function onContextRestored(): void {
    contextLost = false;
    resize();
  }
  canvas.addEventListener('webglcontextlost', onContextLost, false);
  canvas.addEventListener('webglcontextrestored', onContextRestored, false);

  function renderOnce(): void {
    if (contextLost) return;
    renderer.render(scene, camera);
    fpsFrames += 1;
    const now = performance.now();
    const elapsed = now - fpsWindowStart;
    if (elapsed >= 500) {
      fps = (fpsFrames * 1000) / elapsed;
      fpsFrames = 0;
      fpsWindowStart = now;
    }
  }

  function loop(): void {
    if (!running) return;
    renderOnce();
    rafId = requestAnimationFrame(loop);
  }

  function start(): void {
    if (running) return;
    running = true;
    rafId = requestAnimationFrame(loop);
  }

  function stop(): void {
    running = false;
    cancelAnimationFrame(rafId);
  }

  const ready = new Promise<void>((resolve) => {
    resize();
    renderOnce();
    settled = true;
    resolve();
  });

  return {
    ready,
    start,
    stop,
    resize,
    setQuality: (q) => {
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, DPR_BY_QUALITY[q]));
    },
    isSettled: () => settled,
    getStats: () => ({
      drawCalls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      fps: Math.round(fps),
    }),
    dispose: () => {
      stop();
      canvas.removeEventListener('webglcontextlost', onContextLost);
      canvas.removeEventListener('webglcontextrestored', onContextRestored);
      groundGeometry.dispose();
      groundMaterial.dispose();
      renderer.dispose();
    },
  };
}
