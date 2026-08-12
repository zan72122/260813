import { AmbientLight, Color, DirectionalLight, Group, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { EventBus, GameState } from '../core';
import type { GameEvent, GamePhase, SceneModule } from '../core';
import { WebAudioEngine } from '../audio/AudioEngine';
import { detectReducedMotion, watchReducedMotion } from '../accessibility';
import { CameraDirector } from '../camera/CameraDirector';
import { GameDirector } from '../game/GameDirector';
import { InputSystem } from '../input/InputSystem';
import { ProceduralMaterialLibrary } from '../render/MaterialLibrary';
import { configureRenderer } from '../render/RenderSystem';
import { PlaceholderScene } from '../scenes';
import { UiSystem } from '../ui/UiSystem';
import { ParticleVfxSystem } from '../vfx/VfxSystem';
import { DisposeBag } from './DisposeBag';
import { installDebugHook, type StageDebugAudioState } from './debugHook';
import { RafLoop } from './RafLoop';
import { computeViewportProfile } from './viewport';

const BOOT_CAMERA_FOV = 45;
const DEBUG_EVENT_RING_CAPACITY = 50;

type InputMode = 'tap' | 'lock' | 'rope' | 'choice' | 'none';

/**
 * Maps each GamePhase to the InputSystem mode that phase should accept, per
 * docs/MASTER_SPEC.md's phase table and src/game/GameDirector.ts's actual
 * ActionIntent handling (see its handleTap/handleRopeDrag/lockRelease
 * branches for which phases consume which intents). Phases not listed here
 * are watch-only beats (establish/descend/reveal1/reveal2/finale) that
 * auto-advance without needing pointer input, so they get 'none'.
 */
const PHASE_INPUT_MODE: Record<GamePhase, InputMode> = {
  boot: 'none',
  title: 'tap',
  establish: 'none',
  cue: 'tap',
  descend: 'none',
  unlock: 'lock',
  pull1: 'rope',
  reveal1: 'none',
  cue2: 'rope',
  pull2: 'rope',
  reveal2: 'none',
  finale: 'none',
  choice: 'choice',
  freePlay: 'rope'
};

/**
 * VfxSystem's internal offsets (src/vfx/VfxSystem.ts) are owner B's guess at
 * the world-space layout in src/scenes/rig/layout.ts. FOOTLIGHT_Z (1.55) sits
 * past PROSCENIUM_Z (1.0) — in the audience beyond the arch rather than along
 * the stage's front lip. Rather than editing owner B's internal constant,
 * this nudges the whole VFX rig upstage via the parent Object3D that
 * VfxSystem's own doc comment says callers should use for layout correction
 * (attach() adds VfxSystem's root under whatever parent is passed, so an
 * offset parent shifts every effect it renders together).
 */
const VFX_ANCHOR_Z_OFFSET = -0.6;

/**
 * Wave 1 application shell: boots the renderer/scene/camera, wires the
 * per-domain subsystems, drives the rAF loop, and keeps ViewportProfile in
 * sync with resize/orientation. Owners plug real logic into the subsystems
 * without needing to touch this file (Wave 3: swapped the null-object stubs
 * for owners A/B/C's real implementations).
 */
export class App {
  private readonly bus = new EventBus();
  private readonly state: GameState;
  private readonly disposeBag = new DisposeBag();
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly loop: RafLoop;
  private readonly activeScene: SceneModule;
  private readonly cameraDirector = new CameraDirector();
  private readonly gameDirector: GameDirector;
  private readonly input = new InputSystem();
  private readonly ui: UiSystem;
  private readonly vfx = new ParticleVfxSystem();
  private readonly audio = new WebAudioEngine();
  private readonly materials = new ProceduralMaterialLibrary();
  private readonly recentEvents: GameEvent[] = [];

  constructor(private readonly container: HTMLElement) {
    this.state = new GameState(this.bus);
    this.state.setReducedMotion(detectReducedMotion());
    this.ui = new UiSystem(this.bus);

    const initialViewport = computeViewportProfile(this.state.getSnapshot().quality);
    this.state.setViewport(initialViewport);

    this.renderer = new WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(initialViewport.dpr);
    this.renderer.setSize(initialViewport.width, initialViewport.height, false);
    configureRenderer(this.renderer, this.state.getSnapshot().quality);
    this.container.appendChild(this.renderer.domElement);

    this.scene.background = new Color(0x050308);
    this.camera = new PerspectiveCamera(
      BOOT_CAMERA_FOV,
      initialViewport.width / Math.max(initialViewport.height, 1),
      0.1,
      100
    );
    this.cameraDirector.applyPose(this.camera, {
      position: { x: 0, y: 1.6, z: 4 },
      target: { x: 0, y: 0.5, z: 0 },
      fov: BOOT_CAMERA_FOV
    });

    const ambient = new AmbientLight(0xffffff, 0.6);
    const key = new DirectionalLight(0xffffff, 0.8);
    key.position.set(2, 3, 2);
    this.scene.add(ambient, key);
    this.disposeBag.add(() => {
      ambient.dispose();
      key.dispose();
    });

    this.activeScene = new PlaceholderScene();
    this.activeScene.init({
      three: { scene: this.scene, camera: this.camera, renderer: this.renderer },
      bus: this.bus,
      quality: this.state.getSnapshot().quality,
      viewport: initialViewport,
      services: { materials: this.materials, audio: this.audio, vfx: this.vfx }
    });
    this.disposeBag.add(() => this.activeScene.dispose());

    const vfxAnchor = new Group();
    vfxAnchor.position.z = VFX_ANCHOR_Z_OFFSET;
    this.scene.add(vfxAnchor);
    this.vfx.attach(vfxAnchor);
    this.disposeBag.add(() => {
      this.vfx.dispose();
      this.scene.remove(vfxAnchor);
    });
    this.disposeBag.add(() => this.materials.dispose());
    this.disposeBag.add(() => this.audio.dispose());

    // Either GameEvent path is valid per docs/CONTRACTS_ADDENDUM.md; app forwards
    // bus 'audioCue' events to the engine so consumers can use whichever fits.
    const detachAudioCueForwarding = this.bus.on('audioCue', (event) => {
      if (event.velocity !== undefined) {
        this.audio.setContinuous(event.cue, event.velocity);
      } else {
        this.audio.play(event.cue);
      }
    });
    this.disposeBag.add(detachAudioCueForwarding);

    this.gameDirector = new GameDirector(this.state, this.bus);

    this.input.attach(this.renderer.domElement);
    this.input.onIntent((intent) => this.gameDirector.handleIntent(intent));
    this.disposeBag.add(() => this.input.dispose());

    // Input interpretation follows GamePhase (docs/CONTRACTS_ADDENDUM.md:
    // "GamePhaseに応じた入力解釈の切替（app/gameが設定）").
    this.input.setMode(PHASE_INPUT_MODE[this.state.getSnapshot().phase]);
    const detachInputModeSync = this.bus.on('phaseChanged', (event) => {
      this.input.setMode(PHASE_INPUT_MODE[event.to]);
    });
    this.disposeBag.add(detachInputModeSync);

    this.ui.mount(this.container, (intent) => this.gameDirector.handleIntent(intent));
    this.disposeBag.add(() => this.ui.dispose());

    const detachReducedMotionWatch = watchReducedMotion((reduced) => this.state.setReducedMotion(reduced));
    this.disposeBag.add(detachReducedMotionWatch);

    const handleResize = (): void => this.onResize();
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    this.disposeBag.add(() => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
    });

    const detachEventRing = this.bus.onAny((event) => {
      this.recentEvents.push(event);
      if (this.recentEvents.length > DEBUG_EVENT_RING_CAPACITY) this.recentEvents.shift();
    });
    this.disposeBag.add(detachEventRing);

    installDebugHook({
      getState: () => this.state.getSnapshot(),
      skipToPhase: (phase) => this.state.setPhase(phase),
      getRecentEvents: () => [...this.recentEvents],
      getAudioState: (): StageDebugAudioState => ({
        ...this.audio.getDebugState(),
        muted: this.state.getSnapshot().muted
      })
    });

    this.loop = new RafLoop((dt) => this.tick(dt));
  }

  start(): void {
    this.loop.start();
  }

  dispose(): void {
    this.loop.stop();
    this.disposeBag.disposeAll();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  private onResize(): void {
    const profile = computeViewportProfile(this.state.getSnapshot().quality);
    // orientation change / resize must preserve phase/pair/progress (docs/CAMERA_STORYBOARD.md);
    // GameState setters below only ever touch viewport, never those fields.
    this.state.setViewport(profile);
    this.renderer.setPixelRatio(profile.dpr);
    this.renderer.setSize(profile.width, profile.height, false);
    this.camera.aspect = profile.width / Math.max(profile.height, 1);
    this.camera.updateProjectionMatrix();
  }

  private tick(dt: number): void {
    this.gameDirector.update(dt);
    this.cameraDirector.update(dt);
    this.vfx.update(dt);
    this.activeScene.update(dt, this.state.getSnapshot());
    this.renderer.render(this.scene, this.camera);
  }
}
