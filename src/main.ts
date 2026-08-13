import * as THREE from "three";
import { createClock } from "./core/clock";
import { createRenderer } from "./scene/renderer";
import { installDebugApi } from "./debug/qa";
import type { GamePhase, Quality } from "./core/types";

const QUALITY_VALUES: readonly Quality[] = ["low", "medium", "high"];
const GAME_PHASE_VALUES: readonly GamePhase[] = ["boot", "title", "intro", "hide", "gate", "seek", "album"];

function parseQuality(v: string | null): Quality | null {
  if (v && (QUALITY_VALUES as readonly string[]).includes(v)) return v as Quality;
  return null;
}

function parsePhase(v: string | null): GamePhase | null {
  if (v && (GAME_PHASE_VALUES as readonly string[]).includes(v)) return v as GamePhase;
  return null;
}

interface LaunchConfig {
  qa: boolean;
  quality: Quality | null;
  timeScale: number | null;
  seed: number;
  act: GamePhase | null;
  nosw: boolean;
}

function parseLaunchConfig(search: string): LaunchConfig {
  const params = new URLSearchParams(search);
  const qa = params.get("qa") === "1";
  const quality = parseQuality(params.get("quality"));
  const rawTimeScale = params.get("timeScale");
  const parsedTimeScale = rawTimeScale ? Number.parseFloat(rawTimeScale) : NaN;
  const timeScale = Number.isFinite(parsedTimeScale) ? Math.min(16, Math.max(0.01, parsedTimeScale)) : null;
  const rawSeed = params.get("seed");
  const parsedSeed = rawSeed ? Number.parseInt(rawSeed, 10) : NaN;
  const seed = Number.isFinite(parsedSeed) ? parsedSeed : 1;
  const act = parsePhase(params.get("act"));
  const nosw = params.get("nosw") === "1";
  return { qa, quality, timeScale, seed, act, nosw };
}

function buildPlaceholderScene(): { scene: THREE.Scene; camera: THREE.PerspectiveCamera } {
  const scene = new THREE.Scene();
  // ART_DIRECTION.md: 朝の空 #aee3f5 を仮背景に使う（本格的な環境はS2で構築）。
  scene.background = new THREE.Color("#aee3f5");
  scene.fog = new THREE.Fog(0xaee3f5, 30, 70);

  const hemi = new THREE.HemisphereLight(0xfff3e0, 0xe8d5a8, 1.0);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff3e0, 1.2);
  sun.position.set(10, 16, 8);
  scene.add(sun);

  // 仮の地面円盤（放飼場、半径~14）
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(14, 48),
    new THREE.MeshStandardMaterial({ color: 0xe8d5a8, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 12, 20);
  camera.lookAt(0, 0, 0);

  return { scene, camera };
}

function main(): void {
  const config = parseLaunchConfig(window.location.search);

  const sceneRoot = document.getElementById("scene-root");
  if (!sceneRoot) {
    throw new Error("[main] #scene-root not found");
  }

  const clock = createClock();
  if (config.timeScale !== null) clock.timeScale = config.timeScale;

  const initialQuality: Quality = config.quality ?? "medium";
  const renderer = createRenderer(sceneRoot, initialQuality);

  const { scene, camera } = buildPlaceholderScene();

  function onResize(): void {
    renderer.resize();
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);
  onResize();

  const debugApi = installDebugApi(config.qa);
  debugApi.registerHandlers({
    getState: () => ({
      qa: config.qa,
      quality: renderer.quality,
      timeScale: clock.timeScale,
      elapsed: clock.elapsed,
      seed: config.seed
    }),
    setTimeScale: (v: number) => {
      clock.timeScale = v;
    },
    setQuality: (v: Quality) => {
      renderer.setQuality(v);
    },
    reset: (seed?: number) => {
      const url = new URL(window.location.href);
      if (seed !== undefined) url.searchParams.set("seed", String(seed));
      window.location.href = url.toString();
    },
    screenshotReady: () => true
  });

  if (config.nosw) {
    // service worker登録はS5で追加する。E2E安定化のため、現時点では未登録なので何もしない。
    console.warn("[main] nosw=1: service worker registration skipped");
  }

  if (config.act) {
    // jumpToはS3b/S4で実装が差し込まれるまでno-op+warnになる（registerHandlers未登録のため）。
    debugApi.jumpTo(config.act);
  }

  let lastTime = performance.now();
  let firstFrameRendered = false;
  function animate(now: number): void {
    const rawDelta = Math.min(0.1, (now - lastTime) / 1000);
    lastTime = now;
    clock.tick(rawDelta);
    renderer.render(scene, camera);
    if (!firstFrameRendered) {
      firstFrameRendered = true;
      debugApi.markReady();
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

main();
