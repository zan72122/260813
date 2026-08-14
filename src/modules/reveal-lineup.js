import * as THREE from 'three';
import { Module } from './base.js';
import { CameraRig } from '../core/camera-rig.js';
import { L } from '../world/layout.js';
import { Ease } from '../core/util.js';

/**
 * The first wide shot of the whole game, at roughly 75% of the play time.
 * Up to here every camera has been a close-up: this is the moment the child
 * finally sees what the factory has been making — a whole tray of them.
 */
export class RevealLineup extends Module {
  static verb = 'reveal';
  static pip = 5;

  enter() {
    const { world, rig, hud, tween, sound } = this.ctx;
    hud.show(null);
    world.holder.visible = false;
    world.gantry.visible = false;
    world.fan.visible = false;
    world.tank.visible = false;
    world.line.visible = false;

    rig.move(
      CameraRig.shot({
        look: [L.trayX, 0.4, 0],
        dir: [0.1, 0.6, 0.79],
        fitW: 5.8,
        fitH: 4.8,
      }),
      2.9,
      Ease.inOut,
    );

    // the hero biscuit sails over and joins its brothers
    const from = world.hero.position.clone();
    const to = new THREE.Vector3(L.trayX - 1.6, 1.0, -0.9);
    tween.add({
      dur: 1.25,
      ease: Ease.inOut,
      update: (k) => {
        world.hero.position.lerpVectors(from, to, k);
        world.hero.position.y += Math.sin(k * Math.PI) * 1.5;
        world.heroPivot.rotation.z = k * Math.PI * 2;
        world.hero.scale.setScalar(1 - k * 0.25);
      },
      done: () => {
        world.hero.visible = false;
        world.hero.scale.setScalar(1);
        world.heroPivot.rotation.set(0, 0, 0);
      },
    });

    tween.wait(0.95, () => {
      world.tray.visible = true;
      sound.sparkle();
    });
    tween.add({
      dur: 2.0,
      delay: 1.0,
      ease: Ease.out,
      update: (k) => world.setTrayReveal(k),
    });
    this.chimed = 0;
    tween.wait(2.5, () => {
      hud.flash(0.42);
      sound.fanfare();
      for (let i = 0; i < 5; i++) {
        world.puff(new THREE.Vector3(L.trayX + (i - 2) * 2.2, 1.2, 0), {
          count: 6,
          color: 0xfff3c0,
          spread: 2.4,
          speed: 1.6,
          life: 1.4,
          size: 0.3,
        });
      }
    });
    this.finish(4.0);
  }

  update(dt) {
    void dt;
    this.ctx.hud.setProgress(0);
  }
}
