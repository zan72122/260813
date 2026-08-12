import * as THREE from 'three';
import type { SeedConfig, ToyDef, ToyMaterial, ToySymbol } from '../game/types.ts';
import { vec2ToWorld } from './constants.ts';
import { plushBlockGeometry, woodBlockGeometry } from './geometry.ts';
import { createFabricWeaveTexture, createWoodGrainTexture } from './materials/textures.ts';
import { PALETTE } from './palette.ts';
import { BlobShadowManager } from './shadows.ts';
import { Easing, TweenManager } from './tween.ts';

export interface ToyVisual {
  id: string;
  def: ToyDef;
  group: THREE.Group;
  mesh: THREE.Mesh;
  proxy: THREE.Mesh;
  shadowIndex: number;
  stored: boolean;
  held: boolean;
  restY: number;
}

const TOY_Y_REST = 0.045;

export class ToySystem {
  readonly group = new THREE.Group();
  readonly toys = new Map<string, ToyVisual>();
  readonly proxyToId = new Map<THREE.Object3D, string>();
  private tweens: TweenManager;
  private shadows: BlobShadowManager;

  constructor(seedConfig: SeedConfig, tweens: TweenManager, shadows: BlobShadowManager) {
    this.tweens = tweens;
    this.shadows = shadows;

    const woodTex = createWoodGrainTexture(PALETTE.woodLight, 256, 40);
    const fabricTex = createFabricWeaveTexture(0xffffff, 256, 41);

    for (const toy of seedConfig.toys) {
      const visual = this.buildToy(toy, woodTex, fabricTex);
      this.toys.set(toy.id, visual);
      this.proxyToId.set(visual.proxy, toy.id);
      this.group.add(visual.group);
    }
  }

  private accentColor(material: ToyMaterial, index: number): number {
    const list = PALETTE.toyAccentByMaterial[material];
    return list[index % list.length]!;
  }

  private buildToy(toy: ToyDef, woodTex: THREE.Texture, fabricTex: THREE.Texture): ToyVisual {
    let geo: THREE.BufferGeometry;
    let mat: THREE.MeshStandardMaterial;
    const idx = Number(toy.id.split('-')[1] ?? 0);
    const color = this.accentColor(toy.material, idx);

    if (toy.material === 'wood') {
      geo = woodBlockGeometry(0.15);
      mat = new THREE.MeshStandardMaterial({ color, map: woodTex, roughness: 0.55, metalness: 0.04 });
    } else if (toy.material === 'fabric') {
      geo = plushBlockGeometry(0.17);
      mat = new THREE.MeshStandardMaterial({ color, map: fabricTex, roughness: 0.92, metalness: 0 });
    } else {
      geo = new THREE.SphereGeometry(0.085, 20, 14);
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.06 });
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = TOY_Y_REST;
    mesh.rotation.y = toy.rotationY;
    mesh.userData['toyId'] = toy.id;

    const proxyGeo = new THREE.SphereGeometry(0.19, 8, 6);
    const proxy = new THREE.Mesh(proxyGeo, new THREE.MeshBasicMaterial());
    proxy.visible = false;
    proxy.position.y = TOY_Y_REST;
    proxy.userData['toyId'] = toy.id;

    const group = new THREE.Group();
    const worldPos = vec2ToWorld(toy.start);
    group.position.copy(worldPos);
    group.add(mesh, proxy);

    const shadowIndex = this.shadows.allocate(0.16);
    this.shadows.update(shadowIndex, worldPos.x, worldPos.z, 1);

    return { id: toy.id, def: toy, group, mesh, proxy, shadowIndex, stored: false, held: false, restY: TOY_Y_REST };
  }

  getSymbol(id: string): ToySymbol | undefined {
    return this.toys.get(id)?.def.symbol;
  }

  worldPositionOf(id: string): THREE.Vector3 {
    return this.toys.get(id)!.group.position.clone();
  }

  setHeld(id: string, held: boolean): void {
    const t = this.toys.get(id);
    if (!t) return;
    t.held = held;
    if (held) {
      t.mesh.scale.set(1.08, 0.92, 1.08);
    }
  }

  /** Called continuously while dragging: world XZ position, with the mesh floating above the proxy drop point (drag proxy offset) handled by the input layer via screen-space offset before unprojection. */
  setDragPosition(id: string, worldX: number, worldZ: number, lift: number): void {
    const t = this.toys.get(id);
    if (!t) return;
    t.group.position.x = worldX;
    t.group.position.z = worldZ;
    t.mesh.position.y = TOY_Y_REST + lift;
    this.shadows.update(t.shadowIndex, worldX, worldZ, THREE.MathUtils.clamp(1 - lift * 1.5, 0.35, 1));
  }

  /** Sloppy drop landed outside any basket: gently settle where dropped, stays draggable. */
  settleAtCurrentPosition(id: string): void {
    const t = this.toys.get(id);
    if (!t) return;
    t.held = false;
    const startY = t.mesh.position.y;
    this.tweens.add(0.25, Easing.cubicOut, (p) => {
      t.mesh.position.y = THREE.MathUtils.lerp(startY, TOY_Y_REST, p);
      t.mesh.scale.setScalar(THREE.MathUtils.lerp(1.08, 1, p));
    });
  }

  /** Magnet-snap success: arcs into the basket, one soft bounce, then shrinks/hides into the basket. */
  playCaptureBounce(id: string, basketWorldPos: THREE.Vector3, onLanded: () => void): void {
    const t = this.toys.get(id);
    if (!t) return;
    t.held = false;
    t.stored = true;
    const start = t.group.position.clone();
    const startY = t.mesh.position.y;
    this.tweens.add(
      0.38,
      Easing.cubicOut,
      (p) => {
        t.group.position.x = THREE.MathUtils.lerp(start.x, basketWorldPos.x, p);
        t.group.position.z = THREE.MathUtils.lerp(start.z, basketWorldPos.z, p);
        const arc = Math.sin(Math.PI * p) * 0.22;
        t.mesh.position.y = THREE.MathUtils.lerp(startY, TOY_Y_REST, p) + arc;
        this.shadows.update(t.shadowIndex, t.group.position.x, t.group.position.z, 1 - p * 0.6);
      },
      () => {
        // One soft bounce then squash into the basket and disappear.
        this.tweens.add(0.22, Easing.backOut, (p2) => {
          const s = THREE.MathUtils.lerp(1, 0.05, p2);
          t.mesh.scale.setScalar(Math.max(s, 0.05));
          t.mesh.position.y = TOY_Y_REST * (1 - p2);
        }, () => {
          t.group.visible = false;
          this.shadows.hide(t.shadowIndex);
          onLanded();
        });
      },
    );
  }

  /** Wrong-basket (or otherwise rejected) drop: floats gently back to its floor start position. No penalty. */
  playRejectReturn(id: string): void {
    const t = this.toys.get(id);
    if (!t) return;
    t.held = false;
    const start = t.group.position.clone();
    const restWorld = vec2ToWorld(t.def.start);
    this.tweens.add(
      0.55,
      Easing.cubicInOut,
      (p) => {
        t.group.position.x = THREE.MathUtils.lerp(start.x, restWorld.x, p);
        t.group.position.z = THREE.MathUtils.lerp(start.z, restWorld.z, p);
        t.mesh.position.y = TOY_Y_REST + Math.sin(Math.PI * p) * 0.12;
        t.mesh.scale.setScalar(1 - Math.sin(Math.PI * p) * 0.06);
        this.shadows.update(t.shadowIndex, t.group.position.x, t.group.position.z, 1);
      },
      () => {
        t.mesh.position.y = TOY_Y_REST;
        t.mesh.scale.setScalar(1);
      },
    );
  }

  /** Wiggle hint for the idle-target escalation. */
  playWiggle(id: string): void {
    const t = this.toys.get(id);
    if (!t) return;
    const base = t.mesh.rotation.y;
    this.tweens.add(0.5, Easing.elasticOut, (p) => {
      t.mesh.rotation.y = base + Math.sin(p * Math.PI * 3) * 0.25 * (1 - p);
    });
  }

  /** Pops all toys back onto the floor for WAKE_RESTORE (reverse of storing). */
  popAllOut(seedConfig: SeedConfig, staggerSeconds: number): void {
    let i = 0;
    for (const toy of seedConfig.toys) {
      const t = this.toys.get(toy.id);
      if (!t) continue;
      const delay = i * staggerSeconds;
      i++;
      const restWorld = vec2ToWorld(toy.start);
      t.group.position.set(restWorld.x, 0, restWorld.z);
      t.group.visible = true;
      t.stored = false;
      t.mesh.scale.setScalar(0.05);
      t.mesh.position.y = TOY_Y_REST;
      window.setTimeout(() => {
        this.tweens.add(0.4, Easing.backOut, (p) => {
          t.mesh.scale.setScalar(THREE.MathUtils.lerp(0.05, 1, p));
          t.mesh.position.y = TOY_Y_REST + Math.sin(Math.PI * p) * 0.15;
        });
        this.shadows.update(t.shadowIndex, restWorld.x, restWorld.z, 1);
      }, delay * 1000);
    }
  }
}
