import * as THREE from "three";
import type { Quality } from "../core/types";

interface QualitySettings {
  dprCap: number;
  shadows: boolean;
}

const QUALITY_SETTINGS: Record<Quality, QualitySettings> = {
  low: { dprCap: 1, shadows: false },
  medium: { dprCap: 1.5, shadows: true },
  high: { dprCap: 1.75, shadows: true }
};

export interface GameRenderer {
  readonly instance: THREE.WebGLRenderer;
  readonly domElement: HTMLCanvasElement;
  readonly paused: boolean;
  readonly quality: Quality;
  setQuality(q: Quality): void;
  resize(): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  /** R1-04向け: instance.info(draw calls/triangles)の薄いgetter。main.tsのgetState()配線用。 */
  getStats(): { calls: number; triangles: number };
  dispose(): void;
}

class Renderer implements GameRenderer {
  readonly instance: THREE.WebGLRenderer;
  private container: HTMLElement;
  private currentQuality: Quality;
  private isPaused = false;
  private contextLost = false;
  private onResize = (): void => this.resize();
  private onVisibility = (): void => {
    this.isPaused = document.hidden;
  };
  private onContextLost = (e: Event): void => {
    e.preventDefault();
    this.contextLost = true;
    console.warn("[renderer] webgl context lost");
  };
  private onContextRestored = (): void => {
    this.contextLost = false;
    console.warn("[renderer] webgl context restored");
    this.applyQuality(this.currentQuality);
    this.resize();
  };

  constructor(container: HTMLElement, initialQuality: Quality) {
    this.container = container;
    this.currentQuality = initialQuality;
    this.instance = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: "high-performance"
    });
    this.instance.domElement.addEventListener("webglcontextlost", this.onContextLost, false);
    this.instance.domElement.addEventListener("webglcontextrestored", this.onContextRestored, false);
    container.appendChild(this.instance.domElement);

    this.applyQuality(initialQuality);
    this.resize();

    window.addEventListener("resize", this.onResize);
    window.addEventListener("orientationchange", this.onResize);
    document.addEventListener("visibilitychange", this.onVisibility);
  }

  get domElement(): HTMLCanvasElement {
    return this.instance.domElement;
  }

  get paused(): boolean {
    return this.isPaused;
  }

  get quality(): Quality {
    return this.currentQuality;
  }

  private applyQuality(q: Quality): void {
    const settings = QUALITY_SETTINGS[q];
    const dpr = Math.min(window.devicePixelRatio || 1, settings.dprCap);
    this.instance.setPixelRatio(dpr);
    this.instance.shadowMap.enabled = settings.shadows;
    this.instance.shadowMap.type = THREE.PCFSoftShadowMap;
  }

  setQuality(q: Quality): void {
    this.currentQuality = q;
    this.applyQuality(q);
  }

  resize(): void {
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.instance.setSize(width, height, true);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    if (this.isPaused || this.contextLost) return;
    this.instance.render(scene, camera);
  }

  getStats(): { calls: number; triangles: number } {
    return { calls: this.instance.info.render.calls, triangles: this.instance.info.render.triangles };
  }

  dispose(): void {
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("orientationchange", this.onResize);
    document.removeEventListener("visibilitychange", this.onVisibility);
    this.instance.domElement.removeEventListener("webglcontextlost", this.onContextLost, false);
    this.instance.domElement.removeEventListener("webglcontextrestored", this.onContextRestored, false);
    this.instance.dispose();
    if (this.instance.domElement.parentElement === this.container) {
      this.container.removeChild(this.instance.domElement);
    }
  }
}

export function createRenderer(container: HTMLElement, initialQuality: Quality = "medium"): GameRenderer {
  return new Renderer(container, initialQuality);
}
