import * as THREE from 'three';
import { Module } from './base.js';
import { CameraRig } from '../core/camera-rig.js';
import { L } from '../world/layout.js';
import { clamp, clamp01, lerp } from '../core/util.js';

/**
 * 通す → 焼き色. Push the batch through the oven with one long drag. The tint
 * and the puff are computed from each biscuit's world X against a bake line
 * inside the oven, so the colour change happens exactly where the child pushes
 * them — pale on the left of the line, golden and swollen on the right.
 */
export class BakeOven extends Module {
  static verb = 'push-bake';
  static pip = 2;

  enter() {
    const { world, rig, hud } = this.ctx;
    this.offset = 0;
    this.vel = 0;
    this.steam = 0;
    world.setBand(L.cells * 2, L.cells);
    world.setLine(L.cells, 0);
    world.lineMats.setBake(L.bakeLine, 0.05);
    world.lineMats.forEach((m) => (m.userData.bake.uBakeSpan.value = L.bakeSpan));
    this.lookFrom = 11.0;
    this.lookTo = 15.2;
    rig.move(
      CameraRig.shot({
        look: [this.lookFrom, 0.75, 0],
        dir: [0.05, 0.58, 0.81],
        fitW: 4.6,
        fitH: 3.6,
      }),
      1.7,
    );
    this.anchor = new THREE.Vector3(9.4, 0.55, 0.8);
    this.ctx.tween.wait(1.6, () => hud.show('drag'));
  }

  move(p) {
    if (this.done) return;
    const k = this.ctx.unitsPerPixel(this.anchor) * 1.6;
    const d = p.dx * k;
    this.offset = clamp(this.offset + d, 0, L.bakePush);
    if (d > 0) this.vel = Math.max(this.vel, d * 30);
  }

  update(dt) {
    const { world, hud, sound } = this.ctx;
    if (!this.ctx.pointer.down && this.vel > 0.02) {
      this.offset = clamp(this.offset + this.vel * dt, 0, L.bakePush);
      this.vel *= Math.exp(-3.4 * dt);
    }
    const k = this.offset / L.bakePush;
    world.setLine(L.cells, this.offset);
    world.beltSpeed = Math.max(world.beltSpeed, this.vel * 0.4);
    world.setOvenHeat(clamp01(k * 3.2));

    const rig = this.ctx.rig;
    if (!rig.moving) rig.to.look.x = lerp(this.lookFrom, this.lookTo, k);
    this.anchor.x = lerp(9.4, 15.0, k);

    const busy = this.ctx.pointer.down || this.vel > 0.3;
    if (busy && k > 0.06) {
      sound.loopOn('oven', { freq: 900, q: 0.6, gain: 0.09 });
      sound.loopSet('oven', { freq: 700 + k * 900, gain: 0.05 + 0.06 * clamp01(this.vel) });
      this.steam -= dt;
      if (this.steam < 0) {
        this.steam = 0.12;
        world.puff(new THREE.Vector3(L.bakeLine + (Math.random() - 0.5) * 3, 2.0, 0.2), {
          count: 2,
          color: 0xfff3e0,
          spread: 0.5,
          speed: 0.8,
          life: 1.1,
          size: 0.34,
        });
      }
    } else {
      sound.loopOff('oven');
    }

    this.ctx.anchorAt(this.anchor);
    hud.setProgress(k);
    if (k >= 0.999) {
      sound.loopOff('oven');
      sound.pop();
      this.finish(1.0);
    }
  }

  exit() {
    this.ctx.sound.loopOff('oven');
    this.ctx.world.lineMats.setBakeAll(1);
  }
}
