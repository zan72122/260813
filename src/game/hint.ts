import * as THREE from 'three';
import { getGlowTexture } from '../hair/materials';
import { PALETTE, TIMING } from '../style';

/**
 * Wordless guidance: a firefly that repeatedly traces the expected gesture
 * path in world space, plus an emissive pulse on the target strand
 * (driven by Game). No text, no arrows, no UI overlays.
 */
export class Hint {
  readonly sprite: THREE.Sprite;
  private path: THREE.Vector3[] = [];
  private t = 0;
  private active = false;
  private delay = 0;
  private idleClock = 0;

  constructor(scene: THREE.Scene) {
    const mat = new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: new THREE.Color(PALETTE.hintGlow),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending
    });
    this.sprite = new THREE.Sprite(mat);
    this.sprite.scale.setScalar(0.09);
    this.sprite.renderOrder = 10;
    scene.add(this.sprite);
  }

  /** Set the gesture path to demonstrate. delay: seconds before showing. */
  show(path: THREE.Vector3[], delay = 0): void {
    this.path = path;
    this.t = 0;
    this.idleClock = 0;
    this.delay = delay;
    this.active = true;
  }

  /** Player touched — hide and restart the patience timer. */
  calm(): void {
    this.idleClock = 0;
    this.t = 0;
    (this.sprite.material as THREE.SpriteMaterial).opacity = 0;
  }

  hide(): void {
    this.active = false;
    (this.sprite.material as THREE.SpriteMaterial).opacity = 0;
  }

  tick(dt: number, fingerDown: boolean): void {
    if (!this.active || this.path.length < 2) return;
    if (fingerDown) {
      this.calm();
      return;
    }
    this.idleClock += dt;
    if (this.idleClock < this.delay) return;

    this.t = (this.t + dt / 1.6) % 1.3; // 1.6s trace + a pause
    const k = Math.min(this.t, 1);
    const eased = k * k * (3 - 2 * k);
    const idx = eased * (this.path.length - 1);
    const i = Math.floor(idx);
    const f = idx - i;
    const p = this.path[Math.min(i, this.path.length - 1)]
      .clone()
      .lerp(this.path[Math.min(i + 1, this.path.length - 1)], f);
    this.sprite.position.copy(p);
    const fade = Math.sin(Math.min(k, 1) * Math.PI);
    (this.sprite.material as THREE.SpriteMaterial).opacity = this.t > 1 ? 0 : fade * 0.85;
  }
}

/** Emissive pulse value for the current hint target material. */
export function hintPulse(time: number): number {
  return 0.16 + 0.13 * (0.5 + 0.5 * Math.sin((time * Math.PI * 2) / TIMING.hintPulsePeriod));
}
