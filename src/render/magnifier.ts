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
 *
 * ## R1 root cause (fixed here)
 * The overlay previously never appeared in the composited frame despite
 * every other signal looking correct (opacity ramped, mesh visible/in
 * frustum, draw calls issued, no GL errors, RTT source content verified).
 * Root cause, confirmed with a synchronous `gl.readPixels` taken inside the
 * same call stack as the overlay's `renderer.render()` call (avoiding the
 * classic `preserveDrawingBuffer:false` "read-after-the-fact" trap): the
 * overlay camera was an `OrthographicCamera(0, widthCss, 0, heightCss, ...)`
 * — i.e. `top=0 < bottom=heightCss`, an inverted pair chosen so CSS
 * top-left-origin coordinates could be handed straight to `left/right/top/
 * bottom`. That inversion makes the projection matrix's Y-scale term
 * negative, which is mathematically a single-axis mirror — and a
 * single-axis mirror flips every triangle's on-screen winding order.
 * `MeshBasicMaterial` defaults to `side: FrontSide`, i.e. backface culling
 * ON, so both the lens disc and the ring frame were being rasterized with
 * flipped winding, classified as back-facing, and silently discarded before
 * ever reaching a fragment — draw calls fire, zero pixels change, no error
 * anywhere in the pipeline to catch it. (Independently reproduced: an
 * unconditional fully-opaque test quad added to this scene was *also*
 * invisible, and `gl.getParameter(gl.CULL_FACE)` read back `true` right
 * after the draw — conclusive.)
 *
 * Fixed two ways, deliberately redundant: the camera now uses a standard
 * right-handed `top > bottom` frustum (CSS→world Y conversion happens once,
 * in `resize()`, instead of being smuggled into the camera's axis
 * convention), AND both overlay materials are `side: THREE.DoubleSide` —
 * these are flat, always-facing-the-viewer HUD quads with no "back" a
 * player could ever see, so culling buys nothing and disabling it removes
 * an entire class of future sign-error regressions here.
 */
import * as THREE from 'three';
import { createBrassRingFrameTexture } from './materials/textures';

/** Render-target resolution (square) the loupe camera renders into. */
export const MAGNIFIER_RT_SIZE = 512;

/** Lens radius, CSS px. */
export const MAGNIFIER_LENS_RADIUS = 92;

/** Screen margin from the anchor corner, CSS px. */
export const MAGNIFIER_MARGIN = 28;

/** Fade half-life (s) for smooth show/hide. */
const FADE_HALF_LIFE_S = 0.12;

/**
 * F9 (review round 1): pure anchor-position math (CSS top-left-origin px)
 * for the magnifier lens/ring center, split out from `resize()` so it is
 * unit-testable without constructing any Three.js/WebGL/Canvas machinery —
 * `MagnifierImpl`'s constructor needs `document` (for its procedural brass
 * texture, `materials/textures.ts#createBrassRingFrameTexture`), which is
 * unavailable under this repo's frozen `environment:'node'` vitest config
 * (see tests/unit/render-magnifier-anchor.test.ts and
 * tests/unit/game-input.test.ts's own doc comment on the same constraint).
 *
 * R1 root cause (fixed here): the lens was anchored top-right — the exact
 * same corner `src/ui/hud.ts`'s sound toggle occupies
 * (`.eiffel-corner-tr`, src/styles/base.css) — so the brass ring sat
 * directly on top of it in every viewport (see the pre-fix
 * artifacts/qa/*\/magnifier.png captures). Anchoring bottom-right instead
 * clears every HUD element in all 4 supported viewports without any
 * per-orientation branching:
 *   - pause (top-left) / sound (top-right): both pinned to the top row —
 *     `src/styles/base.css`'s `.eiffel-corner-tl`/`.eiffel-corner-tr`.
 *   - leg-progress pictograms: bottom-center in portrait, top-center in
 *     landscape (`src/styles/components.css`'s `.eiffel-leg-progress` +
 *     its `orientation: landscape` override) — horizontally centered, so
 *     a bottom-RIGHT anchor never overlaps it in either orientation.
 * The magnified content itself (the real pin/ring junction) is framed by
 * the `jackCloseup`/`alignment` camera cues near-center — see
 * `render/camera/cameraPoses.ts` — so the lens never ends up sitting on
 * top of the very thing it enlarges either.
 */
export function magnifierAnchorCss(viewportWidthCss: number, viewportHeightCss: number): { cx: number; cy: number } {
  const w = Math.max(1, viewportWidthCss);
  const h = Math.max(1, viewportHeightCss);
  return {
    cx: w - MAGNIFIER_MARGIN - MAGNIFIER_LENS_RADIUS,
    cy: h - MAGNIFIER_MARGIN - MAGNIFIER_LENS_RADIUS,
  };
}

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
    // Standard right-handed, Y-UP orthographic frustum (top > bottom) — see
    // this module's "R1 root cause" doc comment below for why this matters:
    // an inverted top/bottom pair silently flips on-screen winding and gets
    // every overlay draw backface-culled into invisibility. `resize()`
    // converts CSS top-left-origin coordinates into this Y-up frame at the
    // one call site that needs it, instead of fighting the camera's axes.
    this.overlayCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -10, 10);
    this.overlayCamera.position.z = 1;

    // `side: DoubleSide` is deliberate belt-and-suspenders: these are flat,
    // always-camera-facing HUD quads with no "back" a player could ever see,
    // so there is no visual cost to disabling the FrontSide culling test —
    // and it means a future sign mistake in the frame math above degrades to
    // "still visible" instead of silently culling the whole magnifier again.
    this.lensMaterial = new THREE.MeshBasicMaterial({
      map: this.renderTarget.texture,
      transparent: true,
      opacity: 0,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
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
      side: THREE.DoubleSide,
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
    // Standard, non-inverted Y-up frustum centered on the viewport — see
    // this module's "R1 root cause" doc comment for why top/bottom must
    // stay in this order (top > bottom).
    this.overlayCamera.left = -this.widthCss / 2;
    this.overlayCamera.right = this.widthCss / 2;
    this.overlayCamera.top = this.heightCss / 2;
    this.overlayCamera.bottom = -this.heightCss / 2;
    this.overlayCamera.updateProjectionMatrix();

    // Desired anchor in CSS top-left-origin terms (screen's bottom-right
    // corner — see `magnifierAnchorCss`'s doc comment, F9), converted into
    // the camera's centered Y-up world frame.
    const { cx: cxCss, cy: cyCss } = magnifierAnchorCss(this.widthCss, this.heightCss);
    const cx = cxCss - this.widthCss / 2;
    const cy = this.heightCss / 2 - cyCss;
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
