/**
 * The lighting rig: warm underground lamplight, soft sky light above
 * ground, and exactly ONE small (<=1024) shadow map that follows the
 * current focus point (machine room while underground, the carrier while
 * riding) — never a shadow-mapped sun over the whole tower, and no shadows
 * at all in the low quality tier (PERFORMANCE_BUDGET "Techniques").
 */

import * as THREE from 'three';

import { PALETTE } from '../contracts/constants.ts';

/** Shadow map resolution, px — PERFORMANCE_BUDGET "one small shadow map (<=1024)". */
const SHADOW_MAP_SIZE = 1024;
/** Half-extent of the tight shadow-camera frustum around the focus point, meters. */
const SHADOW_FRUSTUM_RADIUS = 7;

export class LightingRig {
  /** Soft sky light above ground (no shadow cost). */
  readonly hemisphere: THREE.HemisphereLight;
  /** Gentle warm directional fill, never shadow-casting (no "sun over the whole tower"). */
  readonly skyFill: THREE.DirectionalLight;
  /** Ambient lift so cutaway interiors read without going murky. */
  readonly ambient: THREE.AmbientLight;
  /** Underground lamplight: warm point light, the ONE shadow-casting light. */
  readonly focusLamp: THREE.SpotLight;
  private readonly focusTarget: THREE.Object3D;
  private shadowsEnabled = true;

  constructor(private readonly scene: THREE.Scene) {
    this.hemisphere = new THREE.HemisphereLight(PALETTE.skyZenith, '#4a5138', 1.3);
    this.scene.add(this.hemisphere);

    this.skyFill = new THREE.DirectionalLight(PALETTE.skyHorizon, 1.2);
    this.skyFill.position.set(-20, 60, 40);
    this.skyFill.castShadow = false;
    this.scene.add(this.skyFill);

    this.ambient = new THREE.AmbientLight(PALETTE.undergroundLamplight, 0.32);
    this.scene.add(this.ambient);

    this.focusTarget = new THREE.Object3D();
    this.scene.add(this.focusTarget);

    this.focusLamp = new THREE.SpotLight(PALETTE.undergroundLamplight, 140, 60, Math.PI / 3.2, 0.55, 1.4);
    this.focusLamp.position.set(4, 8, 6);
    this.focusLamp.target = this.focusTarget;
    this.focusLamp.castShadow = true;
    this.focusLamp.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    this.focusLamp.shadow.camera.near = 0.5;
    this.focusLamp.shadow.camera.far = 40;
    this.focusLamp.shadow.bias = -0.0025;
    this.focusLamp.shadow.radius = 2;
    this.scene.add(this.focusLamp);
  }

  /** Move the one shadow-casting light to illuminate a new focus point (machine room / carrier). */
  setFocus(point: THREE.Vector3, lampOffset: THREE.Vector3): void {
    this.focusTarget.position.copy(point);
    this.focusLamp.position.copy(point).add(lampOffset);
  }

  /** Constrain the shadow frustum tightly around the current focus (small-shadow budget). */
  setFrustumRadius(radius: number = SHADOW_FRUSTUM_RADIUS): void {
    this.focusLamp.shadow.camera.far = radius * 4;
  }

  setShadowsEnabled(enabled: boolean): void {
    if (this.shadowsEnabled === enabled) return;
    this.shadowsEnabled = enabled;
    this.focusLamp.castShadow = enabled;
  }

  setShadowMapSize(size: number): void {
    const clamped = Math.min(SHADOW_MAP_SIZE, Math.max(256, size));
    this.focusLamp.shadow.mapSize.set(clamped, clamped);
    this.focusLamp.shadow.map?.dispose();
    this.focusLamp.shadow.map = null;
  }

  dispose(): void {
    this.focusLamp.shadow.map?.dispose();
    this.scene.remove(this.hemisphere, this.skyFill, this.ambient, this.focusLamp, this.focusTarget);
  }
}
