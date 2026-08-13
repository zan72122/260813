import { createClock } from "./core/clock";
import { createRenderer } from "./scene/renderer";
import { installDebugApi } from "./debug/qa";
import { createWorld } from "./scene/world";
import { createCameraRig } from "./scene/cameras";
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

  // S2: 放飼場environment(world)とカメラプリセット(cameras)を構築して配線する。
  // ゾウ本体はS3で world.registerHooks(...) により差し込まれる(未登録の間はフォールバックで動作)。
  const world = createWorld({ quality: initialQuality, timeOfDay: "morning" });
  const cameraRig = createCameraRig({ orientation: window.innerWidth >= window.innerHeight ? "landscape" : "portrait" });

  function onResize(): void {
    renderer.resize();
    const orientation = window.innerWidth >= window.innerHeight ? "landscape" : "portrait";
    cameraRig.setOrientation(orientation);
    cameraRig.camera.aspect = window.innerWidth / window.innerHeight;
    cameraRig.camera.updateProjectionMatrix();
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
      world.setQuality(v);
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
    const dt = clock.tick(rawDelta);
    world.update(dt);
    cameraRig.update(dt);
    renderer.render(world.scene, cameraRig.camera);
    if (!firstFrameRendered) {
      firstFrameRendered = true;
      debugApi.markReady();
    }
    requestAnimationFrame(animate);
  }
  requestAnimationFrame(animate);
}

main();
