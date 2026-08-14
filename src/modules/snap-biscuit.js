import * as THREE from 'three';
import { Module } from './base.js';
import { CameraRig } from '../core/camera-rig.js';
import { L } from '../world/layout.js';
import { Ease, clamp01 } from '../core/util.js';

const PULL_PX = 84; // how far a small hand must drag before it goes "snap"

/**
 * Signature action C — 割る → 断面Reveal. Pick any biscuit, pull it sideways,
 * and it breaks: crumbly shell outside, a glossy chocolate core inside. The two
 * halves are real geometry that were sitting flush all along, so the
 * cross-section is the actual filling that was injected in module 5.
 */
export class SnapBiscuit extends Module {
  static verb = 'break';
  static pip = 5;

  enter() {
    const { world, hud, rig } = this.ctx;
    this.phase = 'pick';
    this.pull = 0;
    this.broken = false;
    this.trayShot = CameraRig.shot({
      look: [L.trayX, 0.45, 0],
      dir: [0.08, 0.72, 0.69],
      fitW: 5.2,
      fitH: 4.4,
    });
    this.closeUp = CameraRig.shot({
      look: [L.trayX, 2.6, 1.7],
      dir: [0.02, 0.16, 0.99],
      fitW: 1.35,
      fitH: 1.3,
    });
    this.openShot = CameraRig.shot({
      look: [L.trayX, 2.6, 1.7],
      dir: [0.02, 0.16, 0.99],
      fitW: 2.0,
      fitH: 1.9,
    });
    this.pickAnchor = new THREE.Vector3(L.trayX, 0.4, 0);
    // the reveal has normally parked us here already; this makes the stage
    // stand on its own if it is entered directly
    rig.move(this.trayShot, 0.6);
    world.hero.visible = false;
    hud.show('tap');
    hud.showSound(true);
  }

  down(p) {
    if (this.phase === 'pick') this.pick(p);
    else if (this.phase === 'done') this.backToTray();
  }

  move(p) {
    if (this.phase !== 'pull' || this.broken) return;
    this.pull = clamp01(this.pull + Math.abs(p.dx) / PULL_PX);
    if (this.pull >= 1) this.snap();
    else if (Math.abs(p.dx) > 1.5 && Math.random() < 0.25) {
      this.ctx.sound.burst(0.05, { freq: 2000 + this.pull * 1500, q: 2, gain: 0.06 });
    }
  }

  up() {
    if (this.phase === 'pull' && !this.broken) this.relax = true;
  }

  /** Tap a biscuit on the tray: exact hit if possible, nearest one otherwise. */
  pick(p) {
    const { world, sound, tween, hud, rig } = this.ctx;
    const hit = this.ctx.raycast(world.trayMesh, p);
    let id = hit ? hit.instanceId : -1;
    if (id < 0 || !world.trayAlive[id]) {
      id = this.ctx.nearestInstance(world.trayMesh, world.trayPos, world.trayAlive, p);
    }
    if (id < 0) return;

    this.phase = 'lift';
    hud.show(null);
    sound.click();
    sound.tone(700, 0.2, { type: 'sine', gain: 0.16, slide: 320 });
    const cell = world.trayCells[id];
    const from = world.trayPos[id].clone();
    world.hideTrayInstance(id);
    world.setHeroCell(cell);
    world.hero.visible = true;
    world.hero.position.copy(from);
    world.hero.scale.setScalar(1);
    world.heroPivot.rotation.set(0, 0, 0);
    world.setBroken(false);

    const to = new THREE.Vector3(L.trayX, 2.6, 1.7);
    rig.move(this.closeUp, 1.3, Ease.inOut);
    tween.add({
      dur: 1.15,
      ease: Ease.inOut,
      update: (k) => {
        world.hero.position.lerpVectors(from, to, k);
        world.heroPivot.rotation.x = (Math.PI / 2 - 0.12) * k;
      },
      done: () => {
        this.phase = 'pull';
        hud.show('pull');
      },
    });
  }

  snap() {
    const { world, sound, tween, hud, rig } = this.ctx;
    this.broken = true;
    this.phase = 'break';
    hud.show(null);
    sound.snap();
    rig.shake(0.16);
    hud.flash(0.5);
    world.puff(world.hero.position.clone(), {
      count: 16,
      color: 0xe9cb96,
      spread: 0.5,
      speed: 2.2,
      life: 0.9,
      size: 0.09,
    });
    rig.move(this.openShot, 0.7, Ease.out);
    world.setBroken(true);
    tween.add({
      dur: 0.55,
      ease: Ease.outBack,
      update: (k) => {
        // +Z hinge = the cut faces swing round to face the camera
        world.halves[0].position.x = -0.3 * k;
        world.halves[1].position.x = 0.3 * k;
        world.halves[0].rotation.z = 0.8 * k;
        world.halves[1].rotation.z = -0.8 * k;
        world.halves[0].position.z = 0.05 * k;
        world.halves[1].position.z = -0.05 * k;
      },
    });
    tween.wait(0.45, () => {
      sound.sparkle();
      world.puff(world.hero.position.clone(), {
        count: 10,
        color: 0xffe9a8,
        spread: 1.1,
        speed: 1.4,
        life: 1.2,
        size: 0.2,
      });
    });
    tween.wait(1.3, () => {
      this.phase = 'done';
      hud.show('tap');
      hud.showAgain(true);
    });
  }

  backToTray() {
    const { world, rig, hud, tween, sound } = this.ctx;
    this.phase = 'return';
    hud.show(null);
    hud.showAgain(false);
    sound.click();
    rig.move(this.trayShot, 1.2, Ease.inOut);
    const from = world.hero.position.clone();
    tween.add({
      dur: 0.8,
      ease: Ease.in,
      update: (k) => {
        world.hero.position.set(from.x, from.y - k * 2.5, from.z - k * 1.2);
        world.hero.scale.setScalar(1 - k * 0.9);
      },
      done: () => {
        world.hero.visible = false;
        world.hero.scale.setScalar(1);
        this.pull = 0;
        this.broken = false;
        this.relax = false;
        this.phase = 'pick';
        hud.show('tap');
      },
    });
  }

  update(dt) {
    const { world, hud } = this.ctx;
    if (this.phase === 'pull') {
      if (this.relax && !this.ctx.pointer.down) this.pull = Math.max(0, this.pull - dt * 0.8);
      const k = this.pull;
      // tension: it stretches and shivers, but stays one piece until it goes
      world.heroWhole.scale.set(1 + 0.06 * k, 1 - 0.03 * k, 1 - 0.02 * k);
      world.heroWhole.rotation.z = Math.sin(world.time * 34) * 0.03 * k;
      hud.setProgress(k);
      this.ctx.anchorAt(world.hero.position, 0, 86);
    } else if (this.phase === 'pick') {
      hud.setProgress(0);
      this.ctx.anchorAt(this.pickAnchor);
    } else if (this.phase === 'done') {
      hud.setProgress(0);
      this.ctx.anchorAt(this.pickAnchor);
    }
  }
}
