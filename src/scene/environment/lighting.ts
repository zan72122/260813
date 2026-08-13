// 沖縄の朝の光: TimeOfDay 3種 x Quality対応の照明リグ。空はCanvasTextureのグラデーション。
import * as THREE from "three";
import type { Quality, TimeOfDay } from "../../core/types";
import { makeCanvasTexture } from "./proc";

interface TimeConfig {
  sky: [string, string, string]; // 天頂→中間→地平
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  sunColor: string;
  sunIntensity: number;
  sunPos: [number, number, number];
  fogColor: string;
  fogNear: number;
  fogFar: number;
}

const TIME_CONFIGS: Record<TimeOfDay, TimeConfig> = {
  morning: {
    sky: ["#aee3f5", "#cfeaf0", "#f5ead8"],
    hemiSky: "#fff3e0",
    hemiGround: "#e8d5a8",
    hemiIntensity: 1.05,
    sunColor: "#fff3e0",
    sunIntensity: 1.3,
    sunPos: [10, 14, 12],
    fogColor: "#dfeef0",
    fogNear: 26,
    fogFar: 68
  },
  noon: {
    sky: ["#8fd0f0", "#bfe6f2", "#f2f4ea"],
    hemiSky: "#ffffff",
    hemiGround: "#e8d5a8",
    hemiIntensity: 1.2,
    sunColor: "#ffffff",
    sunIntensity: 1.5,
    sunPos: [2, 22, 4],
    fogColor: "#e6f1f2",
    fogNear: 32,
    fogFar: 76
  },
  evening: {
    sky: ["#5b6fa0", "#e0a468", "#ffd9a0"],
    hemiSky: "#ffcf9e",
    hemiGround: "#cbb387",
    hemiIntensity: 0.85,
    sunColor: "#ffb066",
    sunIntensity: 1.1,
    sunPos: [-14, 7, 10],
    fogColor: "#e8c79a",
    fogNear: 20,
    fogFar: 60
  }
};

function makeSkyTexture(cfg: TimeConfig): THREE.CanvasTexture {
  return makeCanvasTexture(256, (ctx, w, h) => {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, cfg.sky[0]);
    grad.addColorStop(0.55, cfg.sky[1]);
    grad.addColorStop(1, cfg.sky[2]);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  });
}

export interface LightingRig {
  readonly group: THREE.Group;
  setTimeOfDay(t: TimeOfDay): void;
  setQuality(q: Quality): void;
  /** せってい「ひかりをよわく」: 光強度を約70%に落とす(まぶしさが苦手な子ども向け)。 */
  setDim(on: boolean): void;
  dispose(): void;
}

export function createLighting(scene: THREE.Scene, initialTime: TimeOfDay, initialQuality: Quality): LightingRig {
  const group = new THREE.Group();
  group.name = "lighting";

  const hemi = new THREE.HemisphereLight(0xfff3e0, 0xe8d5a8, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = false;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -18;
  sun.shadow.camera.right = 18;
  sun.shadow.camera.top = 18;
  sun.shadow.camera.bottom = -18;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 50;
  sun.shadow.bias = -0.0015;
  const ambient = new THREE.AmbientLight(0xffffff, 0.15);
  group.add(hemi, sun, ambient);

  let currentTime: TimeOfDay = initialTime;
  let currentQuality: Quality = initialQuality;
  let skyTexture: THREE.CanvasTexture | null = null;
  let dimmed = false;
  const AMBIENT_BASE_INTENSITY = 0.15;

  function dimFactor(): number {
    return dimmed ? 0.7 : 1;
  }

  function applyIntensities(): void {
    const cfg = TIME_CONFIGS[currentTime];
    const f = dimFactor();
    hemi.intensity = cfg.hemiIntensity * f;
    sun.intensity = cfg.sunIntensity * f;
    ambient.intensity = AMBIENT_BASE_INTENSITY * f;
  }

  function setDim(on: boolean): void {
    dimmed = on;
    applyIntensities();
  }

  function applyTime(t: TimeOfDay): void {
    currentTime = t;
    const cfg = TIME_CONFIGS[t];
    hemi.color.set(cfg.hemiSky);
    hemi.groundColor.set(cfg.hemiGround);
    sun.color.set(cfg.sunColor);
    sun.position.set(...cfg.sunPos);
    sun.target.position.set(0, 0, 0);
    if (!sun.target.parent) group.add(sun.target);

    skyTexture?.dispose();
    skyTexture = makeSkyTexture(cfg);
    scene.background = skyTexture;
    scene.fog = new THREE.Fog(new THREE.Color(cfg.fogColor).getHex(), cfg.fogNear, cfg.fogFar);
    applyIntensities();
  }

  function applyQuality(q: Quality): void {
    currentQuality = q;
    // 影を落とす光源は最大1つ、lowでは無効(ARCHITECTURE.md: low=影なし)。
    sun.castShadow = q !== "low";
  }

  applyTime(currentTime);
  applyQuality(currentQuality);

  return {
    group,
    setTimeOfDay: applyTime,
    setQuality: applyQuality,
    setDim,
    dispose(): void {
      skyTexture?.dispose();
      hemi.dispose();
      sun.dispose();
      sun.target.parent?.remove(sun.target);
    }
  };
}
