/**
 * Auditorium shell: proscenium arch framing the stage, side seat boxes, and
 * a top curtain valance. Static geometry (the auditorium itself never moves
 * with the transform) using the blue/white/gold palette from
 * docs/VISUAL_DIRECTION.md via ctx.services.materials only.
 */
import { BoxGeometry, Group, Mesh, TorusGeometry, type BufferGeometry, type Material } from 'three';
import type { MaterialLibrary, QualityTier } from '../../core';
import { AUDITORIUM_SEAT_Z, PROSCENIUM_HALF_WIDTH, PROSCENIUM_HEIGHT, PROSCENIUM_Z } from './layout';

export class AuditoriumScene {
  readonly group = new Group();
  private readonly ownedGeometries: BufferGeometry[] = [];
  private readonly ownedMaterials: Material[] = [];

  constructor(materials: MaterialLibrary) {
    this.buildArch(materials);
    this.buildSeatBoxes(materials);
    this.buildValance(materials);
  }

  private buildArch(materials: MaterialLibrary): void {
    const archGeometry = new TorusGeometry(PROSCENIUM_HALF_WIDTH, 0.22, 8, 24, Math.PI);
    this.ownedGeometries.push(archGeometry);
    const archMaterial = materials.auditorium('wall');
    this.ownedMaterials.push(archMaterial);
    const arch = new Mesh(archGeometry, archMaterial);
    arch.rotation.z = Math.PI;
    arch.position.set(0, PROSCENIUM_HEIGHT * 0.55, PROSCENIUM_Z);
    this.group.add(arch);

    const trimGeometry = new TorusGeometry(PROSCENIUM_HALF_WIDTH + 0.14, 0.06, 6, 24, Math.PI);
    this.ownedGeometries.push(trimGeometry);
    const trimMaterial = materials.goldTrim();
    this.ownedMaterials.push(trimMaterial);
    const trim = new Mesh(trimGeometry, trimMaterial);
    trim.rotation.z = Math.PI;
    trim.position.set(0, PROSCENIUM_HEIGHT * 0.55, PROSCENIUM_Z);
    this.group.add(trim);

    const pillarGeometry = new BoxGeometry(0.34, PROSCENIUM_HEIGHT * 0.55, 0.34);
    this.ownedGeometries.push(pillarGeometry);
    for (const side of [-1, 1]) {
      const pillarMaterial = materials.auditorium('marble');
      this.ownedMaterials.push(pillarMaterial);
      const pillar = new Mesh(pillarGeometry, pillarMaterial);
      pillar.position.set(side * PROSCENIUM_HALF_WIDTH, PROSCENIUM_HEIGHT * 0.275, PROSCENIUM_Z);
      this.group.add(pillar);
    }
  }

  private buildSeatBoxes(materials: MaterialLibrary): void {
    const boxGeometry = new BoxGeometry(0.9, 1.1, 1.4);
    this.ownedGeometries.push(boxGeometry);
    for (const side of [-1, 1]) {
      for (const z of AUDITORIUM_SEAT_Z) {
        const material = materials.auditorium('seat');
        this.ownedMaterials.push(material);
        const box = new Mesh(boxGeometry, material);
        box.position.set(side * (PROSCENIUM_HALF_WIDTH + 0.7), 0.55, z);
        this.group.add(box);

        const railMaterial = materials.goldTrim();
        this.ownedMaterials.push(railMaterial);
        const railGeometry = new BoxGeometry(0.94, 0.06, 1.44);
        this.ownedGeometries.push(railGeometry);
        const rail = new Mesh(railGeometry, railMaterial);
        rail.position.set(side * (PROSCENIUM_HALF_WIDTH + 0.7), 1.13, z);
        this.group.add(rail);
      }
    }
  }

  private buildValance(materials: MaterialLibrary): void {
    const geometry = new BoxGeometry(PROSCENIUM_HALF_WIDTH * 2.3, 0.7, 0.12);
    this.ownedGeometries.push(geometry);
    const material = materials.auditorium('curtain');
    this.ownedMaterials.push(material);
    const valance = new Mesh(geometry, material);
    valance.position.set(0, PROSCENIUM_HEIGHT + 0.2, PROSCENIUM_Z);
    this.group.add(valance);
  }

  applyQuality(_tier: QualityTier): void {
    // Static low-poly shell; nothing to downgrade.
  }

  dispose(): void {
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.group.clear();
  }
}
