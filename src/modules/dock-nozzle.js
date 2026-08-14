import * as THREE from 'three';
import { Module } from './base.js';
import { CameraRig } from '../core/camera-rig.js';
import { L, biscuitX } from '../world/layout.js';
import { Ease } from '../core/util.js';

export const TILT = 1.05; // how far the claw tips the biscuit to show its back

/**
 * 差す → ノズル接続. First the camera swings *under* the line: the biscuit does
 * not move, the viewpoint does, which is what makes "there is another side to
 * this thing" land. Down there is a small hole nobody has seen yet. Drag the
 * nozzle to it; it snaps home magnetically, because a 4 year old cannot hit a
 * 6 mm target.
 */
export class DockNozzle extends Module {
  static verb = 'plug';
  static pip = 3;

  enter() {
    const { world, rig, hud, tween } = this.ctx;
    this.snapped = false;
    const startX = biscuitX(0, L.cells) + L.bakePush;

    world.setLine(L.cells, L.bakePush);
    world.lineMats.setBakeAll(1);
    world.hideLineInstance(0);
    world.setHeroCell(L.cells - 1); // biscuit 0 carries the first printed face
    world.hero.visible = true;
    world.hero.position.set(startX, L.thickness / 2 + 0.03, 0);
    world.heroPivot.rotation.set(0, 0, 0);
    world.heroMats.setCutaway(0);
    world.choco.setFill(0);
    world.holder.visible = false;
    world.gantry.visible = true;
    world.tank.visible = true;

    // 1) lift it off the belt, still seen from above: only a small pale biscuit
    rig.move(
      CameraRig.shot({
        look: [L.heroX, L.heroY - 0.25, 0],
        dir: [0.12, 0.5, 0.86],
        fitW: 2.0,
        fitH: 1.9,
      }),
      1.5,
      Ease.inOut,
    );
    tween.add({
      dur: 1.3,
      ease: Ease.outQuad,
      update: (k) => {
        world.hero.position.x = startX + (L.heroX - startX) * k;
        world.hero.position.y = L.thickness / 2 + 0.03 + (L.heroY - L.thickness / 2 - 0.03) * k;
      },
      done: () => {
        world.holder.visible = true;
        this.ctx.sound.click();
      },
    });

    // 2) and now go around underneath: the camera dips while the claw tips the
    //    biscuit over, so its back is square to the lens
    tween.wait(1.7, () => {
      rig.move(
        CameraRig.shot({
          look: [L.heroX, L.heroY - 0.34, 0.1],
          dir: [0.06, -0.5, 0.86],
          fitW: 1.75,
          fitH: 1.65,
        }),
        2.0,
        Ease.inOut,
      );
      tween.add({
        dur: 1.8,
        ease: Ease.inOut,
        update: (k) => {
          world.heroPivot.rotation.x = -TILT * k;
          world.holder.rotation.x = -TILT * k;
        },
      });
      this.ctx.sound.tone(300, 0.5, { type: 'sine', gain: 0.12, slide: 140 });
    });
    tween.wait(3.5, () => {
      world.updateDock();
      world.nozzle.visible = true;
      world.nozzle.position.copy(world.nozzleHome);
      world.nozzle.rotation.x = -TILT;
      hud.show('drag', -90); // the nozzle waits below the hole: push it up
      this.grabbable = true;
    });
    this.tmp = new THREE.Vector3();
  }

  move(p) {
    const { world } = this.ctx;
    if (!this.grabbable || this.snapped) return;
    // 1.5x gearing: one comfortable little swipe should reach the hole
    const upp = this.ctx.unitsPerPixel(world.nozzle.position) * 1.5;
    world.nozzle.position.x += p.dx * upp;
    world.nozzle.position.y -= p.dy * upp;
    world.nozzle.position.x = THREE.MathUtils.clamp(world.nozzle.position.x, L.heroX - 0.9, L.heroX + 0.9);
    world.nozzle.position.y = THREE.MathUtils.clamp(world.nozzle.position.y, L.heroY - 2.0, L.heroY - 0.12);
    this.tryDock();
  }

  tryDock() {
    const { world, sound, rig, tween } = this.ctx;
    const d = world.nozzle.position.distanceTo(world.updateDock());
    if (d > 0.42) return;
    this.snapped = true;
    this.ctx.hud.show(null);
    const from = world.nozzle.position.clone();
    const to = world.nozzleDock.clone();
    tween.add({
      dur: 0.22,
      ease: Ease.outBack,
      update: (k) => world.nozzle.position.lerpVectors(from, to, k),
      done: () => world.dockNozzleNow(),
    });
    sound.click();
    sound.tone(180, 0.18, { type: 'square', gain: 0.16 });
    rig.shake(0.035);
    world.puff(world.nozzleDock.clone(), {
      count: 6,
      color: 0xfff0cf,
      spread: 0.3,
      speed: 0.7,
      life: 0.5,
      size: 0.1,
    });
    this.finish(0.7);
  }

  update() {
    const { world, hud } = this.ctx;
    this.ctx.anchorAt(this.snapped ? world.nozzleDock : world.nozzle.position, 0, 62);
    hud.setProgress(0);
    if (this.grabbable && !this.snapped) {
      // gentle bob so the loose nozzle reads as grabbable
      world.nozzle.position.y += Math.sin(world.time * 3) * 0.0015;
    }
  }
}
