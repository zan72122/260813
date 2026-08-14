import * as THREE from 'three';
import { Module } from './base.js';
import { CameraRig } from '../core/camera-rig.js';
import { L } from '../world/layout.js';

const TAU = Math.PI * 2;

/**
 * 回す → 型抜き. Same gesture as the printer so the child reuses what they just
 * learned, but now the long band is eaten by the blades and drops out the far
 * side as separate little biscuits. Each cut is one clack, one crumb puff and
 * one small camera kick.
 */
export class CutRoller extends Module {
  static verb = 'turn-cut';
  static pip = 1;

  enter() {
    const { world, rig, hud } = this.ctx;
    this.spin = 0;
    this.cut = 0;
    this.cutCount = 0;
    this.center = new THREE.Vector3(L.cutX, L.cutR + 0.06, 0);
    world.setBand(L.cells, 0);
    world.setLine(0, 0);
    rig.move(
      CameraRig.shot({
        look: [L.cutX + 0.45, 0.45, 0],
        dir: [0.12, 0.5, 0.86],
        fitW: 3.9,
        fitH: 3.2,
      }),
      1.6,
    );
    this.ctx.tween.wait(1.5, () => hud.show('rotate'));
  }

  move(p) {
    if (this.done) return;
    const { world, sound } = this.ctx;
    const c = this.ctx.toScreen(this.center);
    const d = p.angleAround(c.x, c.y);
    if (!d) return;
    this.spin -= d;
    world.cutDrum.rotation.z = this.spin;
    const before = this.cut;
    this.cut = Math.min(L.cells, this.cut + (Math.abs(d) / TAU) * L.cells);
    if (this.cut > before) {
      world.beltSpeed = Math.max(world.beltSpeed, 1.2);
      sound.loopOn('roll', { freq: 300, q: 0.9, gain: 0.05 });
    }
  }

  up() {
    this.ctx.sound.loopOff('roll');
  }

  update(dt) {
    const { world, hud, sound, rig } = this.ctx;
    void dt;
    world.setBand(L.cells + this.cut, this.cut);
    world.setLine(this.cut, 0);

    const n = Math.floor(this.cut);
    while (this.cutCount < n) {
      sound.cut();
      rig.shake(0.05);
      world.puff(new THREE.Vector3(L.cutX + 0.1, 0.28, 0), {
        count: 6,
        color: 0xf1dcb0,
        spread: 0.34,
        speed: 1.1,
        life: 0.6,
        size: 0.1,
      });
      this.cutCount++;
    }

    this.ctx.anchorAt(this.center);
    hud.setProgress(this.cut / L.cells);
    if (this.cut >= L.cells - 0.001) {
      sound.loopOff('roll');
      this.finish(0.9);
    }
  }
}
