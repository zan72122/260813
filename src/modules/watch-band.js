import * as THREE from 'three';
import { Module } from './base.js';
import { CameraRig } from '../core/camera-rig.js';
import { L } from '../world/layout.js';
import { Ease } from '../core/util.js';

/**
 * Opening beat — "what is this?". A wide beige band flows in from the roll and
 * stops under a big drum. Nothing here hints at chocolate, or even at a
 * biscuit: the camera sees only endless pale dough.
 */
export class WatchBand extends Module {
  static verb = 'watch';
  static pip = -1;

  enter() {
    const { world, rig } = this.ctx;
    world.setBand(-3.2, 0);
    world.setLine(0, 0);
    world.beltSpeed = 1.4;
    this.advance = -3.2;
    this.anchor = new THREE.Vector3(L.printX - 1.6, 0.42, 0);

    rig.cut(
      CameraRig.shot({
        look: [L.rollX + 2.3, 0.85, 0],
        dir: [0.22, 0.82, 0.53],
        fitW: 5.4,
        fitH: 4.2,
      }),
    );
    rig.move(
      CameraRig.shot({
        look: [L.printX - 1.6, 0.68, 0],
        dir: [0.2, 0.8, 0.57],
        fitW: 3.8,
        fitH: 3.0,
      }),
      3.4,
      Ease.inOut,
    );
    this.ctx.tween.add({
      dur: 3.2,
      ease: Ease.out,
      update: (k) => {
        this.advance = -3.2 + k * 3.2;
        world.setBand(this.advance, 0);
      },
      done: () => {
        this.ready = true;
        this.ctx.hud.show('tap');
      },
    });
    // fail-safe: nobody is ever stuck on the title beat
    this.ctx.tween.wait(11, () => this.finish(0.1));
  }

  update(dt) {
    const { world, hud } = this.ctx;
    world.beltSpeed = Math.max(world.beltSpeed, this.ready ? 0.25 : 1.2);
    this.ctx.anchorAt(this.anchor);
    hud.setProgress(0);
    if (!this.ready) return;
    void dt;
  }

  down() {
    if (!this.ready) return;
    this.ctx.sound.click();
    this.finish(0.1);
  }

  exit() {
    this.ctx.world.setBand(0, 0);
  }
}
