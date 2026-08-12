/**
 * The magnifier: a second camera renders the SAME scene (same lighting,
 * same materials — "抽象的な別画面にしない") into a small render target,
 * which is then displayed as a circular lens with a procedural brass ring
 * frame (VISUAL_ACCEPTANCE "真鍮の機械式ルーペ枠") drawn as a screen-anchored
 * overlay on top of the main render. Shown/hidden smoothly on
 * `magnifierShown` events (render/index.ts wires that), never a hard cut.
 *
 * The overlay (lens + ring) lives in its own tiny Scene + OrthographicCamera
 * so render/index.ts's main frame loop can draw it as a second, un-cleared
 * pass after the primary render — see that module's render() for the
 * exact call sequence this expects.
 */
import * as THREE from 'three';
import { createBrassRingFrameTexture } from './materials/textures';

/** Render-target resolution (square) the loupe camera renders into. */
export const MAGNIFIER_RT_SIZE = 512;

/** Lens radius, CSS px. */
export const MAGNIFIER_LENS_RADIUS = 92;

/** Screen margin from the top-right corner, CSS px. */
export const MAGNIFIER_MARGIN = 28;

/** Fade half-life (s) for smooth show/hide. */
const FADE_HALF_LIFE_S = 0.12;

export interface Magnifier {
  /** The loupe's own camera — render/index.ts points the main renderer at this into `renderTarget` each frame it's visible. */
  camera: THREE.PerspectiveCamera;
  renderTarget: THREE.WebGLRenderTarget;
  /** Tiny overlay scene containing just the lens disc + brass ring, screen-anchored. */
  overlayScene: THREE.Scene;
  overlayCamera: THREE.OrthographicCamera;
  /** Requests the magnifier fade to shown/hidden. */
  setShown(shown: boolean): void;
  /** Advances the show/hide fade. Call once per frame regardless of visibility. */
  update(dtSeconds: number): void;
  /** True while opacity is high enough that the render-target pass is worth doing. */
  isVisible(): boolean;
  /** Points the loupe camera at `target`, viewed from `position`. */
  aim(position: THREE.Vector3, target: THREE.Vector3): void;
  /** Re-anchors the overlay to the current CSS viewport size. */
  resize(viewportWidthCss: number, viewportHeightCss: number): void;
  dispose(): void;
}

class MagnifierImpl implements Magnifier {
  camera: THREE.PerspectiveCamera;
  renderTarget: THREE.WebGLRenderTarget;
  overlayScene: THREE.Scene;
  overlayCamera: THREE.OrthographicCamera;

  private readonly lensMesh: THREE.Mesh;
  private readonly lensMaterial: THREE.MeshBasicMaterial;
  private readonly ringMesh: THREE.Mesh;
  private readonly ringMaterial: THREE.MeshBasicMaterial;
  private readonly ringTexture: THREE.Texture;
  private targetOpacity = 0;
  private opacity = 0;
  private widthCss = 1;
  private heightCss = 1;

  constructor() {
    this.camera = new THREE.PerspectiveCamera(28, 1, 0.5, 500);
    this.renderTarget = new THREE.WebGLRenderTarget(MAGNIFIER_RT_SIZE, MAGNIFIER_RT_SIZE, {
      colorSpace: THREE.SRGBColorSpace,
    });

    this.overlayScene = new THREE.Scene();
    this.overlayCamera = new THREE.OrthographicCamera(0, 1, 0, 1, -10, 10);
    this.overlayCamera.position.z = 1;

    this.lensMaterial = new THREE.MeshBasicMaterial({
      map: this.renderTarget.texture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    this.lensMesh = new THREE.Mesh(new THREE.CircleGeometry(MAGNIFIER_LENS_RADIUS, 40), this.lensMaterial);
    this.lensMesh.renderOrder = 1000;
    this.overlayScene.add(this.lensMesh);

    this.ringTexture = createBrassRingFrameTexture(512);
    this.ringMaterial = new THREE.MeshBasicMaterial({
      map: this.ringTexture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
    });
    this.ringMesh = new THREE.Mesh(new THREE.PlaneGeometry(MAGNIFIER_LENS_RADIUS * 2.22, MAGNIFIER_LENS_RADIUS * 2.22), this.ringMaterial);
    this.ringMesh.renderOrder = 1001;
    this.overlayScene.add(this.ringMesh);

    this.resize(1, 1);
  }

  setShown(shown: boolean): void {
    this.targetOpacity = shown ? 1 : 0;
  }

  update(dtSeconds: number): void {
    if (dtSeconds <= 0) return;
    const factor = 1 - Math.pow(0.5, dtSeconds / FADE_HALF_LIFE_S);
    this.opacity += (this.targetOpacity - this.opacity) * factor;
    if (Math.abs(this.opacity - this.targetOpacity) < 0.002) this.opacity = this.targetOpacity;
    this.lensMaterial.opacity = this.opacity;
    this.ringMaterial.opacity = this.opacity;
  }

  isVisible(): boolean {
    return this.opacity > 0.002;
  }

  aim(position: THREE.Vector3, target: THREE.Vector3): void {
    this.camera.position.copy(position);
    this.camera.lookAt(target);
  }

  resize(viewportWidthCss: number, viewportHeightCss: number): void {
    this.widthCss = Math.max(1, viewportWidthCss);
    this.heightCss = Math.max(1, viewportHeightCss);
    this.overlayCamera.left = 0;
    this.overlayCamera.right = this.widthCss;
    this.overlayCamera.top = 0;
    this.overlayCamera.bottom = this.heightCss;
    this.overlayCamera.updateProjectionMatrix();

    const cx = this.widthCss - MAGNIFIER_MARGIN - MAGNIFIER_LENS_RADIUS;
    const cy = MAGNIFIER_MARGIN + MAGNIFIER_LENS_RADIUS;
    this.lensMesh.position.set(cx, cy, 0);
    this.ringMesh.position.set(cx, cy, 0.01);
  }

  dispose(): void {
    this.renderTarget.dispose();
    this.lensMesh.geometry.dispose();
    this.lensMaterial.dispose();
    this.ringMesh.geometry.dispose();
    this.ringMaterial.dispose();
    this.ringTexture.dispose();
  }
}

export function createMagnifier(): Magnifier {
  return new MagnifierImpl();
}
