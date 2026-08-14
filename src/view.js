// Renderer + the automatic camera.
//
// Each stage declares WHERE it looks from (a direction) and HOW MUCH world it
// must contain (frame width/height). The rig then solves for the distance, so
// the same presets work on an iPhone in portrait and an iPad in landscape
// without a single hand-tuned number per device.

import * as THREE from 'three';
import { QUALITY, WHITE_WORLD } from './config.js';

/**
 * @typedef {{ dir: [number,number,number], target: [number,number,number],
 *   frameW: number, frameH: number, fov?: number, ms?: number }} Shot
 */

/** @type {Record<string, Shot>} */
export const SHOTS = {
  // a tray of white powder, seen from above and slightly in front
  tray: { dir: [0, 0.86, 0.9], target: [0, 0, 0], frameW: 14.5, frameH: 10.5, fov: 42, ms: 900 },
  // the stamp coming down: low and close, so the press has weight
  stamp: { dir: [0.1, 0.5, 1.0], target: [0, 1.5, 0.2], frameW: 13.5, frameH: 10.5, fov: 40, ms: 850 },
  // macro on the hole being filled
  pour: { dir: [0.08, 0.95, 0.8], target: [0, 0, 0], frameW: 9.5, frameH: 7.5, fov: 34, ms: 700 },
  // pull back a bit for the flip
  flip: { dir: [0, 0.78, 1.0], target: [0, 0.2, 0], frameW: 16, frameH: 12, fov: 44, ms: 900 },
  // the reveal: very close, oblique. This shot is NEVER cut while brushing.
  dig: { dir: [0, 0.72, 0.88], target: [0, -0.45, 0.1], frameW: 12.5, frameH: 9.5, fov: 36, ms: 1100 },
  polish: { dir: [0, 0.76, 0.86], target: [0, -0.5, 0.2], frameW: 14, frameH: 10.5, fov: 38, ms: 700 },
  // everything at once, for the first time
  finale: { dir: [0, 0.95, 0.85], target: [0, -0.9, 0], frameW: 20, frameH: 14.5, fov: 44, ms: 1400 },
};

export class View {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: !QUALITY.dpr || QUALITY.dpr <= 1.5,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setClearColor(new THREE.Color(WHITE_WORLD.bg), 1);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(WHITE_WORLD.bg);
    this.scene.fog = new THREE.Fog(WHITE_WORLD.bg, 26, 62);

    this.camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    this.camera.position.set(0, 12, 12);

    const key = new THREE.DirectionalLight(0xffffff, 1.5);
    key.position.set(5, 12, 7);
    this.scene.add(key);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0xcfc7ba, 1.1));

    // the table the whole factory stands on
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 90),
      new THREE.MeshLambertMaterial({ color: new THREE.Color(WHITE_WORLD.bgDeep) }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.52;
    this.scene.add(ground);
    this.ground = ground;

    /** @type {Shot} */
    this.shot = SHOTS.tray;
    this._from = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 42 };
    this._to = { pos: new THREE.Vector3(), tgt: new THREE.Vector3(), fov: 42 };
    this._t = 1;
    this._dur = 1;
    this.lookAt = new THREE.Vector3();
    this.shake = 0;
    this._shakeV = new THREE.Vector3();

    this.resize();
    this._solve(this.shot, this._to);
    this.camera.position.copy(this._to.pos);
    this.lookAt.copy(this._to.tgt);
    this.camera.fov = this._to.fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(this.lookAt);
  }

  resize() {
    const w = Math.max(1, Math.floor(this.canvas.clientWidth || window.innerWidth));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight || window.innerHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, QUALITY.dpr);
    this.renderer.setPixelRatio(dpr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.width = w;
    this.height = h;
    if (this.shot) {
      this._solve(this.shot, this._to);
      if (this._t >= 1) {
        this.camera.position.copy(this._to.pos);
        this.lookAt.copy(this._to.tgt);
        this.camera.fov = this._to.fov;
        this.camera.updateProjectionMatrix();
        this.camera.lookAt(this.lookAt);
      }
    }
  }

  /** @param {Shot} shot @param {{pos:THREE.Vector3,tgt:THREE.Vector3,fov:number}} out */
  _solve(shot, out) {
    const fov = shot.fov ?? 42;
    const aspect = this.camera.aspect || 1;
    const vfov = (fov * Math.PI) / 180;
    const tan = Math.tan(vfov / 2);
    const distV = shot.frameH / 2 / tan;
    const distH = shot.frameW / 2 / (tan * aspect);
    const dist = Math.max(distV, distH) * 1.06;

    // On a tall phone the shot is width-limited and the subject ends up as a
    // thin band with dead space above and below. Tilting further over the
    // table trades that dead space for more of the tray.
    const tall = Math.min(1, Math.max(0, (1 / aspect - 0.9) / 0.9));
    out.tgt.set(shot.target[0], shot.target[1], shot.target[2]);
    out.pos.set(shot.dir[0], shot.dir[1] * (1 + 0.45 * tall), shot.dir[2]);
    out.pos.normalize().multiplyScalar(dist).add(out.tgt);
    out.fov = fov;
    return out;
  }

  /**
   * Move to a named or literal shot. `targetOverride` lets a stage aim the
   * macro shot at whichever hole the child is actually filling.
   * @param {string|Shot} shot
   */
  cutTo(shot, targetOverride = null, instant = false) {
    const s = typeof shot === 'string' ? SHOTS[shot] : shot;
    if (!s) return;
    this.shot = targetOverride ? { ...s, target: targetOverride } : s;
    this._from.pos.copy(this.camera.position);
    this._from.tgt.copy(this.lookAt);
    this._from.fov = this.camera.fov;
    this._solve(this.shot, this._to);
    this._dur = instant ? 0 : (this.shot.ms ?? 800) / 1000;
    this._t = instant ? 1 : 0;
    if (instant) {
      this.camera.position.copy(this._to.pos);
      this.lookAt.copy(this._to.tgt);
      this.camera.fov = this._to.fov;
      this.camera.updateProjectionMatrix();
      this.camera.lookAt(this.lookAt);
    }
  }

  /** Re-aim the current shot without restarting the transition (macro follow). */
  aim(target) {
    this.shot = { ...this.shot, target };
    this._solve(this.shot, this._to);
  }

  bump(amount = 0.5) {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  update(dt) {
    if (this._t < 1) {
      this._t = this._dur <= 0 ? 1 : Math.min(1, this._t + dt / this._dur);
      const e = this._t < 0.5 ? 4 * this._t ** 3 : 1 - (-2 * this._t + 2) ** 3 / 2;
      this.camera.position.lerpVectors(this._from.pos, this._to.pos, e);
      this.lookAt.lerpVectors(this._from.tgt, this._to.tgt, e);
      const fov = this._from.fov + (this._to.fov - this._from.fov) * e;
      if (Math.abs(fov - this.camera.fov) > 1e-3) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }
    } else {
      // gentle follow so a re-aim (macro shot) glides instead of snapping
      this.camera.position.lerp(this._to.pos, Math.min(1, dt * 2.2));
      this.lookAt.lerp(this._to.tgt, Math.min(1, dt * 2.2));
    }

    this.camera.lookAt(this.lookAt);
    if (this.shake > 0.001) {
      this.shake *= Math.exp(-dt * 7);
      const a = this.shake * 0.14;
      this._shakeV.set((Math.random() - 0.5) * a, (Math.random() - 0.5) * a, 0);
      this.camera.position.add(this._shakeV);
      this.camera.updateMatrixWorld();
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  /** Screen pixel -> point on the world plane y = planeY. */
  screenToPlane(px, py, planeY = 0, out = new THREE.Vector3()) {
    this._ndc ??= new THREE.Vector2();
    this._ray ??= new THREE.Raycaster();
    this._plane ??= new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this._ndc.set((px / this.width) * 2 - 1, -((py / this.height) * 2 - 1));
    this._ray.setFromCamera(this._ndc, this.camera);
    this._plane.constant = -planeY;
    return this._ray.ray.intersectPlane(this._plane, out) ? out : null;
  }

  /** World point -> screen pixels. */
  worldToScreen(v, out = { x: 0, y: 0 }) {
    const p = v.clone().project(this.camera);
    out.x = ((p.x + 1) / 2) * this.width;
    out.y = ((1 - p.y) / 2) * this.height;
    return out;
  }
}
