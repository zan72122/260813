import * as THREE from 'three';
import type { SeedConfig, ToyDef, ToySymbol } from '../game/types.ts';
import { BASKET_COLORS } from './baskets.ts';
import { vec2ToWorld } from './constants.ts';
import { plushBlockGeometry, woodBlockGeometry } from './geometry.ts';
import { applySymbolUv, createFabricWeaveTexture, createSymbolAtlas, createWoodGrainTexture } from './materials/textures.ts';
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

// B7 fix (fix-round-1): these procedural textures never vary by seed (fixed
// colors/params), so they're created ONCE at module load and shared by every
// ToySystem instance for the app's lifetime, instead of being regenerated
// (and leaked — nothing ever disposed the old ones) on every reshuffle.
const TOY_WOOD_TEX = createWoodGrainTexture(PALETTE.woodLight, 256, 40);
const TOY_FABRIC_TEX = createFabricWeaveTexture(0xffffff, 256, 41);
const TOY_SYMBOL_ATLAS = createSymbolAtlas(512);
const TOY_DECAL_MATERIAL = new THREE.MeshStandardMaterial({
  map: TOY_SYMBOL_ATLAS.texture,
  transparent: true,
  roughness: 0.6,
  polygonOffset: true,
  polygonOffsetFactor: -4,
  polygonOffsetUnits: -4,
});

export class ToySystem {
  readonly group = new THREE.Group();
  readonly toys = new Map<string, ToyVisual>();
  readonly proxyToId = new Map<THREE.Object3D, string>();
  private tweens: TweenManager;
  private shadows: BlobShadowManager;

  constructor(seedConfig: SeedConfig, tweens: TweenManager, shadows: BlobShadowManager) {
    this.tweens = tweens;
    this.shadows = shadows;

    const woodTex = TOY_WOOD_TEX;
    const fabricTex = TOY_FABRIC_TEX;
    const atlas = TOY_SYMBOL_ATLAS;

    // B3 fix: a toy's accent color deterministically matches the color of the
    // basket it belongs in (same symbol), as a redundant color cue on top of
    // the symbol decal below — previously the accent was picked purely by
    // material+index, which could coincidentally match a DIFFERENT basket's
    // color and actively mislead the picture-matching mechanic.
    const basketColorBySymbol = new Map<ToySymbol, number>();
    seedConfig.baskets.forEach((basket, i) => {
      basketColorBySymbol.set(basket.symbol, BASKET_COLORS[i % BASKET_COLORS.length]!);
    });

    for (const toy of seedConfig.toys) {
      const color = basketColorBySymbol.get(toy.symbol) ?? BASKET_COLORS[0]!;
      const visual = this.buildToy(toy, color, woodTex, fabricTex, atlas);
      this.toys.set(toy.id, visual);
      this.proxyToId.set(visual.proxy, toy.id);
      this.group.add(visual.group);
    }
  }

  private buildToy(
    toy: ToyDef,
    color: number,
    woodTex: THREE.Texture,
    fabricTex: THREE.Texture,
    atlas: ReturnType<typeof createSymbolAtlas>,
  ): ToyVisual {
    let geo: THREE.BufferGeometry;
    let mat: THREE.MeshStandardMaterial;
    let topY: number;
    let decalSize: number;

    if (toy.material === 'wood') {
      const size = 0.15;
      geo = woodBlockGeometry(size);
      mat = new THREE.MeshStandardMaterial({ color, map: woodTex, roughness: 0.55, metalness: 0.04 });
      topY = size / 2;
      decalSize = size * 0.62;
    } else if (toy.material === 'fabric') {
      const size = 0.17;
      geo = plushBlockGeometry(size);
      mat = new THREE.MeshStandardMaterial({ color, map: fabricTex, roughness: 0.92, metalness: 0 });
      topY = (size * 0.85) / 2;
      decalSize = size * 0.55;
    } else {
      const radius = 0.085;
      geo = new THREE.SphereGeometry(radius, 20, 14);
      mat = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.06 });
      topY = radius;
      decalSize = radius * 1.15;
    }

    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = TOY_Y_REST;
    mesh.rotation.y = toy.rotationY;
    mesh.userData['toyId'] = toy.id;

    // B3 fix: a small, high-contrast symbol decal on top of every toy so the
    // picture-matching mechanic (toy symbol <-> basket symbol) is legible —
    // previously toy.def.symbol was never rendered anywhere on the toy itself.
    const decalGeo = new THREE.PlaneGeometry(decalSize, decalSize);
    applySymbolUv(decalGeo, atlas.uvRect(toy.symbol));
    decalGeo.rotateX(-Math.PI / 2);
    // Shared module-level material (see TOY_DECAL_MATERIAL) — only the
    // geometry's UVs vary per toy, so the material itself is never disposed
    // per-toy (ToySystem.dispose() below skips it deliberately).
    const decal = new THREE.Mesh(decalGeo, TOY_DECAL_MATERIAL);
    decal.position.y = topY + 0.004;
    mesh.add(decal);

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

  /**
   * Sloppy drop landed in dead space (not near any basket): gently settle
   * exactly where dropped, stays draggable. Per INTERACTION_SPEC ("drop in
   * dead space: toy plops where dropped") this must NEVER also be racing a
   * playRejectReturn tween for the same toy — both are registered under the
   * same per-toy key so whichever is added last wins outright (B4 fix).
   */
  settleAtCurrentPosition(id: string): void {
    const t = this.toys.get(id);
    if (!t) return;
    t.held = false;
    const startY = t.mesh.position.y;
    this.tweens.add(
      0.25,
      Easing.cubicOut,
      (p) => {
        t.mesh.position.y = THREE.MathUtils.lerp(startY, TOY_Y_REST, p);
        t.mesh.scale.setScalar(THREE.MathUtils.lerp(1.08, 1, p));
      },
      undefined,
      `toy:${id}`,
    );
  }

  /** Magnet-snap success: arcs into the basket, one soft bounce, then shrinks/hides into the basket. */
  playCaptureBounce(id: string, basketWorldPos: THREE.Vector3, onLanded: () => void): void {
    const t = this.toys.get(id);
    if (!t) return;
    t.held = false;
    t.stored = true;
    const start = t.group.position.clone();
    const startY = t.mesh.position.y;
    const key = `toy:${id}`;
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
        }, key);
      },
      key,
    );
  }

  /**
   * Wrong-basket drop (B4 fix): floats a short hop to a nearby floor spot
   * just outside the wrong basket it was dropped near — NOT all the way
   * back to its original spawn point, and NOT for dead-space misses (those
   * go through settleAtCurrentPosition only; see fsm.attemptStoreToy). No
   * penalty either way.
   */
  playRejectReturn(id: string, wrongBasketWorldPos: THREE.Vector3): void {
    const t = this.toys.get(id);
    if (!t) return;
    t.held = false;
    const start = t.group.position.clone();
    const away = new THREE.Vector2(start.x - wrongBasketWorldPos.x, start.z - wrongBasketWorldPos.z);
    if (away.lengthSq() < 0.0001) away.set(0, 1);
    away.normalize().multiplyScalar(0.22);
    const target = new THREE.Vector3(wrongBasketWorldPos.x + away.x, 0, wrongBasketWorldPos.z + away.y);
    this.tweens.add(
      0.32,
      Easing.cubicOut,
      (p) => {
        t.group.position.x = THREE.MathUtils.lerp(start.x, target.x, p);
        t.group.position.z = THREE.MathUtils.lerp(start.z, target.z, p);
        t.mesh.position.y = TOY_Y_REST + Math.sin(Math.PI * p) * 0.1;
        t.mesh.scale.setScalar(1 - Math.sin(Math.PI * p) * 0.05);
        this.shadows.update(t.shadowIndex, t.group.position.x, t.group.position.z, 1);
      },
      () => {
        t.mesh.position.y = TOY_Y_REST;
        t.mesh.scale.setScalar(1);
      },
      `toy:${id}`,
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
        this.tweens.add(
          0.4,
          Easing.backOut,
          (p) => {
            t.mesh.scale.setScalar(THREE.MathUtils.lerp(0.05, 1, p));
            t.mesh.position.y = TOY_Y_REST + Math.sin(Math.PI * p) * 0.15;
          },
          undefined,
          `toy:${toy.id}`,
        );
        this.shadows.update(t.shadowIndex, restWorld.x, restWorld.z, 1);
      }, delay * 1000);
    }
  }

  /**
   * B6/B7 fix (fix-round-1): releases this system's blob-shadow slots back to
   * the shared pool and disposes every per-toy geometry/material (mesh,
   * decal, proxy) — but deliberately leaves the module-level shared textures
   * and TOY_DECAL_MATERIAL alone, since those outlive any one seed. Call this
   * on the OLD ToySystem before building a new one for a reshuffled seed.
   */
  dispose(): void {
    for (const t of this.toys.values()) {
      this.shadows.free(t.shadowIndex);
      t.mesh.geometry.dispose();
      (t.mesh.material as THREE.Material).dispose();
      for (const child of t.mesh.children) {
        const decal = child as THREE.Mesh;
        decal.geometry?.dispose();
        // decal.material is the shared TOY_DECAL_MATERIAL — not disposed here.
      }
      t.proxy.geometry.dispose();
      (t.proxy.material as THREE.Material).dispose();
    }
    this.toys.clear();
    this.proxyToId.clear();
  }
}
