import * as THREE from 'three';
import { Layout } from '../core/Layout';
import { Quality } from '../core/Quality';
import { CameraDirector } from '../core/CameraDirector';
import { Input } from '../core/Input';
import { Env } from '../gfx/Env';
import { Particles } from '../gfx/Particles';
import { PALETTES } from '../gfx/palettes';
import { Ground } from '../world/Ground';
import { Sky } from '../world/Sky';
import { Plot } from '../world/Plot';
import { Water } from '../world/Water';
import { CrossSection } from '../world/CrossSection';
import { FlowerField, HeroPlants } from '../world/FlowerField';
import { Audio } from '../audio/Audio';
import { Ui } from '../ui/Ui';
import { SHOTS } from './shots';
import {
  BASKET_L, BASKET_P, BASKET_R, BED, CHANNEL, HOLE, HOLES,
} from './config';
import { clamp, clamp01, damp, easeOutBounceSoft, easeOutCubic, lerp, smootherstep, smoothstep } from '../core/math';

export type State =
  | 'boot' | 'intro' | 'plant' | 'dive' | 'water' | 'seep'
  | 'grow' | 'surface' | 'firstBloom' | 'wave' | 'reveal' | 'end';

const PLANT_REST_Y = BED.top - HOLE.depth + 0.010;

export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly layout = new Layout();
  readonly quality = new Quality();
  readonly env = new Env();
  readonly director: CameraDirector;
  readonly audio = new Audio();
  readonly ui = new Ui();
  private input: Input;

  private sky!: Sky;
  private ground!: Ground;
  private plot!: Plot;
  private water!: Water;
  private section!: CrossSection;
  private field!: FlowerField;
  private heroes!: HeroPlants;
  private puffs!: Particles;
  private sun!: THREE.DirectionalLight;
  private hemi!: THREE.HemisphereLight;

  state: State = 'boot';
  private t = 0;            // seconds inside the current state
  private clock = new THREE.Clock();
  private running = false;

  // --- run configuration (changes on replay) --------------------------------
  private paletteIndex = 0;
  private seed = 1337;

  // --- planting -------------------------------------------------------------
  private planted = 0;
  private carried = -1;
  private dropAnim: { i: number; t: number } | null = null;
  private fillAnim: { i: number; t: number } | null = null;
  private idle = 0;
  private hintBeat = 0;
  private bulbHome: THREE.Vector3[] = [];
  private bulbPos: THREE.Vector3[] = [];
  private ray = new THREE.Raycaster();
  private dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(BED.top + 0.10));
  private hit = new THREE.Vector3();
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();

  // --- water ---------------------------------------------------------------
  private gateDrag = false;
  private gateStartY = 0;
  private gateOpened = false;
  private waterFront = CHANNEL.fromX - 0.2;
  private seepY = 0.06;
  private popped = [false, false, false, false];
  private waveRadius = -1;
  private lastSwellAt = 0;

  constructor(canvasHost: HTMLElement) {
    this.layout.update();
    const tier = this.quality.settings.tier;
    this.renderer = new THREE.WebGLRenderer({
      antialias: tier !== 'low',
      powerPreference: 'high-performance',
      alpha: false,
      stencil: false,
      failIfMajorPerformanceCaveat: false,
    });
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.setSize(this.layout.width, this.layout.height, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0xbfe2f7, 1);
    canvasHost.appendChild(this.renderer.domElement);

    this.director = new CameraDirector(this.layout);
    this.input = new Input(this.renderer.domElement);
    this.input.down.push(() => this.onDown());
    this.input.move.push(() => this.onMove());
    this.input.up.push(() => this.onUp());

    this.quality.onResScale = () => {
      this.renderer.setPixelRatio(this.quality.pixelRatio);
      this.puffs?.setPixelScale(this.layout.height * this.renderer.getPixelRatio());
    };

    this.build();
    this.bindUi();
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', () => setTimeout(this.onResize, 60));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.audio.stopAll();
    });
  }

  // ==========================================================================
  //  Construction
  // ==========================================================================
  private get palette() { return PALETTES[this.paletteIndex]; }

  private build() {
    const p = this.palette;
    this.env.setSky(p.sky, p.fog, p.sun);
    this.scene.fog = new THREE.Fog(new THREE.Color(p.fog), 55, 320);
    this.scene.background = new THREE.Color(p.skyLow);

    this.hemi = new THREE.HemisphereLight(new THREE.Color(p.sky), new THREE.Color('#8d6a48'), 1.35);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(new THREE.Color(p.sun), 1.55);
    this.sun.position.copy(this.env.u.uSunDir.value).multiplyScalar(30);
    this.scene.add(this.sun);

    this.sky = new Sky(this.env, p);
    this.scene.add(this.sky.group);

    this.ground = new Ground(this.env, p, this.seed, this.quality.settings.textureSize);
    this.scene.add(this.ground.mesh);

    this.plot = new Plot(this.ground.createSurfaceMaterial(this.env, p, 0xefd8bd));
    this.scene.add(this.plot.group);

    this.water = new Water(
      this.ground.createSurfaceMaterial(this.env, p),
      this.env.u.uSunColor.value, this.env.u.uSkyColor.value, this.env.u.uSunDir.value,
    );
    this.scene.add(this.water.group);

    this.section = new CrossSection(this.env.u.uSunColor.value, this.env.u.uSkyColor.value);
    this.scene.add(this.section.group);
    // sprouts stay above ground after the trench is filled back in
    this.scene.add(this.section.sprouts.mesh);

    this.field = new FlowerField(this.env, this.quality.settings);
    this.field.build({
      palette: p, seed: this.seed,
      waveDir: new THREE.Vector2(0, 0), origin: new THREE.Vector3(0, 0, 0),
    });
    this.scene.add(this.field.group);

    this.heroes = new HeroPlants(this.env, p, HOLES, this.seed);
    this.scene.add(this.heroes.mesh);

    this.puffs = new Particles(this.quality.settings.soilParticles + 120);
    this.puffs.setPixelScale(this.layout.height * this.renderer.getPixelRatio());
    this.scene.add(this.puffs.points);

    for (let i = 0; i < HOLES.length; i++) {
      this.bulbHome.push(new THREE.Vector3());
      this.bulbPos.push(new THREE.Vector3());
    }
    this.layoutBasket(true);
  }

  private bindUi() {
    this.ui.onStart = () => this.start();
    this.ui.onAgain = () => this.replay(false, false);
    this.ui.onColor = () => this.replay(true, false);
    this.ui.onField = () => this.replay(true, true);
  }

  // ==========================================================================
  //  Lifecycle
  // ==========================================================================
  async start() {
    await this.audio.unlock();
    this.ui.hideBoot();
    this.running = true;
    this.clock.start();
    this.enter('intro');
    this.audio.wind(0.35);
  }

  private replay(newPalette: boolean, newField: boolean) {
    if (newPalette) this.paletteIndex = (this.paletteIndex + 1) % PALETTES.length;
    if (newField) this.seed = (this.seed * 1664525 + 1013904223) >>> 8;
    const p = this.palette;

    this.ui.showEnd(false);
    this.env.setSky(p.sky, p.fog, p.sun);
    (this.scene.fog as THREE.Fog).color.set(p.fog);
    (this.scene.background as THREE.Color).set(p.skyLow);
    this.hemi.color.set(p.sky);
    this.sun.color.set(p.sun);
    this.sky.setPalette(p);
    this.ground.rebuild(p, this.seed);

    // a different sweep direction each time keeps replays from feeling identical
    const a = (this.seed % 628) / 100;
    (this.env.u.uWaveDir.value as THREE.Vector2).set(Math.cos(a) * 0.5, Math.sin(a) * 0.5);

    if (newField) {
      this.scene.remove(this.field.group);
      this.field.dispose();
      this.field = new FlowerField(this.env, this.quality.settings);
      this.field.build({
        palette: p, seed: this.seed,
        waveDir: this.env.u.uWaveDir.value as THREE.Vector2, origin: new THREE.Vector3(),
      });
      this.scene.add(this.field.group);
    } else {
      this.field.recolor(p, this.seed);
    }

    this.scene.remove(this.heroes.mesh);
    this.heroes.dispose();
    this.heroes = new HeroPlants(this.env, p, HOLES, this.seed);
    this.scene.add(this.heroes.mesh);

    this.resetRun();
    this.enter('plant');
    this.director.cut(SHOTS.intro, 0);
    this.director.cut(SHOTS.plant, 1.6);
  }

  private resetRun() {
    this.planted = 0;
    this.carried = -1;
    this.dropAnim = null;
    this.fillAnim = null;
    this.gateDrag = false;
    this.gateOpened = false;
    this.waterFront = CHANNEL.fromX - 0.2;
    this.seepY = 0.06;
    this.waveRadius = -1;
    this.popped = [false, false, false, false];
    this.env.u.uWaveRadius.value = -1;
    this.env.u.uWindAmp.value = 0.022;
    this.heroes.setLead(-6);
    this.water.reset();
    this.section.reset();
    this.ground.setCut(0);
    this.ground.setWet(new THREE.Vector2(0, CHANNEL.z), 0.3, 0);
    this.puffs.clear();
    this.plot.basket.scale.setScalar(1);
    this.plot.frame.scale.setScalar(1);
    for (let i = 0; i < HOLES.length; i++) {
      this.plot.setHoleOpen(i, 1);
      this.plot.setRingGlow(i, 0);
      this.plot.bulbs[i].visible = true;
      this.plot.bulbs[i].scale.setScalar(1);
    }
    this.plot.refresh();
    this.section.sprouts.mesh.visible = true;
    this.section.sprouts.mesh.scale.setScalar(1);
    this.layoutBasket(true);
    this.audio.birds = false;
    this.audio.water(0, 0.2);
    this.audio.pad(0, 0.4);
    this.audio.wind(0.35);
  }

  private enter(s: State) {
    this.state = s;
    this.t = 0;
    this.idle = 0;
    this.ui.showHand(false);

    switch (s) {
      case 'intro':
        this.director.cut(SHOTS.intro, 0);
        this.ui.setDots(HOLES.length, 0, false);
        break;
      case 'plant':
        this.director.cut(SHOTS.plant, 2.2);
        this.ui.setDots(HOLES.length, this.planted, true);
        break;
      case 'dive':
        this.director.cut(SHOTS.section, 2.6);
        this.ui.setDots(HOLES.length, HOLES.length, true);
        this.section.group.visible = true;
        break;
      case 'water':
        this.director.cut(SHOTS.section, 1.0);
        break;
      case 'seep':
        this.director.cut(SHOTS.seep, 2.4);
        break;
      case 'grow':
        this.director.cut(SHOTS.grow, 2.0);
        this.audio.rootGrow();
        break;
      case 'surface':
        this.director.cut(SHOTS.surface, 2.6);
        this.ui.setDots(HOLES.length, HOLES.length, false);
        break;
      case 'firstBloom':
        this.director.cut(SHOTS.firstBloom, 2.4);
        this.audio.water(0, 1.2);
        break;
      case 'wave':
        this.director.cut(SHOTS.wave, 2.6);
        this.env.u.uWaveRadius.value = 0.1;
        this.waveRadius = 0.1;
        break;
      case 'reveal':
        this.director.cut(SHOTS.reveal, 2.2);
        this.audio.pad(1);
        this.audio.birds = true;
        break;
      case 'end':
        this.director.cut(SHOTS.end, 3.0);
        this.ui.showEnd(true);
        break;
    }
  }

  // ==========================================================================
  //  Input
  // ==========================================================================
  private screenOf(world: THREE.Vector3, out: THREE.Vector2) {
    this.tmp2.copy(world).project(this.director.camera);
    out.set(
      (this.tmp2.x * 0.5 + 0.5) * this.layout.width,
      (-this.tmp2.y * 0.5 + 0.5) * this.layout.height,
    );
    return out;
  }

  private groundPoint(out: THREE.Vector3) {
    this.ray.setFromCamera(this.input.current.ndc, this.director.camera);
    const ok = this.ray.ray.intersectPlane(this.dragPlane, out);
    return ok !== null;
  }

  private onDown() {
    this.idle = 0;
    if (this.state === 'plant') {
      if (this.dropAnim || this.planted >= HOLES.length) return;
      const i = this.planted;
      const s = this.screenOf(this.bulbPos[i], new THREE.Vector2());
      const grab = Math.min(this.layout.width, this.layout.height) * 0.38;
      if (s.distanceTo(this.input.current.px) < grab) {
        this.carried = i;
        this.audio.hint();
      }
      return;
    }
    if (this.state === 'water' && !this.gateOpened) {
      // Anywhere on the screen counts. There is only one thing to do in this
      // scene, so demanding that a small finger land on the lever would only
      // ever produce failure, never meaning.
      this.gateDrag = true;
      this.gateStartY = this.input.current.px.y;
    }
  }

  private onMove() {
    this.idle = 0;
    if (this.state === 'plant' && this.carried >= 0) {
      if (!this.groundPoint(this.hit)) return;
      const i = this.carried;
      const h = HOLES[i];
      const d = Math.hypot(this.hit.x - h.x, this.hit.z - h.z);
      // strong magnetism: getting close is enough, precision never is
      const pull = 1 - smoothstep(0, HOLE.snap, d);
      const tx = lerp(this.hit.x, h.x, pull * 0.85);
      const tz = lerp(this.hit.z, h.z, pull * 0.85);
      this.bulbPos[i].set(tx, BED.top + 0.16 + 0.05 * pull, tz);
      this.plot.setRingGlow(i, 0.45 + 0.55 * pull);
      return;
    }
    if (this.gateDrag && !this.gateOpened) {
      const dy = (this.gateStartY - this.input.current.px.y) / (this.layout.height * 0.16);
      this.water.setOpen(clamp01(dy));
      if (this.water.openAmount > 0.55) this.openGate();
    }
  }

  private onUp() {
    this.idle = 0;
    if (this.state === 'plant' && this.carried >= 0) {
      const i = this.carried;
      const h = HOLES[i];
      const d = Math.hypot(this.bulbPos[i].x - h.x, this.bulbPos[i].z - h.z);
      this.carried = -1;
      if (d < HOLE.forgive) {
        this.bulbPos[i].x = h.x; this.bulbPos[i].z = h.z;
        this.dropAnim = { i, t: 0 };
      } else {
        this.plot.setRingGlow(i, 0);
      }
      return;
    }
    if (this.gateDrag) {
      this.gateDrag = false;
      if (!this.gateOpened) {
        const swipe = (this.input.start.px.y - this.input.current.px.y) / this.layout.height;
        // a flick, a slow drag or even a plain tap on the lever all open it
        const tappedLever = this.screenOf(this.water.handleWorld(this.tmp), new THREE.Vector2())
          .distanceTo(this.input.current.px) < Math.min(this.layout.width, this.layout.height) * 0.22;
        if (swipe > 0.035 || this.water.openAmount > 0.25 || tappedLever) this.openGate();
        else this.water.setOpen(0);
      }
    }
  }

  private openGate() {
    if (this.gateOpened) return;
    this.gateOpened = true;
    this.water.setOpen(1);
    this.audio.clack();
    this.audio.water(1, 0.7);
    this.ui.showHand(false);
    window.setTimeout(() => this.audio.water(0.75, 2), 900);
  }

  // ==========================================================================
  //  Frame
  // ==========================================================================
  frame = () => {
    requestAnimationFrame(this.frame);
    if (!this.running) { this.renderer.render(this.scene, this.director.camera); return; }
    const dt = Math.min(0.05, this.clock.getDelta());
    this.t += dt;
    this.idle += dt;
    this.input.tick(dt);
    this.env.u.uTime.value += dt;
    this.audio.tick(dt);

    this.step(dt);

    this.director.update(dt);
    this.sky.update(dt, this.director.camera);
    this.water.update(this.env.u.uTime.value);
    this.plot.update();
    this.puffs.update(dt);

    this.renderer.render(this.scene, this.director.camera);
    this.quality.sample(dt * 1000, this.env.u.uTime.value);
  };

  private step(dt: number) {
    switch (this.state) {
      case 'intro': this.stepIntro(); break;
      case 'plant': this.stepPlant(dt); break;
      case 'dive': this.stepDive(dt); break;
      case 'water': this.stepWater(dt); break;
      case 'seep': this.stepSeep(dt); break;
      case 'grow': this.stepGrow(dt); break;
      case 'surface': this.stepSurface(dt); break;
      case 'firstBloom': this.stepFirstBloom(dt); break;
      case 'wave': this.stepWave(dt); break;
      case 'reveal': this.stepReveal(dt); break;
      case 'end': break;
    }
    this.updateBulbs(dt);
  }

  private stepIntro() {
    if (this.t > 3.6) this.enter('plant');
  }

  private stepPlant(dt: number) {
    this.layoutBasket(false);

    if (this.dropAnim) {
      const a = this.dropAnim;
      a.t += dt / 0.42;
      const i = a.i;
      const from = BED.top + 0.16;
      const y = lerp(from, PLANT_REST_Y, easeOutBounceSoft(clamp01(a.t)));
      this.bulbPos[i].y = y;
      if (a.t >= 1) {
        this.dropAnim = null;
        this.fillAnim = { i, t: 0 };
        this.audio.plop();
        this.soilPuff(HOLES[i].x, HOLES[i].z);
        this.planted++;
        this.ui.setDots(HOLES.length, this.planted, true);
        this.plot.setRingGlow(i, 0);
        window.setTimeout(() => this.audio.fluff(), 150);
      }
    }

    if (this.fillAnim) {
      const a = this.fillAnim;
      a.t += dt / 0.55;
      this.plot.setHoleOpen(a.i, 1 - easeOutCubic(clamp01(a.t)));
      if (a.t >= 1) this.fillAnim = null;
    }

    // guide the next bulb without a single word of text
    if (this.planted < HOLES.length && !this.dropAnim) {
      const i = this.planted;
      const pulse = 0.35 + 0.25 * Math.sin(this.env.u.uTime.value * 3.1);
      if (this.carried !== i) this.plot.setRingGlow(i, pulse);
      if (this.idle > 3.0) this.showPlantHint(i);
      else this.ui.showHand(false);
    }

    if (this.planted >= HOLES.length && !this.fillAnim && !this.dropAnim) {
      if (this.idle > 0.9) this.enter('dive');
    }
  }

  private showPlantHint(i: number) {
    const from = this.screenOf(this.bulbPos[i], new THREE.Vector2());
    this.tmp.set(HOLES[i].x, BED.top + 0.06, HOLES[i].z);
    const to = this.screenOf(this.tmp, new THREE.Vector2());
    const k = (this.env.u.uTime.value * 0.55) % 1;
    const e = smootherstep(0, 1, k);
    this.ui.showHand(true, lerp(from.x, to.x, e), lerp(from.y, to.y, e));
    if (this.env.u.uTime.value - this.hintBeat > 4.5) {
      this.hintBeat = this.env.u.uTime.value;
      this.audio.hint();
    }
  }

  private stepDive(dt: number) {
    const k = clamp01(this.t / 1.7);
    this.ground.setCut(smootherstep(0, 1, k));
    const vanish = Math.max(0.001, 1 - smoothstep(0, 0.8, this.t));
    this.plot.basket.scale.setScalar(vanish);
    this.plot.frame.scale.setScalar(vanish);
    this.env.u.uWindAmp.value = damp(this.env.u.uWindAmp.value, 0.014, 2, dt);
    if (this.t > 3.6) this.enter('water');
  }

  private stepWater(dt: number) {
    if (!this.gateOpened) {
      // the knob breathes, then a hand appears above it after a few seconds
      const b = 1 + 0.10 * Math.sin(this.env.u.uTime.value * 3.4);
      this.water.handle.scale.setScalar(b);
      if (this.idle > 2.2) {
        const p = this.screenOf(this.water.handleWorld(this.tmp), new THREE.Vector2());
        const k = (this.env.u.uTime.value * 0.7) % 1;
        // offset to the right so the hand never covers the thing it points at
        const dx = Math.min(this.layout.width, this.layout.height) * 0.10;
        this.ui.showHand(true, p.x + dx, p.y + 30 - smootherstep(0, 1, k) * this.layout.height * 0.11);
        if (this.env.u.uTime.value - this.hintBeat > 4.5) {
          this.hintBeat = this.env.u.uTime.value;
          this.audio.hint();
          this.water.setOpen(0.14);
          window.setTimeout(() => { if (!this.gateOpened) this.water.setOpen(0); }, 260);
        }
      }
      return;
    }

    this.water.handle.scale.setScalar(1);
    this.water.setLevel(clamp01((this.t - 0.0) * 2.2));
    this.waterFront = damp(this.waterFront, CHANNEL.toX + 0.35, 1.25, dt);
    this.water.setFront(this.waterFront);

    // soil drinks it in from the channel towards the row
    const soak = clamp01((this.waterFront - CHANNEL.fromX) / 1.1);
    this.ground.setWet(new THREE.Vector2(0, CHANNEL.z), 0.35 + soak * 1.65, soak * 0.95);

    if (this.waterFront > 0.15) this.enter('seep');
  }

  private stepSeep(dt: number) {
    this.water.setFront(CHANNEL.toX + 0.35);
    this.waterFront = CHANNEL.toX + 0.35;
    const k = clamp01(this.t / 2.4);
    this.seepY = lerp(0.06, -0.22, smootherstep(0, 1, k));
    this.section.setWet(this.seepY, clamp01(this.t / 0.8));
    this.ground.setWet(new THREE.Vector2(0, CHANNEL.z), 2.0, 0.95);

    // droplets working their way down the cut face
    if (Math.random() < dt * 26) {
      const h = HOLES[(Math.random() * HOLES.length) | 0];
      this.puffs.spawn({
        pos: new THREE.Vector3(h.x + (Math.random() - 0.5) * 0.22, this.seepY + 0.05, -0.02),
        vel: new THREE.Vector3(0, -0.12, 0),
        life: 0.85, size0: 0.020, size1: 0.008,
        color: new THREE.Color('#9fe4f5'), grav: -0.55, drag: 0.4,
      });
    }
    if (this.t > 2.7) this.enter('grow');
  }

  private stepGrow(dt: number) {
    const root = clamp01(this.t / 2.0);
    this.section.roots.setGrow(smootherstep(0, 1, root));
    const sp = clamp01((this.t - 1.0) / 2.2);
    this.section.sprouts.setGrow(smootherstep(0, 1, sp));
    this.section.setWet(lerp(this.seepY, -0.5, clamp01((this.t - 1) / 3)), 0.9);

    if (Math.random() < dt * 8 && root < 1) {
      const h = HOLES[(Math.random() * HOLES.length) | 0];
      this.puffs.spawn({
        pos: new THREE.Vector3(h.x + (Math.random() - 0.5) * 0.2, -0.25 - Math.random() * 0.4, -0.01),
        vel: new THREE.Vector3(0, 0.05, 0),
        life: 0.9, size0: 0.012, size1: 0.0,
        color: new THREE.Color('#ffeec8'), grav: 0.2, drag: 1.2,
      });
    }
    if (this.t > 3.4) this.enter('surface');
  }

  private stepSurface(dt: number) {
    const close = clamp01(this.t / 1.5);
    this.ground.setCut(1 - smootherstep(0, 1, close));
    const sp = clamp01(0.55 + this.t / 2.2);
    this.section.sprouts.setGrow(sp);

    // "ポコッ" as each shoot clears the surface, staggered, never a machine gun
    for (let i = 0; i < HOLES.length; i++) {
      if (!this.popped[i] && this.t > 0.35 + i * 0.30) {
        this.popped[i] = true;
        this.audio.pop(1 + i * 0.07);
        this.soilPuff(HOLES[i].x, HOLES[i].z, 8, 0.05);
      }
    }
    this.env.u.uWindAmp.value = damp(this.env.u.uWindAmp.value, 0.026, 1.5, dt);
    if (close >= 1) {
      this.section.wall.visible = false;
      this.section.group.visible = false;
      this.section.sprouts.mesh.visible = true;
    }
    if (this.t > 2.8) this.enter('firstBloom');
  }

  private stepFirstBloom(dt: number) {
    // hand-driven growth: stem, then bud, then the flower opens
    const lead = lerp(-6, 10.5, smootherstep(0, 4.4, this.t));
    this.heroes.setLead(lead);
    // the shoot fades as the real stem takes its place
    const fade = 1 - clamp01((this.t - 0.4) / 1.0);
    this.section.sprouts.mesh.scale.set(1, Math.max(0.001, fade), 1);
    if (fade <= 0.01) this.section.sprouts.mesh.visible = false;

    if (this.t > 2.5 && this.lastSwellAt < 1) {
      this.lastSwellAt = 1;
      this.audio.bloom(1);
      this.audio.sparkle();
      this.ui.pulse(0.22, 900);
      this.sparkleAt(HOLES[0].x, 0.34, HOLES[0].z, 18);
    }
    this.env.u.uWindAmp.value = damp(this.env.u.uWindAmp.value, 0.030, 1.5, dt);
    if (this.t > 4.8) { this.lastSwellAt = 0; this.enter('wave'); }
  }

  private stepWave(dt: number) {
    this.heroes.setLead(10.5);
    // accelerating front: slow enough to follow at first, then it takes off
    const speed = 4.5 + this.t * this.t * 2.6;
    this.waveRadius += speed * dt;
    this.env.u.uWaveRadius.value = this.waveRadius;

    this.env.u.uWindAmp.value = damp(this.env.u.uWindAmp.value, 0.042, 1.2, dt);
    this.audio.wind(0.55 + 0.3 * clamp01(this.t / 6));

    if (this.t - this.lastSwellAt > 0.9 && this.waveRadius < 240) {
      this.lastSwellAt = this.t;
      if (this.waveRadius < 8) this.audio.bloom(1.12 - this.waveRadius * 0.02);
      else this.audio.bloomSwell(clamp(1 - this.waveRadius / 260, 0.25, 1));
    }
    if (this.t > 8.4) { this.lastSwellAt = -10; this.enter('reveal'); }
  }

  private stepReveal(dt: number) {
    const speed = 26 + this.t * 5;
    this.waveRadius = Math.min(340, this.waveRadius + speed * dt);
    this.env.u.uWaveRadius.value = this.waveRadius;
    this.env.u.uWindAmp.value = damp(this.env.u.uWindAmp.value, 0.055, 0.8, dt);
    this.audio.wind(0.9);
    if (this.t - this.lastSwellAt > 2.4 && this.t < 7) {
      this.lastSwellAt = this.t;
      this.audio.bloomSwell(0.4);
    }
    if (this.t > 10.5) this.enter('end');
  }

  // ==========================================================================
  //  Props
  // ==========================================================================
  private updateBulbs(dt: number) {
    const inHand = this.carried;
    for (let i = 0; i < HOLES.length; i++) {
      const m = this.plot.bulbs[i];
      const target = this.bulbPos[i];
      if (i > this.planted || (i === this.planted && inHand !== i && !this.dropAnim)) {
        // still waiting in the basket
        target.copy(this.bulbHome[i]);
        if (i === this.planted && this.state === 'plant') {
          // the next bulb hops gently: "this one, pick me up"
          const b = Math.max(0, Math.sin(this.env.u.uTime.value * 2.2));
          target.y += b * b * (this.idle > 3 ? 0.075 : 0.030);
        }
      }
      m.position.lerp(target, 1 - Math.exp(-22 * dt));
      m.rotation.y += dt * 0.4 * (i % 2 ? 1 : -1) * (i >= this.planted ? 1 : 0);
      const tilt = i === inHand ? 0.18 : 0;
      m.rotation.z = damp(m.rotation.z, Math.sin(this.env.u.uTime.value * 4) * tilt, 8, dt);
    }
  }

  private layoutBasket(instant: boolean) {
    this.tmp.copy(BASKET_P).lerp(BASKET_L, this.layout.wide);
    if (instant) this.plot.basket.position.copy(this.tmp);
    else this.plot.basket.position.lerp(this.tmp, 0.12);
    const b = this.plot.basket.position;
    const R = BASKET_R * 0.46;
    for (let i = 0; i < HOLES.length; i++) {
      const a = (i / HOLES.length) * Math.PI * 2 + 0.7;
      // sitting proud of the rim, so a child can see there are bulbs in there
      this.bulbHome[i].set(
        b.x + Math.cos(a) * R * 0.70,
        b.y + 0.088 + (i === this.planted ? 0.055 : 0),
        b.z + Math.sin(a) * R * 0.70,
      );
    }
  }

  private soilPuff(x: number, z: number, n = 0, up = 0.9) {
    const count = n || this.quality.settings.soilParticles;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = 0.25 + Math.random() * 0.75;
      this.puffs.spawn({
        pos: new THREE.Vector3(x + Math.cos(a) * 0.05, BED.top + 0.02, z + Math.sin(a) * 0.05),
        vel: new THREE.Vector3(Math.cos(a) * s * 0.55, up * (0.4 + Math.random() * 0.7), Math.sin(a) * s * 0.55),
        life: 0.5 + Math.random() * 0.4,
        size0: 0.016 + Math.random() * 0.02, size1: 0.004,
        color: new THREE.Color().setHSL(0.075, 0.45, 0.20 + Math.random() * 0.16),
        grav: -2.4, drag: 1.4,
      });
    }
  }

  private sparkleAt(x: number, y: number, z: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      this.puffs.spawn({
        pos: new THREE.Vector3(x + (Math.random() - 0.5) * 0.16, y + (Math.random() - 0.5) * 0.16, z + (Math.random() - 0.5) * 0.16),
        vel: new THREE.Vector3(Math.cos(a) * 0.18, 0.12 + Math.random() * 0.2, Math.sin(a) * 0.18),
        life: 0.9 + Math.random() * 0.5,
        size0: 0.012, size1: 0.001,
        color: new THREE.Color().setHSL(0.13, 1, 0.82),
        grav: -0.25, drag: 1.1,
      });
    }
  }

  // ==========================================================================
  //  Resize / orientation
  // ==========================================================================
  private onResize = () => {
    this.layout.update();
    this.renderer.setPixelRatio(this.quality.pixelRatio);
    this.renderer.setSize(this.layout.width, this.layout.height, false);
    this.puffs.setPixelScale(this.layout.height * this.renderer.getPixelRatio());
    this.director.update(0);
    this.director.settle();
    this.layoutBasket(true);
  };

  /**
   * Test hook: advance the simulation by real seconds without waiting for
   * frames. Playtests run under software rendering, where wall-clock time and
   * game time diverge wildly; this keeps screenshots reproducible.
   */
  testAdvance(seconds: number, step = 1 / 60) {
    const n = Math.max(1, Math.round(seconds / step));
    for (let i = 0; i < n; i++) {
      this.t += step;
      this.idle += step;
      this.env.u.uTime.value += step;
      this.step(step);
      this.director.update(step);
    }
    this.sky.update(step, this.director.camera);
    this.water.update(this.env.u.uTime.value);
    this.plot.update();
    this.puffs.update(step);
  }

  /** Seconds spent in the current state. */
  get stateTime() { return this.t; }

  /** Test hook: where hole `i` is. */
  holeAt(i: number) { return HOLES[i]; }

  /** Test hook: skip straight to a state. */
  jumpTo(s: State) {
    if (s === 'plant') { this.resetRun(); }
    if (s !== 'plant' && s !== 'intro') {
      // fast-forward the world to a plausible state for that scene
      this.planted = HOLES.length;
      for (let i = 0; i < HOLES.length; i++) {
        this.plot.setHoleOpen(i, 0);
        this.bulbPos[i].set(HOLES[i].x, PLANT_REST_Y, HOLES[i].z);
        this.plot.bulbs[i].position.copy(this.bulbPos[i]);
      }
      this.plot.basket.scale.setScalar(0.001);
      this.plot.frame.scale.setScalar(0.001);
      this.plot.refresh();
    }
    if (s === 'water' || s === 'seep' || s === 'grow') {
      this.section.group.visible = true;
      this.ground.setCut(1);
    }
    if (s === 'seep' || s === 'grow') { this.gateOpened = true; this.water.setOpen(1); this.water.setLevel(1); this.water.setFront(CHANNEL.toX + 0.35); }
    if (s === 'grow') { this.section.setWet(-0.22, 1); }
    if (s === 'firstBloom' || s === 'wave' || s === 'reveal' || s === 'end') {
      this.ground.setCut(0);
      this.section.group.visible = false;
      this.section.sprouts.mesh.visible = false;
      this.ground.setWet(new THREE.Vector2(0, CHANNEL.z), 2.0, 0.9);
    }
    if (s === 'wave' || s === 'reveal' || s === 'end') this.heroes.setLead(10.5);
    if (s === 'reveal' || s === 'end') { this.waveRadius = 340; this.env.u.uWaveRadius.value = 340; this.env.u.uWindAmp.value = 0.05; }
    this.enter(s);
    this.director.cut(this.currentShot(), 0);
  }

  private currentShot() {
    const map: Record<string, keyof typeof SHOTS> = {
      intro: 'intro', plant: 'plant', dive: 'section', water: 'section', seep: 'seep',
      grow: 'grow', surface: 'surface', firstBloom: 'firstBloom', wave: 'wave',
      reveal: 'reveal', end: 'end',
    };
    return SHOTS[map[this.state] ?? 'plant'];
  }
}
