import * as THREE from 'three';
import { Stage } from '../core/stage';
import { CameraRig } from '../core/camera';
import { Input, type DragState } from '../core/input';
import { Tweens } from '../core/tween';
import { Chimes } from '../core/audio';
import { Character } from '../scene/character';
import { Gem } from '../scene/gem';
import { Sparkles } from '../scene/sparkles';
import { HairSystem } from '../hair/hairSystem';
import { Hint, hintPulse } from './hint';
import { Hud } from '../ui/hud';
import { tickHairTime } from '../hair/materials';
import { TIMING, PALETTE, GEM as GEMLOCK } from '../style';
import { cubicOut, quartOut, backOut, sineInOut, wobble, clamp01, lerp } from '../core/ease';
import { dropT, DROP_COUNT, BRAID_CYCLES, COIL_TURNS } from '../hair/braidMath';

export type Phase = 'intro' | 'braid' | 'petal' | 'coil' | 'gem' | 'reveal';
type BraidVerb = 'cross' | 'drop' | 'pick';

/** The braid is a fixed poem: C (D P C) ×3 — four crossings, three waterfalls. */
const BRAID_SCRIPT: BraidVerb[] = ['cross', 'drop', 'pick', 'cross', 'drop', 'pick', 'cross', 'drop', 'pick', 'cross'];

/**
 * Game — the conductor. One verb, one target, one gesture, one visible
 * change per scene (docs/DESIGN_CONSTITUTION.md, interaction grammar).
 */
export class Game {
  readonly stage: Stage;
  readonly rig: CameraRig;
  readonly input: Input;
  readonly tweens = new Tweens();
  readonly chimes = new Chimes();
  readonly character = new Character();
  readonly hair = new HairSystem();
  readonly gem = new Gem();
  readonly sparkles: Sparkles;
  readonly hint: Hint;
  readonly hud: Hud;

  phase: Phase = 'intro';
  braidStep = 0;
  private dropIdx = 0;
  private busy = false; // a committed hair animation is playing
  private time = 0;
  private seenVerbs = new Set<string>();

  // gesture state
  private grabbing = false;
  private activePetal = -1;
  private petalStart = 0;
  private lastCoilAngle: number | null = null;
  private coilChimeMark = 0;
  private gemDragging = false;
  private gemBase = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();

  constructor(container: HTMLElement) {
    this.stage = new Stage(container);
    this.rig = new CameraRig();
    this.input = new Input(this.stage.renderer.domElement);
    this.sparkles = new Sparkles(this.stage.scene);
    this.hint = new Hint(this.stage.scene);
    this.hud = new Hud(container);

    this.stage.scene.add(this.character.group);
    this.stage.scene.add(this.hair.group);
    this.stage.scene.add(this.gem.group);

    this.input.handlers = {
      onDown: (d) => this.onDown(d),
      onDrag: (d) => this.onDrag(d),
      onUp: (d) => this.onUp(d)
    };
    this.hud.onReplay = () => this.replay();

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 60));

    this.begin();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.stage.resize(w, h);
    this.rig.setViewport(w, h);
  }

  // ---------- flow ----------

  private async begin(): Promise<void> {
    this.phase = 'intro';
    this.hud.showTitle();
    this.rig.jumpTo('establish');
    await this.tweens.wait(TIMING.introHold);
    this.hud.hideTitle();
    this.rig.moveTo('braid');
    this.phase = 'braid';
    this.braidStep = 0;
    this.dropIdx = 0;
    this.armStep();
  }

  private replay(): void {
    this.hud.hideReplay();
    this.gem.hide();
    this.stage.setSkyLift(0);
    this.hair.reset();
    this.character.group.rotation.set(0, 0, 0);
    this.seenVerbs.clear();
    this.chimes.unlock();
    this.phase = 'intro';
    this.busy = false;
    void (async () => {
      this.rig.moveTo('establish', 1.6);
      await this.tweens.wait(1.8);
      this.rig.moveTo('braid');
      this.phase = 'braid';
      this.braidStep = 0;
      this.dropIdx = 0;
      this.armStep();
    })();
  }

  private verb(): BraidVerb {
    return BRAID_SCRIPT[this.braidStep];
  }

  /** Prepare hints & targets for the current step. */
  private armStep(): void {
    for (const m of this.hair.trioMats) m.emissiveIntensity = 0;
    this.hair.pickMat.emissiveIntensity = 0;
    this.hair.tailMat.emissiveIntensity = 0;

    const firstTime = (v: string) => (this.seenVerbs.has(v) ? TIMING.hintDelay : 0.9);

    if (this.phase === 'braid') {
      const v = this.verb();
      const front = this.hair.frontPoint();
      if (v === 'cross') {
        const from = front.clone().add(new THREE.Vector3(0.16, 0.06, 0.06));
        const to = front.clone().add(new THREE.Vector3(-0.14, -0.02, 0.02));
        this.hint.show([from, from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 0.03, 0.04)), to], firstTime('cross'));
      } else if (v === 'drop') {
        const from = front.clone().add(new THREE.Vector3(0.05, -0.02, 0.05));
        const to = from.clone().add(new THREE.Vector3(0.02, -0.34, 0.05));
        this.hint.show([from, to], firstTime('drop'));
      } else {
        this.hair.showPick();
        const p = this.hair.pickStartPoint();
        this.hint.show([p.clone().add(new THREE.Vector3(0, 0.06, 0)), p], firstTime('pick'));
      }
    } else if (this.phase === 'petal') {
      let target = 0;
      for (let i = 0; i < this.hair.petalPulls.length; i++) {
        if (this.hair.petalPulls[i] < 0.5) {
          target = i;
          break;
        }
      }
      const p = this.hair.petalWorld(target);
      const out = this.hair.petalOutward();
      this.hint.show([p, p.clone().addScaledVector(out, 0.22)], firstTime('petal'));
    } else if (this.phase === 'coil') {
      const c = this.hair.flowerCenter();
      const n = this.hair.flowerNormal();
      const u = new THREE.Vector3(0, 1, 0).cross(n).normalize();
      const v2 = n.clone().cross(u).normalize();
      const path: THREE.Vector3[] = [];
      for (let i = 0; i <= 40; i++) {
        const t = i / 40;
        const th = t * Math.PI * 2 * 1.75;
        const r = 0.19 * (1 - 0.75 * t);
        path.push(c.clone().addScaledVector(u, Math.cos(th) * r).addScaledVector(v2, Math.sin(th) * r).addScaledVector(n, 0.05));
      }
      this.hint.show(path, firstTime('coil'));
    } else if (this.phase === 'gem') {
      const c = this.hair.flowerCenter().clone().addScaledVector(this.hair.flowerNormal(), 0.04);
      this.hint.show([this.gemBase.clone(), c], firstTime('gem'));
    }
  }

  private advanceBraid(): void {
    this.seenVerbs.add(this.verb());
    this.braidStep++;
    if (this.braidStep >= BRAID_SCRIPT.length) {
      // Braid complete → the tail appears, petals await.
      this.hair.setTrioVisible(false);
      this.hair.buildTail();
      this.hair.refreshTail();
      this.hint.hide();
      this.phase = 'petal';
      this.rig.moveTo('petal');
      this.armStep();
      return;
    }
    // Camera grammar: push in for the first drop, ease back after the first pick.
    if (this.braidStep === 1) this.rig.moveTo('closeup', 2.8);
    if (this.braidStep === 3) this.rig.moveTo('braid', 3.2);
    this.armStep();
  }

  // ---------- helpers ----------

  private ndcOf(world: THREE.Vector3): THREE.Vector2 {
    const p = world.clone().project(this.rig.camera);
    return new THREE.Vector2(p.x, p.y);
  }

  /** Screen distance in height-normalized units (isotropic). */
  private screenDist(world: THREE.Vector3, ndc: THREE.Vector2): number {
    const s = this.ndcOf(world);
    const dx = (s.x - ndc.x) * this.rig.camera.aspect;
    const dy = s.y - ndc.y;
    return Math.hypot(dx, dy);
  }

  /** Convert an NDC delta to a world-space offset at the depth of `at`. */
  private ndcDeltaToWorld(delta: THREE.Vector2, at: THREE.Vector3): THREE.Vector3 {
    const cam = this.rig.camera;
    const dist = at.clone().sub(cam.position).dot(cam.getWorldDirection(new THREE.Vector3()));
    const worldPerNdcY = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * dist;
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    return right
      .multiplyScalar(delta.x * worldPerNdcY * cam.aspect)
      .addScaledVector(up, delta.y * worldPerNdcY);
  }

  // ---------- input ----------

  private onDown(d: DragState): void {
    this.chimes.unlock();
    this.rig.hold(true);
    this.hint.calm();
    if (this.busy) return;

    if (this.phase === 'braid') {
      const v = this.verb();
      const front = this.hair.frontPoint();
      if (v === 'cross' || v === 'drop') {
        // Generous grab zone around the braid front — never punish a miss.
        if (this.screenDist(front, d.ndc) < 0.5) this.grabbing = true;
      } else if (v === 'pick') {
        if (this.screenDist(this.hair.pickStartPoint(), d.ndc) < 0.45) {
          void this.commitPick();
        }
      }
    } else if (this.phase === 'petal') {
      let best = -1;
      let bestDist = 0.42;
      for (let i = 0; i < this.hair.petalPulls.length; i++) {
        const dist = this.screenDist(this.hair.petalWorld(i), d.ndc);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      }
      if (best >= 0) {
        this.activePetal = best;
        this.petalStart = this.hair.petalPulls[best];
      }
    } else if (this.phase === 'coil') {
      const c = this.ndcOf(this.hair.flowerCenter());
      this.lastCoilAngle = Math.atan2(d.ndc.y - c.y, (d.ndc.x - c.x) * this.rig.camera.aspect);
    } else if (this.phase === 'gem') {
      if (this.screenDist(this.gem.group.position, d.ndc) < 0.5) this.gemDragging = true;
    }
  }

  private onDrag(d: DragState): void {
    if (this.busy) return;

    if (this.phase === 'braid' && this.grabbing) {
      const v = this.verb();
      const front = this.hair.frontPoint();
      const w = this.ndcDeltaToWorld(d.delta, front);
      // Live follow — the hair answers the finger before committing.
      this.hair.trioFollow.copy(w.clampLength(0, 0.09));
      this.hair.refreshTrio(1, v === 'drop' ? 1 : 0);

      const dx = d.delta.x * this.rig.camera.aspect;
      const dy = d.delta.y;
      if (v === 'cross' && dx < -0.10 && Math.abs(dx) > Math.abs(dy) * 0.8) {
        void this.commitCross();
      } else if (v === 'drop' && dy < -0.10 && Math.abs(dy) > Math.abs(dx) * 0.8) {
        void this.commitDrop();
      }
    } else if (this.phase === 'petal' && this.activePetal >= 0) {
      const i = this.activePetal;
      const p = this.hair.petalWorld(i);
      const outNdcA = this.ndcOf(p);
      const outNdcB = this.ndcOf(p.clone().addScaledVector(this.hair.petalOutward(), 0.1));
      const dir = new THREE.Vector2((outNdcB.x - outNdcA.x) * this.rig.camera.aspect, outNdcB.y - outNdcA.y).normalize();
      const amt = d.delta.x * this.rig.camera.aspect * dir.x + d.delta.y * dir.y;
      const prev = this.hair.petalPulls[i];
      this.hair.petalPulls[i] = clamp01(this.petalStart + amt * 3.2);
      if (Math.floor(prev * 4) !== Math.floor(this.hair.petalPulls[i] * 4)) {
        this.chimes.petal(this.hair.petalPulls[i]);
      }
      this.hair.refreshTail();
    } else if (this.phase === 'coil' && this.lastCoilAngle !== null) {
      const c = this.ndcOf(this.hair.flowerCenter());
      const a = Math.atan2(d.ndc.y - c.y, (d.ndc.x - c.x) * this.rig.camera.aspect);
      let da = a - this.lastCoilAngle;
      while (da > Math.PI) da -= Math.PI * 2;
      while (da < -Math.PI) da += Math.PI * 2;
      this.lastCoilAngle = a;
      const need = Math.PI * 2 * (COIL_TURNS + 0.4);
      this.hair.coil = clamp01(this.hair.coil + Math.abs(da) / need);
      this.hair.refreshTail();
      if (this.hair.coil - this.coilChimeMark > 0.18) {
        this.coilChimeMark = this.hair.coil;
        this.chimes.coilTick(this.hair.coil);
      }
      if (this.hair.coil >= 1) void this.finishCoil();
    } else if (this.phase === 'gem' && this.gemDragging) {
      // Gem rides a camera-facing plane through the flower center.
      const cam = this.rig.camera;
      this.raycaster.setFromCamera(d.ndc, cam);
      const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(
        cam.getWorldDirection(new THREE.Vector3()).negate(),
        this.hair.flowerCenter()
      );
      const hit = new THREE.Vector3();
      if (this.raycaster.ray.intersectPlane(plane, hit)) {
        this.gem.group.position.copy(hit);
        const dist = hit.distanceTo(this.hair.flowerCenter());
        this.gem.pulse = clamp01(1 - dist / 0.35);
        if (dist < 0.09) void this.commitGem();
      }
    }
  }

  private onUp(_d: DragState): void {
    this.rig.hold(false);
    if (this.phase === 'braid' && this.grabbing && !this.busy) {
      // Not enough — the strand breathes back. No penalty, no sound of failure.
      this.grabbing = false;
      const from = this.hair.trioFollow.clone();
      this.tweens.run(0.4, (t) => {
        this.hair.trioFollow.copy(from).multiplyScalar(1 - t);
        this.hair.refreshTrio(1, this.verb() === 'drop' ? 1 : 0);
      }, backOut(1.4));
    }
    this.grabbing = false;
    this.activePetal = -1;
    this.lastCoilAngle = null;
    if (this.phase === 'petal' && !this.busy) this.checkPetalDone();
    if (this.phase === 'gem' && this.gemDragging && !this.busy) {
      this.gemDragging = false;
      const from = this.gem.group.position.clone();
      this.tweens.run(0.7, (t) => {
        this.gem.group.position.copy(from).lerp(this.gemBase, t);
        this.gem.pulse = lerp(this.gem.pulse, 0, t);
      }, sineInOut);
    }
  }

  // ---------- committed animations (the poems) ----------

  private async commitCross(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.grabbing = false;
    this.hint.hide();
    this.chimes.cross();
    const p0 = this.hair.braidProgress;
    const p1 = Math.min(p0 + 1 / BRAID_CYCLES, 1);
    const follow0 = this.hair.trioFollow.clone();
    await this.tweens.play(TIMING.crossDuration, (t) => {
      this.hair.setBraidProgress(lerp(p0, p1, t));
      this.hair.trioFollow.copy(follow0).multiplyScalar(1 - t);
      // The fan closes as the weave eats it, then reopens for the next verse.
      const fan = 1 - Math.sin(t * Math.PI) * 0.45;
      this.hair.refreshTrio(fan, 0);
    }, cubicOut);
    this.hair.refreshTrio(1, 0);
    this.busy = false;
    this.advanceBraid();
  }

  private async commitDrop(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.grabbing = false;
    this.hint.hide();
    this.chimes.whoosh();
    const k = this.hair.lowestTrioIndex();
    this.hair.hideTrioStrand(k, true);
    this.hair.trioFollow.set(0, 0, 0);
    this.hair.refreshTrio(1, 0);
    const fi = this.hair.spawnFall(dropT(this.dropIdx));
    const wobbleAmp = 1;
    await this.tweens.play(TIMING.dropDuration, (t) => {
      // Gravity first, then a feather-settle at the end.
      const fall = cubicOut(Math.min(t * 1.25, 1));
      const settle = fall + wobble(t, 2) * 0.04 * wobbleAmp;
      this.hair.setFall(fi, clamp01(settle));
    }, (t) => t);
    this.dropIdx = Math.min(this.dropIdx + 1, DROP_COUNT - 1 + 1);
    this.busy = false;
    this.advanceBraid();
  }

  private async commitPick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.hint.hide();
    this.chimes.pick();
    const k = this.hair.lowestTrioIndex();
    await this.tweens.play(TIMING.pickDuration, (t) => {
      this.hair.setPickAnim(t);
    }, sineInOut);
    this.hair.hidePick();
    this.hair.hideTrioStrand(k, false);
    this.hair.refreshTrio(1, 0);
    this.sparkles.burst(this.hair.frontPoint(), PALETTE.moteWarm, 8, 0.15);
    this.busy = false;
    this.advanceBraid();
  }

  private checkPetalDone(): void {
    const done = this.hair.petalPulls.filter((p) => p >= 0.5).length;
    if (done >= 3) {
      this.busy = true;
      this.hint.hide();
      void (async () => {
        await this.tweens.wait(0.7);
        this.phase = 'coil';
        this.coilChimeMark = 0;
        this.rig.moveTo('coil');
        this.busy = false;
        this.armStep();
      })();
    } else {
      this.armStep();
    }
  }

  private async finishCoil(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.hint.hide();
    // The last breath of the bloom: a soft overshoot as petals relax open.
    await this.tweens.play(TIMING.petalSpring + 0.45, (t) => {
      this.hair.coil = 1 + Math.sin(t * Math.PI) * 0.02;
      this.hair.refreshTail();
    }, sineInOut);
    this.hair.coil = 1;
    this.hair.refreshTail();
    this.phase = 'gem';
    this.rig.moveTo('gem');
    this.gemBase = this.hair
      .flowerCenter()
      .clone()
      .addScaledVector(this.hair.flowerNormal(), 0.26)
      .add(new THREE.Vector3(0, 0.10, 0));
    this.gem.show(this.gemBase);
    this.tweens.run(0.8, (t) => this.gem.group.scale.setScalar(t), backOut(1.6));
    this.sparkles.burst(this.gemBase, PALETTE.gemCore, 10, 0.12);
    this.busy = false;
    this.armStep();
  }

  private async commitGem(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.gemDragging = false;
    this.hint.hide();
    const target = this.hair.flowerCenter().clone().addScaledVector(this.hair.flowerNormal(), 0.045);
    const from = this.gem.group.position.clone();
    // 1. the magnet breath — it wants to be there
    await this.tweens.play(TIMING.gemSnapDuration, (t) => {
      this.gem.group.position.copy(from).lerp(target, t);
      this.gem.pulse = t;
    }, quartOut);
    this.chimes.gemSnap();
    // 2. the press — in, squash, and a ring of light
    const pressed = target.clone().addScaledVector(this.hair.flowerNormal(), -0.02);
    await this.tweens.play(TIMING.gemPressDuration, (t) => {
      const k = Math.sin(t * Math.PI);
      this.gem.group.position.copy(target).lerp(pressed, k);
      this.gem.group.scale.set(1 + k * 0.18, 1 - k * 0.22, 1 + k * 0.18);
    }, sineInOut);
    this.sparkles.burst(target, PALETTE.gemSpark, 22, 0.3);
    // 3. the settle — flower and gem share a tiny after-tremble
    await this.tweens.play(TIMING.gemJiggleDuration, (t) => {
      const w = wobble(t, 3);
      this.gem.group.scale.set(1 + w * 0.06, 1 - w * 0.06, 1 + w * 0.06);
      this.hair.jiggleFlower(w);
    }, (t) => t);
    this.hair.jiggleFlower(0);
    this.gem.pulse = 0.4;
    this.gem.mat.emissiveIntensity = GEMLOCK.emissiveIntensityIdle;
    this.busy = false;
    void this.reveal();
  }

  private async reveal(): Promise<void> {
    this.phase = 'reveal';
    this.hint.hide();
    this.chimes.reveal();
    this.rig.moveTo('reveal', TIMING.revealHold);
    // The world answers the finished flower: the lagoon glow rises a little,
    // and a few light seeds drift off the petals. Quietly.
    this.tweens.run(4.0, (t) => this.stage.setSkyLift(t), sineInOut);
    this.sparkles.burst(this.hair.flowerCenter(), PALETTE.gemSpark, 14, 0.18);
    // Let the piece breathe. Nothing to do, nothing to press — just look.
    await this.tweens.wait(TIMING.revealHold + 1.2);
    if (this.phase === 'reveal') this.hud.showReplay();
  }

  // ---------- test hook: perform the current expected gesture ----------

  async autoAdvance(): Promise<void> {
    while (this.busy) await this.tweens.wait(0.05);
    if (this.phase === 'intro') {
      await this.tweens.wait(TIMING.introHold + 0.4);
      return;
    }
    if (this.phase === 'braid') {
      const v = this.verb();
      if (v === 'cross') await this.commitCross();
      else if (v === 'drop') await this.commitDrop();
      else await this.commitPick();
    } else if (this.phase === 'petal') {
      for (let i = 0; i < this.hair.petalPulls.length; i++) {
        if (this.hair.petalPulls[i] < 0.5) {
          this.hair.petalPulls[i] = 0.55 + 0.25 * ((i * 37) % 10) / 10;
          this.hair.refreshTail();
          break;
        }
      }
      this.checkPetalDone();
      await this.tweens.wait(0.1);
    } else if (this.phase === 'coil') {
      this.hair.coil = 1;
      this.hair.refreshTail();
      await this.finishCoil();
    } else if (this.phase === 'gem') {
      this.gem.group.position.copy(this.hair.flowerCenter());
      await this.commitGem();
    }
  }

  // ---------- frame ----------

  tick(dt: number): void {
    this.time += dt;
    this.tweens.tick(dt);
    this.input.tick(dt);
    this.rig.tick(dt);
    this.stage.tick(dt);
    this.gem.tick(dt);
    this.sparkles.tick(dt);
    tickHairTime(this.stage.time);
    this.hint.tick(dt, this.input.down);

    // Gem bobs while waiting to be placed.
    if (this.phase === 'gem' && !this.gemDragging && !this.busy) {
      const bob = Math.sin(this.time * 1.6) * 0.02;
      this.gem.group.position.copy(this.gemBase).add(new THREE.Vector3(0, bob, 0));
    }

    // Hint target glow — one target at a time, breathing softly.
    if (!this.busy && !this.input.down) {
      const pulse = hintPulse(this.time);
      if (this.phase === 'braid') {
        const v = this.verb();
        if (v === 'drop') {
          this.hair.trioMats[this.hair.lowestTrioIndex()].emissiveIntensity = pulse;
        } else if (v === 'pick') {
          this.hair.pickMat.emissiveIntensity = pulse * 1.4;
        } else {
          for (const m of this.hair.trioMats) m.emissiveIntensity = pulse * 0.5;
        }
      } else if (this.phase === 'petal') {
        this.hair.tailMat.emissiveIntensity = pulse * 0.5;
      } else {
        this.hair.tailMat.emissiveIntensity = 0;
      }
    }

    const tilt = this.phase === 'petal' || this.phase === 'coil' || this.phase === 'gem' ? 1 : 0;
    this.character.tick(dt, tilt);

    this.stage.render(this.rig.camera);
  }
}
