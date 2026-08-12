import { CanvasTexture, Material, MeshPhysicalMaterial, MeshStandardMaterial, RepeatWrapping, SRGBColorSpace } from 'three';
import type { MaterialLibrary, QualityTier, SceneId } from '../core';
import {
  darken,
  getCtx2d,
  lighten,
  makeCanvas,
  paintBaseGradient,
  paintBrushStrokes,
  paintClothWeave,
  paintCurtainFolds,
  paintEdgeUnevenness,
  paintForestBackdrop,
  paintForestWingCutout,
  paintGoldLeaf,
  paintMarbleVeins,
  paintMetalBrushed,
  paintMossyRock,
  paintPlaster,
  paintRopeTwist,
  paintRusticBackdrop,
  paintRusticWing,
  paintSalonBackdrop,
  paintSalonWing,
  paintSoftAccentProp,
  paintVelvet,
  paintWoodGrain,
  rngFor,
  type GrainOrientation
} from './textureGen';

/** QualityTier -> square texture resolution (px). Hard cap 2048 per MASTER_SPEC; we never exceed 1024. */
const TIER_SIZE: Record<QualityTier, number> = { low: 512, medium: 768, high: 1024 };
/** QualityTier -> texture.anisotropy. low disables aniso filtering entirely for mobile GPU budget. */
const TIER_ANISO: Record<QualityTier, number> = { low: 1, medium: 4, high: 8 };

type WoodKind = 'beam' | 'drum' | 'floor' | 'furniture' | 'pulley';
type AuditoriumKind = 'wall' | 'seat' | 'marble' | 'curtain';

/**
 * Per-scene figurative palette. Fields are reused by different painters per
 * scene (see paintedFlat below): salon uses base=panel/light=wall,
 * forest uses base=trunk/light=canopyLight/extra=canopyDark, rustic uses
 * base=beam/light=plaster. accent is always the scene's warm highlight
 * (gold / dappled light / firelight). Kept bright (VISUAL_DIRECTION calls
 * for legible painted flats, not murky abstraction) — dark tones are
 * reserved for the border frame and small accents only.
 */
const SCENE_PALETTES: Record<SceneId, { base: string; light: string; dark: string; accent: string; extra: string }> = {
  // salon: blue-grey panels on a warm-white wall, gold trim, dusty rose silk accent
  salon: { base: '#7d8fab', light: '#b6c1d6', dark: '#3f4a63', accent: '#c9a54e', extra: '#d8a8a0' },
  // forest: trunk browns, layered bright greens, honeyed dappled light
  forest: { base: '#6b5138', light: '#a9cf82', dark: '#2e2115', accent: '#ffe9b8', extra: '#4f7038' },
  // rustic: warm plaster wall, beam wood, hearth-fire accent, terracotta trim
  rustic: { base: '#8a6a44', light: '#efe3c9', dark: '#4a341f', accent: '#e8934a', extra: '#c9835a' }
};

const WOOD_TONES: Record<WoodKind, { base: string; dark: string; orientation: GrainOrientation }> = {
  beam: { base: '#c89b5a', dark: '#5a3d26', orientation: 'horizontal' },
  drum: { base: '#c2915a', dark: '#5a3d26', orientation: 'horizontal' },
  floor: { base: '#b98a52', dark: '#4a3018', orientation: 'horizontal' },
  furniture: { base: '#a97a48', dark: '#4a2f18', orientation: 'vertical' },
  pulley: { base: '#c89b5a', dark: '#5a3d26', orientation: 'vertical' }
};

const IRON_COLOR = '#3a3733';
const GOLD_COLOR = '#c9a54e';
const AUDITORIUM_COLORS: Record<AuditoriumKind, string> = {
  wall: '#f3ede1',
  seat: '#2e4a7d',
  marble: '#b7aec2',
  curtain: '#2e4a7d'
};

/** rope UV-V (length) repeats fully once per this many meters of rope travel. */
const ROPE_REPEATS_PER_METER = 2.2;

const WING_RE = /^wing[0-2]$/;
const FOREGROUND_RE = /^foreground([0-2])$/;

/** Foreground prop tint by index, always distinct — never a uniform scene-wide color. */
const FOREGROUND_ROCK_STONE = '#7d8a7a';
const FOREGROUND_ROCK_MOSS = '#6b8a52';
const FOREGROUND_LOG_BASE = '#a97a48';
const FOREGROUND_LOG_DARK = '#4a2f18';

interface Entry {
  material: Material;
  texture: CanvasTexture;
  regenerate: (size: number) => HTMLCanvasElement;
  repeat: boolean;
}

/**
 * Owner B (rendering-audio) real implementation. All materials/textures are
 * generated procedurally via offscreen <canvas> 2D painting per
 * docs/VISUAL_DIRECTION.md (no external image/texture assets — see
 * ASSET_MANIFEST.md). Materials are cached by key; applyQuality(tier)
 * regenerates every cached texture at the tier's resolution/anisotropy in
 * place (same Material/Texture identity, so consumers holding a Material
 * reference see the upgrade automatically). dispose() frees all GPU
 * resources this library created.
 *
 * (Wave 3 integration renamed this class from its placeholder-era name
 * `NullMaterialLibrary` to `ProceduralMaterialLibrary`, now that App.ts wires
 * it in as the real implementation; no behavior changed.)
 */
export class ProceduralMaterialLibrary implements MaterialLibrary {
  private tier: QualityTier = 'high';
  private size = TIER_SIZE.high;
  private aniso = TIER_ANISO.high;

  private readonly entries = new Map<string, Entry>();

  private buildTexture(canvas: HTMLCanvasElement, repeat: boolean): CanvasTexture {
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = this.aniso;
    texture.wrapS = repeat ? RepeatWrapping : texture.wrapS;
    texture.wrapT = repeat ? RepeatWrapping : texture.wrapT;
    texture.needsUpdate = true;
    return texture;
  }

  private getOrCreate(
    key: string,
    regenerate: (size: number) => HTMLCanvasElement,
    makeMaterial: (texture: CanvasTexture) => Material,
    repeat = false
  ): Material {
    const existing = this.entries.get(key);
    if (existing) return existing.material;
    const canvas = regenerate(this.size);
    const texture = this.buildTexture(canvas, repeat);
    const material = makeMaterial(texture);
    this.entries.set(key, { material, texture, regenerate, repeat });
    return material;
  }

  paintedFlat(scene: SceneId, element: string): Material {
    const key = `flat:${scene}:${element}`;
    // Forest wings are painted as a trunk+foliage cutout on a transparent canvas
    // (VISUAL_DIRECTION "theatrical cut-flat look") — the material discards
    // transparent texels via alphaTest instead of blending.
    const isForestWingCutout = scene === 'forest' && WING_RE.test(element);
    return this.getOrCreate(
      key,
      (size) => {
        const rng = rngFor(key);
        const canvas = makeCanvas(size);
        const ctx = getCtx2d(canvas);
        const p = SCENE_PALETTES[scene];
        const foregroundMatch = FOREGROUND_RE.exec(element);
        if (element === 'backdrop') {
          if (scene === 'salon') paintSalonBackdrop(ctx, size, rng, p.light, p.base, p.accent);
          else if (scene === 'forest') paintForestBackdrop(ctx, size, rng, p.base, p.light, p.extra, p.accent);
          else paintRusticBackdrop(ctx, size, rng, p.light, p.base, p.accent);
        } else if (WING_RE.test(element)) {
          if (scene === 'salon') paintSalonWing(ctx, size, rng, p.light, p.base, p.accent);
          else if (scene === 'forest') paintForestWingCutout(ctx, size, rng, p.base, p.light, p.extra);
          else paintRusticWing(ctx, size, rng, p.light, p.base);
        } else if (element === 'border') {
          paintBaseGradient(ctx, size, lighten(p.dark, 0.1), darken(p.dark, 0.14), 90);
          paintBrushStrokes(ctx, size, rng, [p.accent, p.dark], 10);
          paintClothWeave(ctx, size, rng, 'rgba(20,16,10,0.05)');
          paintEdgeUnevenness(ctx, size, rng, 'rgba(0,0,0,0.4)');
        } else if (foregroundMatch) {
          // index-aware so a scene's foreground props read as distinct
          // objects (rock / log / soft accent), never one uniform tint.
          const idx = Number(foregroundMatch[1]);
          if (idx === 0) paintMossyRock(ctx, size, rng, FOREGROUND_ROCK_STONE, FOREGROUND_ROCK_MOSS);
          else if (idx === 1) paintWoodGrain(ctx, size, rng, FOREGROUND_LOG_BASE, FOREGROUND_LOG_DARK, 'vertical');
          else paintSoftAccentProp(ctx, size, rng, p.extra);
        } else {
          // unknown element name: legible neutral fallback, never abstract noise-only
          paintBaseGradient(ctx, size, lighten(p.light, 0.06), p.light, 90);
          paintBrushStrokes(ctx, size, rng, [p.base, p.accent], 14);
          paintClothWeave(ctx, size, rng);
          paintEdgeUnevenness(ctx, size, rng, 'rgba(20,16,10,0.2)');
        }
        return canvas;
      },
      (texture) => {
        const material = new MeshStandardMaterial({ map: texture, roughness: 0.85, metalness: 0.02 });
        if (isForestWingCutout) material.alphaTest = 0.5;
        return material;
      }
    );
  }

  wood(kind: WoodKind): Material {
    const key = `wood:${kind}`;
    const tone = WOOD_TONES[kind];
    return this.getOrCreate(
      key,
      (size) => {
        const rng = rngFor(key);
        const canvas = makeCanvas(size);
        const ctx = getCtx2d(canvas);
        paintWoodGrain(ctx, size, rng, tone.base, tone.dark, tone.orientation);
        return canvas;
      },
      (texture) => new MeshStandardMaterial({ map: texture, roughness: 0.78, metalness: 0.04 }),
      true
    );
  }

  rope(): Material {
    const key = 'rope';
    const material = this.getOrCreate(
      key,
      (size) => {
        const rng = rngFor(key);
        const canvas = makeCanvas(size);
        const ctx = getCtx2d(canvas);
        paintRopeTwist(ctx, size, rng);
        return canvas;
      },
      (texture) => {
        texture.repeat.set(1, 6);
        return new MeshStandardMaterial({ map: texture, roughness: 0.96, metalness: 0 });
      },
      true
    );
    return material;
  }

  setRopeScroll(offset: number): void {
    const entry = this.entries.get('rope');
    if (!entry) return;
    const v = offset * ROPE_REPEATS_PER_METER;
    entry.texture.offset.y = v - Math.floor(v);
  }

  metal(): Material {
    const key = 'metal';
    return this.getOrCreate(
      key,
      (size) => {
        const rng = rngFor(key);
        const canvas = makeCanvas(size);
        const ctx = getCtx2d(canvas);
        paintMetalBrushed(ctx, size, rng, IRON_COLOR);
        return canvas;
      },
      (texture) => new MeshStandardMaterial({ map: texture, color: 0x3a3733, roughness: 0.5, metalness: 0.82 })
    );
  }

  goldTrim(): Material {
    const key = 'goldTrim';
    return this.getOrCreate(
      key,
      (size) => {
        const rng = rngFor(key);
        const canvas = makeCanvas(size);
        const ctx = getCtx2d(canvas);
        paintGoldLeaf(ctx, size, rng, GOLD_COLOR);
        return canvas;
      },
      (texture) =>
        // "paper-gilt" look: modest metalness, higher specular reflection than a
        // true metal — reads as gold leaf on paper, not a jewel/polished ingot
        // (VISUAL_DIRECTION forbids gem-particle glitz).
        new MeshPhysicalMaterial({
          map: texture,
          color: 0xc9a54e,
          metalness: 0.4,
          roughness: 0.34,
          specularIntensity: 1,
          specularColor: 0xfff1c9,
          clearcoat: 0.2,
          clearcoatRoughness: 0.3,
          emissive: 0x2a1c08,
          emissiveIntensity: 0.12
        })
    );
  }

  auditorium(kind: AuditoriumKind): Material {
    const key = `auditorium:${kind}`;
    return this.getOrCreate(
      key,
      (size) => {
        const rng = rngFor(key);
        const canvas = makeCanvas(size);
        const ctx = getCtx2d(canvas);
        const base = AUDITORIUM_COLORS[kind];
        if (kind === 'wall') paintPlaster(ctx, size, rng, base);
        // deep blue velvet: darker base with a lighter sheen band at the top, not washed out
        else if (kind === 'seat') paintVelvet(ctx, size, rng, lighten(base, 0.15), darken(base, 0.22));
        else if (kind === 'marble') paintMarbleVeins(ctx, size, rng, base, darken(base, 0.35));
        else paintCurtainFolds(ctx, size, rng, base);
        return canvas;
      },
      (texture) => {
        if (kind === 'marble') return new MeshStandardMaterial({ map: texture, roughness: 0.35, metalness: 0.05 });
        if (kind === 'seat') return new MeshStandardMaterial({ map: texture, roughness: 0.88, metalness: 0 });
        return new MeshStandardMaterial({ map: texture, roughness: 0.85, metalness: 0 });
      },
      kind === 'wall' || kind === 'curtain' || kind === 'marble'
    );
  }

  applyQuality(tier: QualityTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.size = TIER_SIZE[tier];
    this.aniso = TIER_ANISO[tier];
    for (const entry of this.entries.values()) {
      const oldTexture = entry.texture;
      const canvas = entry.regenerate(this.size);
      const next = this.buildTexture(canvas, entry.repeat);
      // preserve rope scroll UV state, and default repeat for tiling entries
      next.offset.copy(oldTexture.offset);
      next.repeat.copy(oldTexture.repeat);
      entry.texture = next;
      (entry.material as MeshStandardMaterial).map = next;
      entry.material.needsUpdate = true;
      oldTexture.dispose();
    }
  }

  dispose(): void {
    for (const entry of this.entries.values()) {
      entry.texture.dispose();
      entry.material.dispose();
    }
    this.entries.clear();
  }
}
