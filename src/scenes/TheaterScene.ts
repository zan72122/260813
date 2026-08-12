/**
 * Composite root SceneModule: owns the auditorium shell, the understage
 * mechanism room, the three StageWorld rigs (salon/forest/rustic) and the
 * CameraDirector, wiring them all to the single StageTransformProgress per
 * frame. App.ts only holds one `activeScene: SceneModule` field (Wave 1
 * wiring, frozen) and imports it by the name `PlaceholderScene`
 * (src/scenes/index.ts re-exports this class under that name) -- so this is
 * "replacing the placeholder wholesale" per its original doc comment, not a
 * new integration point.
 *
 * Every rig element's pose is a pure function of `deriveTransformState(p)`
 * (src/core/TransformTimeline.ts); this class only decides *which* of the
 * three StageWorld instances currently plays the `old`/`new` role for the
 * active TransformPair (see StageWorld's doc comment for why re-labelling a
 * world's role never causes a visual jump).
 */
import { BoxGeometry, Color, Mesh, PointLight, type BufferGeometry, type Material } from 'three';
import {
  deriveTransformState,
  type GamePhase,
  type GameStateSnapshot,
  type QualityTier,
  type SceneContext,
  type SceneId,
  type SceneModule
} from '../core';
import { CameraDirector } from '../camera/CameraDirector';
import { titlePose } from '../camera/beats';
import { AuditoriumScene } from './rig/AuditoriumScene';
import { HintHand } from './rig/HintHand';
import { PROSCENIUM_Z, STAGE_FLOOR_FAR_Z, STAGE_FLOOR_NEAR_Z, STAGE_FLOOR_THICKNESS, STAGE_FLOOR_WIDTH } from './rig/layout';
import { StageWorld } from './rig/StageWorld';
import { UnderstageScene } from './rig/UnderstageScene';

const SCENE_IDS: readonly SceneId[] = ['salon', 'forest', 'rustic'];

/** Phases where the understage cutaway is the active framing: dust reads, lock is shown unlocked. */
const UNDERSTAGE_VISIBLE_PHASES = new Set<GamePhase>(['descend', 'unlock', 'pull1', 'cue2', 'pull2', 'freePlay']);
/** Phases from the first successful pull onward: the rope lock stays open. */
const UNLOCKED_PHASES = new Set<GamePhase>(['pull1', 'reveal1', 'cue2', 'pull2', 'reveal2', 'finale', 'choice', 'freePlay']);
const FOOTLIGHT_PHASES = new Set<GamePhase>(['finale', 'choice', 'freePlay']);

const ROOM_LIGHT_COLOR = new Color(0xffd9a0);
const DAYLIGHT_COLOR = new Color(0xdcefc0);

export class TheaterScene implements SceneModule {
  readonly id: SceneId | 'auditorium' | 'understage' = 'auditorium';

  private ctx: SceneContext | null = null;
  private cameraDirector: CameraDirector | null = null;
  private auditorium: AuditoriumScene | null = null;
  private understage: UnderstageScene | null = null;
  private hintHand: HintHand | null = null;
  private readonly worlds = new Map<SceneId, StageWorld>();
  private blendLight: PointLight | null = null;
  private frontFillLight: PointLight | null = null;
  private stageFloor: Mesh | null = null;
  private readonly ownedGeometries: BufferGeometry[] = [];
  private readonly ownedMaterials: Material[] = [];
  private lastMuted = false;
  private footlightsLevel = 0;
  private readonly unsubscribers: Array<() => void> = [];

  init(ctx: SceneContext): void {
    this.ctx = ctx;
    const { scene } = ctx.three;

    this.auditorium = new AuditoriumScene(ctx.services.materials);
    scene.add(this.auditorium.group);

    this.understage = new UnderstageScene(ctx.services.materials);
    scene.add(this.understage.group);

    this.hintHand = new HintHand(ctx.services.materials);
    this.hintHand.attach(ctx.bus);
    scene.add(this.hintHand.group);

    for (const sceneId of SCENE_IDS) {
      const world = new StageWorld(sceneId, ctx.services.materials);
      world.setFullyHidden();
      scene.add(world.group);
      this.worlds.set(sceneId, world);
    }

    // Solid stage floor: occludes the understage rig from every audience-side pose (establish/
    // reveal/finale/choice). Hidden only during descend/mechanism phases, when the cutaway is
    // meant to be open (see UNDERSTAGE_VISIBLE_PHASES in update()) -- never both open and shut
    // by accident, since both this and the understage group's visibility come from the same set.
    const floorGeometry = new BoxGeometry(STAGE_FLOOR_WIDTH, STAGE_FLOOR_THICKNESS, STAGE_FLOOR_NEAR_Z - STAGE_FLOOR_FAR_Z);
    this.ownedGeometries.push(floorGeometry);
    const floorMaterial = ctx.services.materials.wood('floor');
    this.ownedMaterials.push(floorMaterial);
    this.stageFloor = new Mesh(floorGeometry, floorMaterial);
    this.stageFloor.position.set(0, -STAGE_FLOOR_THICKNESS / 2, (STAGE_FLOOR_NEAR_Z + STAGE_FLOOR_FAR_Z) / 2);
    scene.add(this.stageFloor);

    // Warm overhead room light (blends toward daylight as the forest transform completes) plus a
    // low always-on footlight-height fill, per docs/VISUAL_DIRECTION.md "客席側: 暖かい環境光＋
    // footlights...昼の舞台は明るく静か" -- the before-state (salon, establish) must read bright.
    this.blendLight = new PointLight(ROOM_LIGHT_COLOR, 1.1, 14);
    this.blendLight.position.set(0, 2.6, 0.5);
    scene.add(this.blendLight);

    this.frontFillLight = new PointLight(0xffe6bf, 0.8, 10);
    this.frontFillLight.position.set(0, 0.6, PROSCENIUM_Z - 0.2);
    scene.add(this.frontFillLight);

    // Own CameraDirector instance, seeded with the same camera App created. The real
    // per-frame beat driving happens through this.update() below, which -- unlike App's
    // own boot-only instance -- always has the live GameStateSnapshot to work from.
    const cameraDirector = new CameraDirector(ctx.bus);
    cameraDirector.applyPose(ctx.three.camera, titlePose(ctx.viewport));
    this.cameraDirector = cameraDirector;

    this.unsubscribers.push(
      ctx.bus.on('phaseChanged', (event) => {
        if (event.from === 'title') void ctx.services.audio.unlock();
      }),
      ctx.bus.on('qualityChanged', (event) => this.applyQuality(event.tier))
    );
  }

  update(dt: number, state: Readonly<GameStateSnapshot>): void {
    const ctx = this.ctx;
    if (!ctx) return;

    const derived = deriveTransformState(state.progress);

    const fromWorld = this.worlds.get(state.pair.from);
    const toWorld = this.worlds.get(state.pair.to);
    fromWorld?.updateAsOld(derived);
    toWorld?.updateAsNew(derived);
    for (const [sceneId, world] of this.worlds) {
      if (sceneId !== state.pair.from && sceneId !== state.pair.to) world.setFullyHidden();
    }

    this.understage?.update(derived);
    this.understage?.setUnlocked(UNLOCKED_PHASES.has(state.phase));

    // Cutaway occlusion: the understage rig is only ever visible (and the solid floor only ever
    // hidden) during descend/mechanism phases, per docs/CAMERA_STORYBOARD.md's cutaway framing.
    // Every other phase (establish/cue/reveal/finale/choice) shows a solid stage floor and no
    // understage geometry, so nothing leaks into the audience-side view (Gate B defect #1).
    const understageVisible = UNDERSTAGE_VISIBLE_PHASES.has(state.phase);
    if (this.understage) this.understage.group.visible = understageVisible;
    if (this.stageFloor) this.stageFloor.visible = !understageVisible;

    this.cameraDirector?.update(dt, state);
    this.hintHand?.update(dt, state.reducedMotion);

    this.updateLightingAndVfx(dt, state, derived.lightingBlend);

    if (state.muted !== this.lastMuted) {
      this.lastMuted = state.muted;
      ctx.services.audio.setMuted(state.muted);
    }
  }

  private updateLightingAndVfx(dt: number, state: Readonly<GameStateSnapshot>, lightingBlend: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.blendLight) return;

    this.blendLight.color.copy(ROOM_LIGHT_COLOR).lerp(DAYLIGHT_COLOR, lightingBlend);
    this.blendLight.intensity = 1.0 + lightingBlend * 0.35;

    ctx.services.vfx.setDust(UNDERSTAGE_VISIBLE_PHASES.has(state.phase));

    let forestAmount = 0;
    if (state.pair.to === 'forest') forestAmount = state.progress;
    else if (state.pair.from === 'forest') forestAmount = 1 - state.progress;
    else if (state.currentScene === 'forest') forestAmount = 1;
    ctx.services.vfx.setGobo(forestAmount);
    ctx.services.vfx.setBirds(forestAmount > 0.6);

    const footlightTarget = FOOTLIGHT_PHASES.has(state.phase) ? 1 : 0;
    this.footlightsLevel += (footlightTarget - this.footlightsLevel) * Math.min(1, dt * 2);
    ctx.services.vfx.setFootlights(this.footlightsLevel);
  }

  applyQuality(tier: QualityTier): void {
    this.auditorium?.applyQuality(tier);
    this.understage?.applyQuality(tier);
    for (const world of this.worlds.values()) world.applyQuality(tier);
  }

  dispose(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers.length = 0;

    const scene = this.ctx?.three.scene;
    if (scene && this.auditorium) scene.remove(this.auditorium.group);
    this.auditorium?.dispose();
    if (scene && this.understage) scene.remove(this.understage.group);
    this.understage?.dispose();
    if (scene && this.hintHand) scene.remove(this.hintHand.group);
    this.hintHand?.dispose();
    for (const world of this.worlds.values()) {
      if (scene) scene.remove(world.group);
      world.dispose();
    }
    this.worlds.clear();
    if (scene && this.blendLight) scene.remove(this.blendLight);
    this.blendLight = null;
    if (scene && this.frontFillLight) scene.remove(this.frontFillLight);
    this.frontFillLight = null;
    if (scene && this.stageFloor) scene.remove(this.stageFloor);
    this.stageFloor = null;
    for (const geometry of this.ownedGeometries) geometry.dispose();
    this.ownedGeometries.length = 0;
    for (const material of this.ownedMaterials) material.dispose();
    this.ownedMaterials.length = 0;

    this.auditorium = null;
    this.understage = null;
    this.hintHand = null;
    this.cameraDirector = null;
    this.ctx = null;
  }
}
