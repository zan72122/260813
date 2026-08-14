import * as THREE from 'three';
import { Module } from './base.js';
import { CameraRig } from '../core/camera-rig.js';
import { L } from '../world/layout.js';
import { TILT } from './dock-nozzle.js';
import { Ease } from '../core/util.js';

const FULL_R = L.chocoFullR;

/**
 * Signature action B — 押す → チョコ注入, plus the cooling beat that closes the
 * hidden half of the game. Chocolate only moves while the finger is down. The
 * shell turns temporarily see-through (a cutaway, not a new object) so the
 * child can watch the front spread from the hole outwards, and it goes solid
 * again the moment the biscuit is full: the outside never gives the secret away.
 */
export class FillChoco extends Module {
  static verb = 'press-fill';
  static pip = 4;

  enter() {
    const { world, rig, hud, tween } = this.ctx;
    this.fill = 0;
    this.cutaway = 0;
    this.pressing = false;
    this.cooling = false;
    this.blob = 0;
    world.heroPivot.rotation.x = -TILT;
    world.holder.rotation.x = -TILT;
    if (world.nozzle.parent !== world.heroPivot) world.dockNozzleNow();
    rig.move(
      CameraRig.shot({
        look: [L.heroX, L.heroY - 0.3, 0.06],
        dir: [0.06, -0.5, 0.86],
        fitW: 1.5,
        fitH: 1.45,
      }),
      1.4,
    );
    tween.wait(1.2, () => {
      if (!this.done) hud.show('press');
    });
    this.tip = world.updateDock().clone();
  }

  down() {
    if (this.cooling) return;
    this.pressing = true;
    this.ctx.sound.loopOn('pour', { freq: 320, q: 0.8, gain: 0.1 });
  }

  up() {
    this.pressing = false;
    this.ctx.sound.loopOff('pour');
  }

  update(dt) {
    const { world, hud, sound, rig } = this.ctx;

    if (this.pressing && !this.cooling) {
      this.fill = Math.min(1, this.fill + dt * 0.4);
      this.blob = Math.min(1, this.blob + dt * 4);
      sound.loopSet('pour', { freq: 280 + this.fill * 520, gain: 0.11 });
      if (Math.random() < dt * 10) {
        world.puff(world.tank.position.clone().add(new THREE.Vector3(0.3, 0.55, 0)), {
          count: 1,
          color: 0x6b3a18,
          spread: 0.22,
          speed: 0.35,
          life: 0.45,
          size: 0.09,
        });
      }
    } else {
      this.blob = Math.max(0, this.blob - dt * 3);
    }

    // temporary x-ray: only while the chocolate is actually moving
    const want = this.cooling ? 0 : this.fill > 0.001 ? 1 : 0;
    this.cutaway += (want - this.cutaway) * (1 - Math.exp(-6 * dt));
    world.heroMats.setCutaway(this.cutaway * 0.95);
    world.choco.setFill(0.1 + this.fill * (FULL_R - 0.1));
    world.tank.scale.setScalar(1 + this.blob * 0.04 * Math.sin(world.time * 22));
    world.nozzle.scale.setScalar(1 + this.blob * 0.03 * Math.sin(world.time * 26));
    if (this.pressing) rig.shake(0.004);

    // "hold anywhere", so the finger sits low and never covers the cutaway
    this.ctx.anchorScreen(0.5, 0.8);
    hud.setProgress(this.fill);

    if (this.fill >= 1 && !this.cooling) this.startCooling();
  }

  startCooling() {
    this.cooling = true;
    const { world, sound, hud, tween, rig } = this.ctx;
    sound.loopOff('pour');
    sound.pop();
    hud.show(null);

    // nozzle backs off, biscuit turns face up again, cold air, done
    const from = world.nozzle.position.clone();
    const home = from.clone().add(new THREE.Vector3(0, -1.1, 0));
    tween.add({
      dur: 0.6,
      ease: Ease.inOut,
      update: (k) => world.nozzle.position.lerpVectors(from, home, k),
      done: () => (world.nozzle.visible = false),
    });
    tween.add({
      dur: 1.4,
      delay: 0.4,
      ease: Ease.inOut,
      update: (k) => {
        world.heroPivot.rotation.x = -TILT * (1 - k);
        world.holder.rotation.x = -TILT * (1 - k);
      },
    });
    world.fan.visible = true;
    tween.wait(0.5, () => {
      rig.move(
        CameraRig.shot({
          look: [L.heroX, L.heroY, 0],
          dir: [0.1, 0.26, 0.96],
          fitW: 2.1,
          fitH: 2.0,
        }),
        1.6,
      );
      sound.tone(880, 0.5, { type: 'sine', gain: 0.12, slide: -260 });
    });
    for (let i = 0; i < 7; i++) {
      tween.wait(0.7 + i * 0.14, () => {
        world.puff(new THREE.Vector3(L.heroX, L.heroY, 0), {
          count: 3,
          color: 0xd8f2ff,
          spread: 1.0,
          speed: 0.5,
          life: 1.0,
          size: 0.26,
        });
        this.ctx.sound.tone(1200 + Math.random() * 500, 0.2, { type: 'sine', gain: 0.05 });
      });
    }
    tween.wait(1.0, () => {
      world.choco.userData.fill.uFlow.value = 0; // set: the front stops glowing
    });
    this.finish(2.4);
  }

  exit() {
    const { world } = this.ctx;
    world.heroMats.setCutaway(0);
    world.choco.setFill(FULL_R);
    this.ctx.sound.loopOff('pour');
  }
}
