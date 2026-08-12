import { AmbientLight, Color, DirectionalLight, PerspectiveCamera, Scene, WebGLRenderer } from 'three';
import { EventBus, GameState } from '../core';
import type { SceneModule } from '../core';
import { AudioSystem } from '../audio/AudioSystem';
import { detectReducedMotion, watchReducedMotion } from '../accessibility';
import { CameraDirector } from '../camera/CameraDirector';
import { GameDirector } from '../game/GameDirector';
import { InputSystem } from '../input/InputSystem';
import { configureRenderer } from '../render/RenderSystem';
import { PlaceholderScene } from '../scenes';
import { UiSystem } from '../ui/UiSystem';
import { VfxSystem } from '../vfx/VfxSystem';
import { DisposeBag } from './DisposeBag';
import { installDebugHook } from './debugHook';
import { RafLoop } from './RafLoop';
import { computeViewportProfile } from './viewport';

const BOOT_CAMERA_FOV = 45;

/**
 * Wave 1 application shell: boots the renderer/scene/camera, wires the
 * per-domain stub subsystems, drives the rAF loop, and keeps ViewportProfile
 * in sync with resize/orientation. Owners plug real logic into the stub
 * subsystems without needing to touch this file.
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
  private readonly ui = new UiSystem();
  private readonly vfx = new VfxSystem();
  private readonly audio = new AudioSystem();

  constructor(private readonly container: HTMLElement) {
    this.state = new GameState(this.bus);
    this.state.setReducedMotion(detectReducedMotion());

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
      viewport: initialViewport
    });
    this.disposeBag.add(() => this.activeScene.dispose());

    this.vfx.init(this.scene);
    this.disposeBag.add(() => this.vfx.dispose());
    this.disposeBag.add(() => this.audio.dispose());

    this.gameDirector = new GameDirector(this.state, this.bus);

    const detachInput = this.input.attach(this.renderer.domElement, (intent) => {
      this.gameDirector.handleIntent(intent);
    });
    this.disposeBag.add(detachInput);

    this.ui.init(this.bus);
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

    installDebugHook(() => this.state.getSnapshot());

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
