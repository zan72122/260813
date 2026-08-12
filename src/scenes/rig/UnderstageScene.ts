/**
 * Underground mechanism room (docs/STAGE_MECHANISM_ABSTRACTION.md): the rope,
 * its wooden lock, two pulleys, the winding drum, a counterweight and two
 * wing chariots, plus a simple cutaway floor slab. Every moving part's pose
 * is a pure function of TransformDerivedState (deriveTransformState(p)) --
 * no local timers. The lock is the one boolean, non-continuous element (a
 * discrete "unlocked" gate flipped once by the unlock ActionIntent); it snaps
 * instantly rather than tweening, for the same reason: releasing the pointer
 * must stop everything with nothing left mid-animation.
 */
import { BoxGeometry, CylinderGeometry, Group, Mesh, type BufferGeometry, type Material } from 'three';
import type { MaterialLibrary, QualityTier, TransformDerivedState } from '../../core';
import { UNDERSTAGE_BOTTOM_Y, UNDERSTAGE_TOP_Y } from './layout';

const ROPE_X = 0.85;
const ROPE_Z = 1.05;
const PULLEY_Y = [-0.35, -1.15] as const;
const DRUM_Y = -2.05;
const COUNTERWEIGHT_X = 1.35;
const CHARIOT_TRACK_HALF = 1.5;
const CHARIOT_Y = UNDERSTAGE_BOTTOM_Y + 0.18;

export class UnderstageScene {
  readonly group = new Group();
  private readonly rope: Mesh;
  private readonly pulleys: Mesh[] = [];
  private readonly drum: Mesh;
  private readonly counterweight: Mesh;
  private readonly chariotOld: Mesh;
  private readonly chariotNew: Mesh;
  private readonly lockLever: Mesh;
  private readonly floorSlab: Mesh;
  private readonly ownedGeometries: BufferGeometry[] = [];
  private readonly ownedMaterials: Material[] = [];
  private unlocked = false;

  constructor(private readonly materials: MaterialLibrary) {
    const ropeHeight = UNDERSTAGE_TOP_Y - DRUM_Y + 0.4;
    const ropeGeometry = new CylinderGeometry(0.045, 0.045, ropeHeight, 8);
    this.ownedGeometries.push(ropeGeometry);
    const ropeMaterial = materials.rope();
    this.ownedMaterials.push(ropeMaterial);
    this.rope = new Mesh(ropeGeometry, ropeMaterial);
    this.rope.position.set(ROPE_X, UNDERSTAGE_TOP_Y - ropeHeight / 2 + 0.2, ROPE_Z);
    this.group.add(this.rope);

    for (const y of PULLEY_Y) {
      const geometry = new CylinderGeometry(0.18, 0.18, 0.09, 12);
      this.ownedGeometries.push(geometry);
      const material = materials.wood('pulley');
      this.ownedMaterials.push(material);
      const pulley = new Mesh(geometry, material);
      pulley.rotation.x = Math.PI / 2;
      pulley.position.set(ROPE_X - 0.05, y, ROPE_Z - 0.05);
      this.group.add(pulley);
      this.pulleys.push(pulley);
    }

    const drumGeometry = new CylinderGeometry(0.22, 0.22, 0.9, 12);
    this.ownedGeometries.push(drumGeometry);
    const drumMaterial = materials.wood('drum');
    this.ownedMaterials.push(drumMaterial);
    this.drum = new Mesh(drumGeometry, drumMaterial);
    this.drum.rotation.z = Math.PI / 2;
    this.drum.position.set(0.4, DRUM_Y, ROPE_Z - 0.2);
    this.group.add(this.drum);

    const cwGeometry = new BoxGeometry(0.32, 0.4, 0.32);
    this.ownedGeometries.push(cwGeometry);
    const cwMaterial = materials.metal();
    this.ownedMaterials.push(cwMaterial);
    this.counterweight = new Mesh(cwGeometry, cwMaterial);
    this.counterweight.position.set(COUNTERWEIGHT_X, UNDERSTAGE_BOTTOM_Y, ROPE_Z);
    this.group.add(this.counterweight);

    const chariotGeometry = new BoxGeometry(0.4, 0.22, 0.3);
    this.ownedGeometries.push(chariotGeometry);
    const chariotOldMaterial = materials.wood('furniture');
    const chariotNewMaterial = materials.wood('furniture');
    this.ownedMaterials.push(chariotOldMaterial, chariotNewMaterial);
    this.chariotOld = new Mesh(chariotGeometry, chariotOldMaterial);
    this.chariotNew = new Mesh(chariotGeometry, chariotNewMaterial);
    this.chariotOld.position.set(-0.6, CHARIOT_Y, 0.2);
    this.chariotNew.position.set(0.6, CHARIOT_Y, 0.2);
    this.group.add(this.chariotOld, this.chariotNew);

    const leverGeometry = new BoxGeometry(0.5, 0.08, 0.1);
    leverGeometry.translate(0.25, 0, 0); // pivot at the rope end
    this.ownedGeometries.push(leverGeometry);
    const leverMaterial = materials.wood('beam');
    this.ownedMaterials.push(leverMaterial);
    this.lockLever = new Mesh(leverGeometry, leverMaterial);
    this.lockLever.position.set(ROPE_X - 0.25, -0.55, ROPE_Z + 0.05);
    this.group.add(this.lockLever);

    const floorGeometry = new BoxGeometry(3.2, 0.12, 2.6);
    this.ownedGeometries.push(floorGeometry);
    const floorMaterial = materials.wood('floor');
    this.ownedMaterials.push(floorMaterial);
    this.floorSlab = new Mesh(floorGeometry, floorMaterial);
    this.floorSlab.position.set(0, UNDERSTAGE_BOTTOM_Y - 0.06, 0.4);
    this.group.add(this.floorSlab);
  }

  /** Snaps the lock lever open/closed. Discrete state, not part of TRANSFORM_TIMELINE. */
  setUnlocked(unlocked: boolean): void {
    if (this.unlocked === unlocked) return;
    this.unlocked = unlocked;
    this.lockLever.rotation.z = unlocked ? -Math.PI * 0.4 : 0;
  }

  /** Drives every mechanism element from the single deterministic derived state. */
  update(derived: TransformDerivedState): void {
    this.materials.setRopeScroll(derived.ropeOffset);
    this.rope.position.y = UNDERSTAGE_TOP_Y - derived.ropeOffset * 0.15 + 0.2;

    for (let i = 0; i < this.pulleys.length; i += 1) {
      const pulley = this.pulleys[i];
      if (pulley) pulley.rotation.y = derived.pulleyAngle;
    }
    this.drum.rotation.x = derived.drumAngle;
    this.counterweight.position.y = derived.counterweightY;

    this.chariotOld.position.x = -CHARIOT_TRACK_HALF * derived.chariotOldProgress;
    this.chariotOld.visible = derived.chariotOldProgress < 0.999;
    this.chariotNew.position.x = CHARIOT_TRACK_HALF * (derived.chariotNewProgress - 1) + CHARIOT_TRACK_HALF;
    this.chariotNew.visible = derived.chariotNewProgress > 0.001;
  }

  applyQuality(_tier: QualityTier): void {
    // Geometry is already minimal; nothing to downgrade.
  }

  dispose(): void {
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.group.clear();
  }
}
