import * as THREE from 'three';
import { Module } from './base.js';
import { CameraRig } from '../core/camera-rig.js';
import { L } from '../world/layout.js';
import { clamp01 } from '../core/util.js';

const TAU = Math.PI * 2;

/**
 * Signature action A — 回す → 印刷.
 * The drum carries eight engraved animal plates; one full turn of the finger
 * prints the whole batch, so the drum and the band stay visibly in sync. The
 * drum follows the fingertip in both directions with zero smoothing, and any
 * turning at all makes progress, because a 4 year old's circle is not a circle.
 */
export class PrintRoller extends Module {
  static verb = 'turn-print';
  static pip = 0;

  enter() {
    const { world, rig, hud } = this.ctx;
    this.spin = 0;
    this.advance = 0;
    this.printed = 0;
    this.turning = 0;
    this.center = new THREE.Vector3(L.printX, L.printR + 0.09, 0);
    world.setBand(0, 0);
    rig.move(
      CameraRig.shot({
        look: [L.printX + 0.55, 0.5, 0],
        dir: [0.11, 0.58, 0.81],
        fitW: 3.9,
        fitH: 3.2,
      }),
      1.5,
    );
    this.ctx.tween.wait(1.4, () => hud.show('rotate'));
  }

  down() {
    this.ctx.sound.unlock();
  }

  move(p) {
    if (this.done) return;
    const { world, sound } = this.ctx;
    const c = this.ctx.toScreen(this.center);
    const d = p.angleAround(c.x, c.y);
    if (!d) return;
    // the drum tracks the finger exactly; the band only ever goes forward, so
    // scrubbing back and forth never rubs the printed animals out
    this.spin -= d;
    world.printDrum.rotation.z = this.spin;
    const before = this.advance;
    this.advance = Math.min(L.cells, this.advance + (Math.abs(d) / TAU) * L.cells);
    if (this.advance > before) {
      this.turning = 0.18;
      world.beltSpeed = Math.max(world.beltSpeed, ((this.advance - before) / 0.016) * 0.3);
      sound.loopOn('roll', { freq: 380, q: 0.9, gain: 0.05 });
    }
  }

  up() {
    this.ctx.sound.loopOff('roll');
  }

  update(dt) {
    const { world, hud, sound } = this.ctx;
    this.turning = Math.max(0, this.turning - dt);
    if (this.turning <= 0) sound.loopOff('roll');

    world.setBand(this.advance, 0);
    for (let t = L.cells - 1; t >= 0; t--) {
      const p = clamp01(this.advance - (L.cells - 1 - t));
      if (Math.abs(p - world.strip.progress[t]) > 0.008) {
        world.strip.printCell(t, world.animalFor(t), p);
      }
    }

    const n = Math.floor(this.advance);
    while (this.printed < n) {
      // a face has just finished rolling out from under the drum
      sound.chime(this.printed);
      world.puff(new THREE.Vector3(L.printX + 0.55, 0.12, (this.printed % 2 ? 0.3 : -0.3)), {
        count: 4,
        color: 0xfff0cf,
        spread: 0.3,
        speed: 0.5,
        life: 0.5,
        size: 0.12,
      });
      this.printed++;
    }

    this.ctx.anchorAt(this.center);
    hud.setProgress(this.advance / L.cells);
    if (this.advance >= L.cells - 0.001) {
      sound.loopOff('roll');
      this.finish(0.9);
    }
  }
}
