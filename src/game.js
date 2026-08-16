import * as THREE from '../lib/three.module.js';
import { POOLS, WASH, WATER_Y } from './world.js';
import { HOUSE_POS } from './spirits.js';
import { DYE } from './dye.js';
import { clamp, lerp, damp } from './util.js';

// Orchestrates one-finger play:
//   drag the sponge → touch coloured water → dye soaks in →
//   colours meet + blend inside → carry to a white thing →
//   hold still to squeeze → liquid drips out → colour spreads → reward.
// A gentle staged tutorial (glowing halos only, never text) leads into
// free play. Nothing is ever locked and nothing can fail.

const CARRY_Y = 0.55;
const DIP_Y = 0.36;
const PLAY = { minX: -6.4, maxX: 6.6, minZ: -4.9, maxZ: 4.6 };
const SPONGE_HALF_Y = 0.42;

export class Game {
  constructor({ scene, camera, renderer, sponge, world, targets, fx, spirits, garden }) {
    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.sponge = sponge;
    this.world = world;
    this.targets = targets;
    this.fx = fx;
    this.spirits = spirits;
    this.garden = garden;

    this.time = 0;
    this.dragging = false;
    this.dragTarget = new THREE.Vector3(0, 0, 0.8);
    this.holdStill = 0;
    this.squeeze = 0;       // 0..1 squash envelope
    this.squeezing = false;
    this.dripTimer = 0;
    this.absorbFxTimer = 0;
    this.washFxTimer = 0;
    this._squeezeSession = null; // {conc, painted} — locked per squeeze hold
    this.mixFocus = 0;      // seconds left of "watch the colours blend" zoom
    this.mixSeen = false;
    this.rewardFocus = null; // {point, timer}
    this.activePool = null;
    this.hoverTarget = null;
    this.stage = 'dip1';
    this.stageTimer = 0;
    this.washHint = 0;

    this.vel = new THREE.Vector3();
    this._prevPos = new THREE.Vector3();
    this._liquid = new THREE.Color();
    this._v1 = new THREE.Vector3();
    this._v2 = new THREE.Vector3();
    this._v3 = new THREE.Vector3();

    sponge.group.position.set(0, CARRY_Y, 0.8);
    this._prevPos.copy(sponge.group.position);

    for (const t of targets) t.onComplete = (target) => this._onTargetComplete(target);

    // Spirits: keep-out zones for wandering + celebrate every birth.
    if (spirits) {
      spirits.obstacles = [
        ...POOLS.map((p) => ({ x: p.pos.x, z: p.pos.z, r: p.radius + 0.5 })),
        { x: WASH.pos.x, z: WASH.pos.z, r: WASH.radius + 0.5 },
        { x: HOUSE_POS.x, z: HOUSE_POS.z, r: 1.3 },
        ...targets.map((t) => ({ x: t.worldPos.x, z: t.worldPos.z, r: 0.8 })),
      ];
      spirits.onBirth = (spirit) => {
        this.rewardFocus = {
          point: spirit.group.position.clone().setY(0.55),
          timer: 2.4,
        };
      };
    }

    // Camera rig state
    this.camPos = new THREE.Vector3();
    this.camLook = new THREE.Vector3(0, 0.6, -0.5);
    this._baseUpdated = false;
  }

  // ------------------------------------------------------------ input

  attachInput(dom) {
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const hit = new THREE.Vector3();
    const toWorld = (e) => {
      const r = dom.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, this.camera);
      if (ray.ray.intersectPlane(plane, hit)) return hit;
      return null;
    };
    dom.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const w = toWorld(e);
      if (w) this.pointerDown(w.x, w.z);
      dom.setPointerCapture(e.pointerId);
    });
    dom.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      e.preventDefault();
      const w = toWorld(e);
      if (w) this.pointerMove(w.x, w.z);
    });
    const up = (e) => {
      e.preventDefault();
      this.pointerUp();
    };
    dom.addEventListener('pointerup', up);
    dom.addEventListener('pointercancel', up);
  }

  pointerDown(x, z) {
    this.dragging = true;
    this.holdStill = 0;
    this._setDragTarget(x, z);
  }

  pointerMove(x, z) {
    if (!this.dragging) return;
    const dx = x - this.dragTarget.x;
    const dz = z - this.dragTarget.z;
    if (dx * dx + dz * dz > 0.12 * 0.12) this.holdStill = 0;
    this._setDragTarget(x, z);
  }

  pointerUp() {
    this.dragging = false;
    this.holdStill = 0;
  }

  _setDragTarget(x, z) {
    this.dragTarget.x = clamp(x, PLAY.minX, PLAY.maxX);
    this.dragTarget.z = clamp(z, PLAY.minZ, PLAY.maxZ);
  }

  // ---------------------------------------------------------- helpers

  _poolAt(pos) {
    for (const p of this.world.pools) {
      const dx = pos.x - p.def.pos.x, dz = pos.z - p.def.pos.z;
      if (dx * dx + dz * dz < (p.def.radius - 0.02) ** 2) return p;
    }
    return null;
  }

  _inWash(pos) {
    const dx = pos.x - WASH.pos.x, dz = pos.z - WASH.pos.z;
    return dx * dx + dz * dz < (WASH.radius - 0.02) ** 2;
  }

  _targetAt(pos) {
    let best = null, bestD = 1.35;
    for (const t of this.targets) {
      if (t.id === 'butterfly' && t.flying) continue;
      const d = Math.hypot(pos.x - t.worldPos.x, pos.z - t.worldPos.z);
      if (d < bestD) { bestD = d; best = t; }
    }
    return best;
  }

  // ------------------------------------------------------------ update

  update(dt) {
    dt = Math.min(dt, 1 / 20);
    this.time += dt;
    const sponge = this.sponge;
    const pos = sponge.group.position;

    // Where is the sponge?
    this.activePool = this._poolAt(pos);
    const inWash = this._inWash(pos);
    this.hoverTarget = !this.activePool && !inWash ? this._targetAt(pos) : null;

    // --- height: dip into water, rise above targets, else carry height
    let wantY = CARRY_Y;
    if (this.activePool || inWash) wantY = DIP_Y;
    else if (this.hoverTarget) {
      // Hover well above the target so the falling drops (and the thing
      // they colour) stay visible under the sponge.
      this.hoverTarget.focusPoint(this._v1);
      wantY = Math.max(CARRY_Y, this._v1.y + SPONGE_HALF_Y + 1.05);
    }
    // Float over the spirits' mushroom house instead of sinking into it.
    if (Math.hypot(pos.x - HOUSE_POS.x, pos.z - HOUSE_POS.z) < 1.7) {
      wantY = Math.max(wantY, 2.15);
    }

    // --- horizontal follow
    if (this.dragging) {
      const f = damp(9, dt);
      pos.x += (this.dragTarget.x - pos.x) * f;
      pos.z += (this.dragTarget.z - pos.z) * f;
      this.holdStill += dt;
    }
    pos.y += (wantY - pos.y) * damp(6, dt);

    // velocity → playful tilt
    this.vel.copy(pos).sub(this._prevPos).divideScalar(Math.max(dt, 1e-4));
    this._prevPos.copy(pos);
    const tilt = damp(8, dt);
    sponge.inner.rotation.z += (clamp(-this.vel.x * 0.06, -0.4, 0.4) - sponge.inner.rotation.z) * tilt;
    sponge.inner.rotation.x += (clamp(this.vel.z * 0.06, -0.4, 0.4) - sponge.inner.rotation.x) * tilt;

    // --- absorbing from a dye pool
    if (this.activePool) {
      const p = this.activePool;
      this._v1.copy(p.def.pos).sub(pos); // toward pool centre, sponge-local
      this._v1.set(
        clamp(this._v1.x, -0.7, 0.7),
        -SPONGE_HALF_Y + 0.08,
        clamp(this._v1.z, -0.5, 0.5)
      );
      this.sponge.inject(p.def.dye, this._v1, dt);
      this.absorbFxTimer -= dt;
      if (this.absorbFxTimer <= 0) {
        this.absorbFxTimer = 0.07;
        this._v2.set(pos.x, WATER_Y + 0.02, pos.z);
        this._v3.copy(pos).setY(WATER_Y + 0.35);
        this.fx.absorbStream(this._v2, this._v3, DYE[p.def.id].water);
        if (this.fx.rng() < 0.35) this.fx.ripple(pos, DYE[p.def.id].water);
      }
    }

    // --- rinsing in the clear pool
    if (inWash && sponge.totalDye() > 0.004) {
      sponge.liquidColor(this._liquid);
      sponge.drain(dt, 0.55);
      sponge.clearTiny();
      this.washFxTimer -= dt;
      if (this.washFxTimer <= 0) {
        this.washFxTimer = 0.09;
        this.fx.washWisp(pos, this._liquid);
        if (this.fx.rng() < 0.3) this.fx.ripple(pos, this._liquid);
      }
      if (this.washHint > 0) this.washHint = 0.01; // hint done
    }

    // --- squeezing (hold still, not in water, sponge actually arrived —
    // travelling toward a far-away finger must not leak dye en route)
    const arrived =
      Math.hypot(this.dragTarget.x - pos.x, this.dragTarget.z - pos.z) < 0.35;
    const canSqueeze =
      this.dragging && !this.activePool && !inWash && arrived &&
      this.holdStill > 0.32 && sponge.totalDye() > 0.015;
    this.squeezing = canSqueeze;
    // One squeeze session = one shade: lock concentration when it starts
    // so a long squeeze doesn't drift through several spirit species.
    if (canSqueeze && !this._squeezeSession) {
      this._squeezeSession = { conc: sponge.concentration(), painted: null };
    }
    if (!canSqueeze) this._squeezeSession = null;
    this.squeeze += ((canSqueeze ? 1 : 0) - this.squeeze) * damp(canSqueeze ? 5 : 7, dt);
    if (this.squeeze > 0.25 && canSqueeze) {
      this.dripTimer -= dt;
      if (this.dripTimer <= 0) {
        this.dripTimer = 0.085;
        const strength = sponge.liquidColor(this._liquid);
        if (strength > 0.02) {
          const from = this._v1.set(pos.x, pos.y - SPONGE_HALF_Y * (1 - 0.4 * this.squeeze) - 0.05, pos.z);
          const over = this.hoverTarget;
          const amounts = sponge.liquidAmounts();
          // Drips carry their session: one paint per session (even for
          // late-landing tail drips), and one locked shade per session.
          const session = this._squeezeSession;
          const conc = session ? session.conc : strength;
          const dripColor = this._liquid.clone();
          if (over) {
            over.focusPoint(this._v2);
            const floorY = this._v2.y - 0.15;
            this.fx.drip(from, dripColor, floorY, (landPos) => {
              if (session && session.painted !== over && over.paint(dripColor)) {
                session.painted = over;
              }
              this.fx.sparkleBurst(landPos, dripColor, 3);
              if (this.spirits) this.spirits.noteLiquid(amounts, dripColor, landPos, conc);
            });
          } else {
            this.fx.drip(from, dripColor, 0.02, (landPos, c) => {
              this.fx.splat(landPos, c);
              if (this.spirits) this.spirits.noteLiquid(amounts, dripColor, landPos, conc);
            });
          }
          sponge.drain(dt * 6.5, 0.5);
        }
      }
    }

    // squash animation
    const s = this.squeeze;
    const pulse = s > 0.05 ? 1 + Math.sin(this.time * 16) * 0.1 * s : 1;
    const sy = (1 - 0.42 * s) * pulse;
    sponge.inner.scale.set(1 + 0.26 * s, sy, 1 + 0.26 * s);
    sponge.inner.position.y = -SPONGE_HALF_Y * (1 - sy) * 0.9;

    // --- internal colour diffusion (the mixing moment)
    sponge.diffuse(dt);
    sponge.updateColors();
    if (!this.mixSeen && sponge.mixEvent > 0.14) {
      this.mixSeen = true;
      this.mixFocus = 2.6;
    }
    if (sponge.mixEvent < 0.05) this.mixSeen = false;
    this.mixFocus = Math.max(0, this.mixFocus - dt);

    // --- world, targets, fx
    this.world.update(dt, this.time);
    for (const t of this.targets) t.update(dt, this.time);
    if (this.spirits) this.spirits.update(dt, pos);
    if (this.garden) {
      const ev = this.garden.setScore(this._gardenScore());
      if (ev) {
        // A garden level-up: linger on the new wonder.
        this.rewardFocus = { point: ev.focus, timer: 2.8 };
        this.fx.sparkleBurst(ev.focus, new THREE.Color(0xfff2b8), 26);
      }
      this.garden.update(dt, this.time);
    }
    this.fx.update(dt);
    if (this.rewardFocus) {
      this.rewardFocus.timer -= dt;
      if (this.rewardFocus.timer <= 0) this.rewardFocus = null;
    }
    if (this.washHint > 0) this.washHint = Math.max(0.0, this.washHint - dt);

    this._updateStage(dt);
    this._updateCamera(dt);
  }

  // ------------------------------------------------------------ stages

  _halo(obj, on) {
    obj.userData.active = on;
  }

  _pool(id) {
    return this.world.pools.find((p) => p.def.id === id);
  }

  _target(id) {
    return this.targets.find((t) => t.id === id);
  }

  _updateStage(dt) {
    this.stageTimer += dt;
    const avg = this.sponge.averages();
    const total = avg.r + avg.b + avg.y;
    const pools = { red: false, blue: false, yellow: false };
    const targetHalos = new Map();
    let washOn = false;

    switch (this.stage) {
      case 'dip1':
        pools.red = this.stageTimer > 0.8;
        if (avg.r > 0.09) this._setStage('paint1');
        break;
      case 'paint1':
        targetHalos.set('flower-main', true);
        if (total < 0.01) pools.red = true; // rinsed it all out? point back
        if (this._target('flower-main').colored) this._setStage('dip2');
        break;
      case 'dip2':
        pools.red = avg.r < 0.07;
        pools.blue = avg.b < 0.07;
        if (avg.r > 0.07 && avg.b > 0.07) this._setStage('mixwatch');
        break;
      case 'mixwatch':
        // Just watch: colours creeping together inside the sponge.
        if (this.sponge.mixEvent > 0.13 || this.stageTimer > 6) this._setStage('paint2');
        break;
      case 'paint2': {
        const bud = this._target('flower-left');
        targetHalos.set(bud.colored ? 'flower-right' : 'flower-left', true);
        const done = this.targets.filter((t) => t.colored).length >= 2;
        if (done) {
          this._setStage('free');
          this.washHint = 7;
        }
        break;
      }
      case 'free':
        washOn = this.washHint > 0.02;
        break;
    }

    for (const key of ['red', 'blue', 'yellow']) this._halo(this._pool(key).halo, pools[key]);
    this._halo(this.world.wash.halo, washOn);
    for (const t of this.targets) this._halo(t.halo, targetHalos.get(t.id) === true);
  }

  _setStage(stage) {
    this.stage = stage;
    this.stageTimer = 0;
  }

  _onTargetComplete(target) {
    target.focusPoint(this._v1);
    this.fx.sparkleBurst(this._v1, target.color, 30);
    this.rewardFocus = { point: this._v1.clone(), timer: 2.1 };
    if (this.garden) this.garden.notePaint();
  }

  _gardenScore() {
    return this.garden.paintCount + (this.spirits ? this.spirits.discovered.size : 0);
  }

  // ------------------------------------------------------------ camera

  setViewport(aspect) {
    // 3/4 top-down view; portrait pulls back + up so the whole meadow fits.
    const portrait = clamp((1.05 - aspect) / 0.6, 0, 1);
    this.baseFov = lerp(46, 58, portrait);
    this.basePos = new THREE.Vector3(0, lerp(8.2, 11.8, portrait), lerp(10.6, 12.8, portrait));
    this.baseLook = new THREE.Vector3(0, 0.55, -0.55);
    if (!this._baseUpdated) {
      this.camPos.copy(this.basePos);
      this.camLook.copy(this.baseLook);
      this._baseUpdated = true;
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    this.camera.fov = this.baseFov;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  _updateCamera(dt) {
    const pos = this.sponge.group.position;
    // Desired focus point + how strongly we zoom to it.
    let focus = null;
    let strength = 0;
    if (this.rewardFocus) {
      focus = this.rewardFocus.point;
      strength = 0.72;
    } else if (this.squeeze > 0.3 && this.hoverTarget) {
      this.hoverTarget.focusPoint(this._v2);
      focus = this._v2.lerp(pos, 0.35);
      strength = 0.66;
    } else if (this.activePool || this._inWash(pos)) {
      focus = this._v2.copy(pos).setY(0.5);
      strength = 0.6;
    } else if (this.mixFocus > 0) {
      focus = this._v2.copy(pos);
      strength = 0.62;
    }

    const look = this._v3.copy(this.baseLook).lerp(
      this._v1.set(pos.x * 0.4, this.baseLook.y, pos.z * 0.3),
      0.6
    );
    let wantPos = this.basePos;
    if (focus) {
      look.lerp(focus, 0.8 * strength);
      const dir = this._v1.copy(this.basePos).sub(focus).normalize();
      const dist = lerp(this.basePos.distanceTo(focus), 5.6, strength);
      wantPos = dir.multiplyScalar(dist).add(focus);
      if (wantPos.y < focus.y + 2.2) wantPos.y = focus.y + 2.2;
    }
    const f = damp(2.6, dt);
    this.camPos.lerp(wantPos, f);
    this.camLook.lerp(look, f);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
  }
}
