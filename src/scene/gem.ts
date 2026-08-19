import * as THREE from 'three';
import { makeGemMaterial, getGlowTexture } from '../hair/materials';
import { GEM, PALETTE } from '../style';

/**
 * The dew-drop opal — hero material #2. A faceted core, a soft additive
 * halo, and a slow inner pulse. No transmission pass (mobile heat budget);
 * the "inner light" is emissive + halo.
 */
export class Gem {
  readonly group = new THREE.Group();
  readonly mat: THREE.MeshPhysicalMaterial;
  private halo: THREE.Sprite;
  private time = 0;
  pulse = 0; // 0 idle .. 1 excited (near snap)

  constructor() {
    this.mat = makeGemMaterial();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(GEM.radius, 0), this.mat);
    // A slightly elongated teardrop silhouette.
    core.scale.set(1, 1.25, 1);
    this.group.add(core);

    const haloMat = new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: new THREE.Color(PALETTE.gemCore),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.halo = new THREE.Sprite(haloMat);
    this.halo.scale.setScalar(GEM.radius * 4.5);
    this.group.add(this.halo);
    this.group.visible = false;
  }

  show(at: THREE.Vector3): void {
    this.group.position.copy(at);
    this.group.visible = true;
    this.group.scale.setScalar(0.001);
  }

  hide(): void {
    this.group.visible = false;
  }

  tick(dt: number): void {
    if (!this.group.visible) return;
    this.time += dt;
    const breathe = 0.5 + 0.5 * Math.sin(this.time * 2.2);
    this.mat.emissiveIntensity = THREE.MathUtils.lerp(
      GEM.emissiveIntensityIdle + breathe * 0.25,
      GEM.emissiveIntensityPulse,
      this.pulse
    );
    (this.halo.material as THREE.SpriteMaterial).opacity = 0.4 + 0.25 * breathe + 0.3 * this.pulse;
    this.halo.scale.setScalar(GEM.radius * (4.2 + breathe * 0.9 + this.pulse * 2));
    this.group.rotation.y += dt * 0.6;
  }
}
