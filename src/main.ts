import { registerSW } from "virtual:pwa-register";
import { createClock } from "./core/clock";
import { createFsm } from "./core/fsm";
import { createRenderer } from "./scene/renderer";
import { installDebugApi } from "./debug/qa";
import { createWorld } from "./scene/world";
import { createCameraRig } from "./scene/cameras";
import { createGameApp } from "./ui/app";
import { createAudioSystem, bindUiTapSounds } from "./audio";
import { loadSave } from "./save/save";
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
  const uiRoot = document.getElementById("ui-root");
  if (!sceneRoot || !uiRoot) {
    throw new Error("[main] #scene-root/#ui-root not found");
  }

  const clock = createClock();
  if (config.timeScale !== null) clock.timeScale = config.timeScale;

  const save = loadSave();
  const initialQuality: Quality = config.quality ?? (save.settings.quality !== "auto" ? save.settings.quality : "medium");
  const renderer = createRenderer(sceneRoot, initialQuality);

  const world = createWorld({ quality: initialQuality, timeOfDay: "morning", seed: config.seed, reducedMotion: save.settings.reducedMotion });
  const cameraRig = createCameraRig({ orientation: window.innerWidth >= window.innerHeight ? "landscape" : "portrait" });
  // S3bの既知の制限: world.tsのresolveCamera()はsetCameraRig()未接続の間?qa=1のwindowブリッジ頼みになる。
  // 本番(qa未指定)でも5固有行動のカメラカットが効くよう、ここで正式に接続する。
  world.setCameraRig(cameraRig);

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

  // 音声(src/audio/): WebAudio合成のみ、外部音源ファイル無し。unlock()は初回pointerdown/touchstartで
  // 呼ぶ(Safari対応)。ゲームイベント→SfxIdの配線はbindEvents()がworld.eventsを購読して行う。
  const audioSystem = createAudioSystem();
  audioSystem.api.setMuted(save.settings.muted);
  audioSystem.api.setAmbienceVolume(save.settings.ambienceVolume);
  const unbindAudioEvents = audioSystem.bindEvents(world.events);
  const unbindUiTap = bindUiTapSounds(audioSystem.api);

  let audioUnlocked = false;
  function handleUnlockGesture(): void {
    audioSystem.api.unlock();
    audioSystem.api.startAmbience();
    if (!audioUnlocked) {
      audioUnlocked = true;
      world.events.emit("audio:unlocked", {});
    }
  }
  // 1リスナー方針: unlock自体はpointerdown/touchstartそれぞれ初回のみ(once)で十分
  // (unlock()/startAmbience()は内部で冪等)。ui-tapの委譲リスナーはbindUiTapSounds側の1本のみ。
  document.addEventListener("pointerdown", handleUnlockGesture, { once: true });
  document.addEventListener("touchstart", handleUnlockGesture, { once: true, passive: true });

  const fsm = createFsm();
  const app = createGameApp({
    uiRoot,
    world,
    cameraRig,
    fsm,
    seed: config.seed,
    save,
    audio: audioSystem.api,
    applyQuality: (q: Quality) => {
      renderer.setQuality(q);
      world.setQuality(q);
    }
  });

  const debugApi = installDebugApi(config.qa);
  debugApi.registerHandlers({
    getState: () => ({
      qa: config.qa,
      quality: renderer.quality,
      timeScale: clock.timeScale,
      elapsed: clock.elapsed,
      seed: config.seed,
      ...(app.getDebugSnapshot() as Record<string, unknown>)
    }),
    setTimeScale: (v: number) => {
      clock.timeScale = v;
    },
    setQuality: (v: Quality) => {
      renderer.setQuality(v);
      world.setQuality(v);
    },
    jumpTo: (phase: GamePhase) => {
      app.jumpTo(phase);
    },
    playBehavior: (id) => world.playBehaviorDirect(id),
    reset: (seed?: number) => {
      const url = new URL(window.location.href);
      if (seed !== undefined) url.searchParams.set("seed", String(seed));
      window.location.href = url.toString();
    },
    screenshotReady: () => true
  });
  // hideFoodDirectはdocs/INTERFACES.mdのDebugApi契約には含まれない、S4向けE2E補助の追加プロパティ。
  // 既存インスタンスを丸ごと差し替えると(spread等)プロトタイプ上のメソッド群が失われるため、
  // 同一オブジェクトへ直接プロパティを生やす(ドラッグ操作のE2E化が難しい場合の代替経路。
  // 手動ドラッグ経路はscreens/hide.tsに別途残っている)。
  const debugApiHandle = window.__ELEPHANT_GAME_DEBUG__ as unknown as Record<string, unknown> | undefined;
  if (debugApiHandle) {
    debugApiHandle.hideFoodDirect = (spotId: Parameters<typeof app.hideFoodDirect>[0], food: Parameters<typeof app.hideFoodDirect>[1]) =>
      app.hideFoodDirect(spotId, food);
  }

  // Service Worker登録(PWA/オフライン対応)。?nosw=1でE2E安定化のためスキップできる(既存契約どおり)。
  if (!config.nosw && typeof navigator !== "undefined" && "serviceWorker" in navigator) {
    try {
      registerSW({ immediate: true });
    } catch {
      // SW未対応環境や登録失敗はオフライン機能が使えないだけで致命的ではない(throw禁止)。
    }
  }

  if (config.act) {
    debugApi.jumpTo(config.act);
  }

  window.addEventListener(
    "beforeunload",
    () => {
      unbindAudioEvents();
      unbindUiTap();
    },
    { once: true }
  );

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
