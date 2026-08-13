import * as THREE from 'three';
import type { BasketDef, SeedConfig } from '../game/types.ts';
import { vec2ToWorld } from './constants.ts';
import { createFabricWeaveTexture } from './materials/textures.ts';
import { applySymbolUv, createSymbolAtlas } from './materials/textures.ts';
import { PALETTE } from './palette.ts';
import { Easing, TweenManager } from './tween.ts';

export interface BasketVisual {
  id: string;
  def: BasketDef;
  group: THREE.Group;
  body: THREE.Mesh;
  glowMaterial: THREE.MeshStandardMaterial;
  proxy: THREE.Mesh;
  baseRotationZ: number;
}

export const BASKET_COLORS = [PALETTE.coral, PALETTE.mint, PALETTE.sky];

// M10 fix (fix-round-1): reused scratch object for setAttention below, which
// runs on every pointermove while dragging a toy (x3 baskets checked per
// move) — was allocating a fresh Color + Vector2 on every single call.
const SCRATCH_DIR = new THREE.Vector2();

// B7 fix (fix-round-1): shared, module-level (created once, never
// seed-dependent) — same rationale as toys.ts's TOY_* constants.
const BASKET_WEAVE_TEX = createFabricWeaveTexture(PALETTE.woodDark, 256, 77);
const BASKET_SYMBOL_ATLAS = createSymbolAtlas(512);
const BASKET_SYMBOL_MATERIAL = new THREE.MeshStandardMaterial({ map: BASKET_SYMBOL_ATLAS.texture, transparent: true, roughness: 0.6 });

export class BasketSystem {
  readonly group = new THREE.Group();
  readonly baskets = new Map<string, BasketVisual>();
  readonly proxyToId = new Map<THREE.Object3D, string>();
  private tweens: TweenManager;

  constructor(seedConfig: SeedConfig, tweens: TweenManager) {
    this.tweens = tweens;
    const atlas = BASKET_SYMBOL_ATLAS;
    const weaveTex = BASKET_WEAVE_TEX;

    seedConfig.baskets.forEach((basket, i) => {
      const visual = this.buildBasket(basket, i, atlas, weaveTex);
      this.baskets.set(basket.id, visual);
      this.proxyToId.set(visual.proxy, basket.id);
      this.group.add(visual.group);
    });
  }

  private buildBasket(
    def: BasketDef,
    index: number,
    atlas: ReturnType<typeof createSymbolAtlas>,
    weaveTex: THREE.Texture,
  ): BasketVisual {
    const color = BASKET_COLORS[index % BASKET_COLORS.length]!;
    const bodyMat = new THREE.MeshStandardMaterial({ color, map: weaveTex, roughness: 0.85, metalness: 0 });
    const bodyGeo = new THREE.CylinderGeometry(def.radius * 0.62, def.radius * 0.5, 0.16, 16, 1, true);
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.08;

    const rimGeo = new THREE.TorusGeometry(def.radius * 0.62, 0.014, 8, 20);
    const rim = new THREE.Mesh(rimGeo, bodyMat);
    rim.rotation.x = Math.PI / 2;
    rim.position.y = 0.16;

    const bottomGeo = new THREE.CircleGeometry(def.radius * 0.5, 16);
    const bottom = new THREE.Mesh(bottomGeo, bodyMat);
    bottom.rotation.x = -Math.PI / 2;
    bottom.position.y = 0.001;

    // Front-facing badge (reads well at eye-level / 3/4 angles). Material is
    // the shared BASKET_SYMBOL_MATERIAL — never disposed per-basket.
    const symbolPlaneGeo = new THREE.PlaneGeometry(def.radius * 0.62, def.radius * 0.62);
    applySymbolUv(symbolPlaneGeo, atlas.uvRect(def.symbol));
    const symbolPlane = new THREE.Mesh(symbolPlaneGeo, BASKET_SYMBOL_MATERIAL);
    symbolPlane.position.set(0, 0.09, def.radius * 0.63);

    // B2 fix: a large, high-contrast symbol facing straight UP on the basket's interior
    // floor. This is the one that actually registers from the top-down cleanup camera —
    // the front badge above is viewed edge-on from that angle and doesn't read at all.
    const symbolUpGeo = new THREE.PlaneGeometry(def.radius * 0.92, def.radius * 0.92);
    applySymbolUv(symbolUpGeo, atlas.uvRect(def.symbol));
    symbolUpGeo.rotateX(-Math.PI / 2);
    const symbolUp = new THREE.Mesh(symbolUpGeo, BASKET_SYMBOL_MATERIAL);
    symbolUp.position.y = 0.022;

    const proxyGeo = new THREE.SphereGeometry(def.radius * 1.6, 8, 6);
    const proxy = new THREE.Mesh(proxyGeo, new THREE.MeshBasicMaterial());
    proxy.visible = false;
    proxy.position.y = 0.1;

    const group = new THREE.Group();
    const worldPos = vec2ToWorld(def.position);
    group.position.copy(worldPos);
    group.add(body, rim, bottom, symbolPlane, symbolUp, proxy);
    body.userData['basketId'] = def.id;
    proxy.userData['basketId'] = def.id;

    return { id: def.id, def, group, body, glowMaterial: bodyMat, proxy, baseRotationZ: 0 };
  }

  worldPositionOf(id: string): THREE.Vector3 {
    return this.baskets.get(id)!.group.position.clone();
  }

  /** Soft glow + lean toward the dragged toy, strength in [0,1]. */
  setAttention(id: string, strength: number, towardX: number, towardZ: number): void {
    const b = this.baskets.get(id);
    if (!b) return;
    b.glowMaterial.emissive.setScalar(strength * 0.22);
    SCRATCH_DIR.set(towardX - b.group.position.x, towardZ - b.group.position.z);
    if (SCRATCH_DIR.lengthSq() > 0.0001) SCRATCH_DIR.normalize();
    const leanAmount = strength * 0.09;
    b.group.rotation.z = -SCRATCH_DIR.x * leanAmount;
    b.group.rotation.x = SCRATCH_DIR.y * leanAmount;
  }

  clearAllAttention(): void {
    for (const b of this.baskets.values()) {
      b.glowMaterial.emissive.setScalar(0);
      b.group.rotation.set(0, 0, 0);
    }
  }

  /** Happy wiggle when a toy successfully lands. */
  playWiggle(id: string): void {
    const b = this.baskets.get(id);
    if (!b) return;
    const baseScale = b.group.scale.clone();
    this.tweens.add(0.45, Easing.elasticOut, (p) => {
      const s = 1 + Math.sin(p * Math.PI * 2.4) * 0.1 * (1 - p);
      b.group.scale.set(baseScale.x * s, baseScale.y * (1 + (1 - s) * 0.3), baseScale.z * s);
    }, () => {
      b.group.scale.copy(baseScale);
    });
  }

  /**
   * B7 fix (fix-round-1): disposes every per-basket geometry/material —
   * leaving the shared module-level texture/atlas/BASKET_SYMBOL_MATERIAL
   * untouched, since those outlive any one seed. Call this on the OLD
   * BasketSystem before building a new one for a reshuffled seed.
   */
  dispose(): void {
    for (const b of this.baskets.values()) {
      b.group.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!('geometry' in mesh)) return;
        mesh.geometry?.dispose();
        const mat = mesh.material as THREE.Material | undefined;
        if (mat && mat !== BASKET_SYMBOL_MATERIAL) mat.dispose();
      });
    }
    this.baskets.clear();
    this.proxyToId.clear();
  }
}
