import * as THREE from '../lib/three.module.js';
import { clamp } from './util.js';

// The drawing board — a big white sheet at the front of the meadow.
// Drag a dye-soaked sponge across it and it leaves soft strokes; a
// squeeze over it makes fat round stamps; a freshly-rinsed clean sponge
// wipes it back to white. At night the drawing glows softly.

export const BOARD = { x: 0, z: 5.75, w: 4.2, h: 1.9 };
const TEX_W = 512;
const TEX_H = 232;

export class DrawingBoard {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.position.set(BOARD.x, 0, BOARD.z);
    scene.add(this.group);

    // The white board itself (a soft rounded sheet).
    const sheet = new THREE.Mesh(
      new THREE.BoxGeometry(BOARD.w + 0.35, 0.09, BOARD.h + 0.35),
      new THREE.MeshStandardMaterial({ color: 0xfffdf6, roughness: 0.85 })
    );
    sheet.position.y = 0.045;
    sheet.receiveShadow = true;
    this.group.add(sheet);
    // Little corner knobs so it reads as a play-mat, not terrain.
    const knobMat = new THREE.MeshStandardMaterial({ color: 0xf4c95c, roughness: 0.6 });
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), knobMat);
      knob.position.set((sx * (BOARD.w + 0.35)) / 2, 0.1, (sz * (BOARD.h + 0.35)) / 2);
      this.group.add(knob);
    }

    // Transparent paint layer.
    this.cnv = document.createElement('canvas');
    this.cnv.width = TEX_W;
    this.cnv.height = TEX_H;
    this.ctx = this.cnv.getContext('2d');
    this.ctx.clearRect(0, 0, TEX_W, TEX_H);
    this.tex = new THREE.CanvasTexture(this.cnv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshStandardMaterial({
      map: this.tex,
      transparent: true,
      roughness: 0.75,
      emissive: 0xffffff,
      emissiveMap: this.tex,
      emissiveIntensity: 0,
      depthWrite: false,
    });
    this.layer = new THREE.Mesh(new THREE.PlaneGeometry(BOARD.w, BOARD.h), mat);
    this.layer.rotation.x = -Math.PI / 2;
    this.layer.position.y = 0.095;
    this.group.add(this.layer);

    this.stamps = 0; // how many marks were ever made (for tests/telemetry)
  }

  contains(x, z) {
    return (
      Math.abs(x - BOARD.x) < BOARD.w / 2 + 0.15 &&
      Math.abs(z - BOARD.z) < BOARD.h / 2 + 0.15
    );
  }

  _toTex(x, z) {
    return {
      u: clamp(((x - BOARD.x) / BOARD.w + 0.5) * TEX_W, 0, TEX_W),
      v: clamp(((z - BOARD.z) / BOARD.h + 0.5) * TEX_H, 0, TEX_H),
    };
  }

  // Soft round stroke of colour.
  stamp(x, z, color, radiusWorld = 0.24, alpha = 0.5) {
    const { u, v } = this._toTex(x, z);
    const r = (radiusWorld / BOARD.w) * TEX_W;
    const g = this.ctx.createRadialGradient(u, v, 0, u, v, r);
    const rgb = `${Math.round(color.r * 255)},${Math.round(color.g * 255)},${Math.round(color.b * 255)}`;
    g.addColorStop(0, `rgba(${rgb},${alpha})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    this.ctx.globalCompositeOperation = 'source-over';
    this.ctx.fillStyle = g;
    this.ctx.beginPath();
    this.ctx.arc(u, v, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.tex.needsUpdate = true;
    this.stamps++;
  }

  // A clean wet sponge wipes the sheet back to white.
  erase(x, z, radiusWorld = 0.34) {
    const { u, v } = this._toTex(x, z);
    const r = (radiusWorld / BOARD.w) * TEX_W;
    const g = this.ctx.createRadialGradient(u, v, 0, u, v, r);
    g.addColorStop(0, 'rgba(0,0,0,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    this.ctx.globalCompositeOperation = 'destination-out';
    this.ctx.fillStyle = g;
    this.ctx.beginPath();
    this.ctx.arc(u, v, r, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.globalCompositeOperation = 'source-over';
    this.tex.needsUpdate = true;
  }

  setNight(f) {
    // The whole drawing luminesces gently after dark.
    this.layer.material.emissiveIntensity = f * 0.42;
  }
}
