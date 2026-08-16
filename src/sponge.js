import * as THREE from '../lib/three.module.js';
import { mixDye } from './dye.js';
import { clamp, smoothstep } from './util.js';

// The sponge is the hero. Its body is a rounded soft block whose vertices
// carry three dye amounts (red / blue / yellow). Dye is injected at the
// contact point when the sponge touches coloured water, then *diffuses*
// through neighbouring vertices frame by frame — so you literally watch a
// colour soak in from one side, meet another colour in the middle, and
// blend into a new colour across the boundary. Nothing snaps.

const HALF = new THREE.Vector3(0.85, 0.42, 0.62);
const ROUND = 0.26;

function roundedBoxGeometry() {
  const geo = new THREE.BoxGeometry(HALF.x * 2, HALF.y * 2, HALF.z * 2, 12, 7, 9);
  const pos = geo.attributes.position;
  const inner = new THREE.Vector3().copy(HALF).subScalar(ROUND);
  const v = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    q.set(
      clamp(v.x, -inner.x, inner.x),
      clamp(v.y, -inner.y, inner.y),
      clamp(v.z, -inner.z, inner.z)
    );
    const d = v.clone().sub(q);
    if (d.lengthSq() > 1e-8) {
      d.normalize().multiplyScalar(ROUND);
      v.copy(q).add(d);
    }
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

function porousTexture() {
  const size = 128;
  const cnv = document.createElement('canvas');
  cnv.width = cnv.height = size;
  const ctx = cnv.getContext('2d');
  ctx.fillStyle = '#909090';
  ctx.fillRect(0, 0, size, size);
  // Little dark pores of varying size — used as a bump map.
  let s = 7;
  const rnd = () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
  for (let i = 0; i < 240; i++) {
    const r = 1 + rnd() * 3.2;
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
    g.addColorStop(0, 'rgba(40,40,40,0.85)');
    g.addColorStop(1, 'rgba(40,40,40,0)');
    ctx.save();
    ctx.translate(rnd() * size, rnd() * size);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 2);
  return tex;
}

export class Sponge {
  constructor() {
    this.group = new THREE.Group(); // world placement (position only)
    this.inner = new THREE.Group(); // tilt + squash animation
    this.group.add(this.inner);

    const geo = roundedBoxGeometry();
    const colors = new Float32Array(geo.attributes.position.count * 3);
    colors.fill(1);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const tex = porousTexture();
    const mat = new THREE.MeshStandardMaterial({
      color: 0xfffdf6,
      vertexColors: true,
      roughness: 0.94,
      bumpMap: tex,
      bumpScale: 0.9,
    });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.inner.add(this.mesh);

    this._buildNodes(geo);

    const n = this.nodes.length;
    this.dyeR = new Float32Array(n);
    this.dyeB = new Float32Array(n);
    this.dyeY = new Float32Array(n);
    this._tmpA = new Float32Array(n);
    this._dirty = true;

    this._white = new THREE.Color(1, 0.995, 0.965);
    this._mixed = new THREE.Color();
    this._vcol = new THREE.Color();
    this._avg = { r: 0, b: 0, y: 0 };
    this.mixEvent = 0; // rises when two dyes are actively blending
  }

  // Weld duplicated box-face vertices into shared nodes and build the
  // neighbour graph the diffusion runs on.
  _buildNodes(geo) {
    const pos = geo.attributes.position;
    const map = new Map();
    const nodes = [];
    this.vertexNode = new Uint16Array(pos.count);
    for (let i = 0; i < pos.count; i++) {
      const key = `${pos.getX(i).toFixed(4)}|${pos.getY(i).toFixed(4)}|${pos.getZ(i).toFixed(4)}`;
      let idx = map.get(key);
      if (idx === undefined) {
        idx = nodes.length;
        map.set(key, idx);
        nodes.push({
          pos: new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)),
          members: [],
          nbr: new Set(),
        });
      }
      nodes[idx].members.push(i);
      this.vertexNode[i] = idx;
    }
    const index = geo.index.array;
    for (let t = 0; t < index.length; t += 3) {
      const a = this.vertexNode[index[t]];
      const b = this.vertexNode[index[t + 1]];
      const c = this.vertexNode[index[t + 2]];
      if (a !== b) { nodes[a].nbr.add(b); nodes[b].nbr.add(a); }
      if (b !== c) { nodes[b].nbr.add(c); nodes[c].nbr.add(b); }
      if (a !== c) { nodes[a].nbr.add(c); nodes[c].nbr.add(a); }
    }
    for (const node of nodes) {
      node.nbr = Array.from(node.nbr);
      // Capillary bias: dye wicks upward (neighbours below feed this node
      // more strongly), so colour visibly climbs the sponge's sides.
      node.nbrW = node.nbr.map((j) => (nodes[j].pos.y < node.pos.y - 0.02 ? 1.9 : 1.0));
      node.nbrWSum = node.nbrW.reduce((a, b) => a + b, 0);
    }
    this.nodes = nodes;
  }

  // Inject dye near a local-space contact point (colour visibly enters
  // from where the sponge touched the water).
  inject(channel, localPoint, dt, rate = 4.2, radius = 1.0) {
    const arr = channel === 'r' ? this.dyeR : channel === 'b' ? this.dyeB : this.dyeY;
    const r2 = radius * radius;
    let injected = 0;
    for (let i = 0; i < this.nodes.length; i++) {
      const d2 = this.nodes[i].pos.distanceToSquared(localPoint);
      if (d2 > r2) continue;
      const w = 1 - Math.sqrt(d2) / radius;
      const add = rate * dt * w * w;
      const next = Math.min(1, arr[i] + add);
      injected += next - arr[i];
      arr[i] = next;
    }
    if (injected > 0) this._dirty = true;
    return injected;
  }

  // Heat-equation style diffusion over the vertex graph. This is what
  // makes two colours creep toward each other and melt together at the
  // boundary instead of switching instantly.
  diffuse(dt, k = 1.9) {
    const f = Math.min(0.45, k * dt);
    let mixing = 0;
    for (const arr of [this.dyeR, this.dyeB, this.dyeY]) {
      const tmp = this._tmpA;
      for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        const nbr = node.nbr;
        let sum = 0;
        for (let j = 0; j < nbr.length; j++) sum += arr[nbr[j]] * node.nbrW[j];
        tmp[i] = arr[i] + f * (sum / node.nbrWSum - arr[i]);
      }
      arr.set(tmp);
    }
    // Detect active blending (two dyes overlapping in the same region).
    for (let i = 0; i < this.nodes.length; i += 7) {
      const r = this.dyeR[i], b = this.dyeB[i], y = this.dyeY[i];
      mixing = Math.max(mixing, Math.min(r, b), Math.min(b, y), Math.min(r, y));
    }
    this.mixEvent = mixing;
    this._dirty = true;
  }

  // Remove dye uniformly; returns how much was removed (0..1 scale).
  drain(dt, rate) {
    const f = Math.exp(-rate * dt);
    let before = 0;
    for (let i = 0; i < this.nodes.length; i++) {
      before += this.dyeR[i] + this.dyeB[i] + this.dyeY[i];
      this.dyeR[i] *= f;
      this.dyeB[i] *= f;
      this.dyeY[i] *= f;
    }
    this._dirty = true;
    return (before / this.nodes.length) * (1 - f);
  }

  clearTiny() {
    // Snap near-zero dye back to pure white so the sponge really rinses clean.
    for (let i = 0; i < this.nodes.length; i++) {
      if (this.dyeR[i] < 0.015) this.dyeR[i] = 0;
      if (this.dyeB[i] < 0.015) this.dyeB[i] = 0;
      if (this.dyeY[i] < 0.015) this.dyeY[i] = 0;
    }
  }

  // Average dye amounts across the body.
  averages() {
    let r = 0, b = 0, y = 0;
    for (let i = 0; i < this.nodes.length; i++) {
      r += this.dyeR[i];
      b += this.dyeB[i];
      y += this.dyeY[i];
    }
    const n = this.nodes.length;
    this._avg.r = r / n;
    this._avg.b = b / n;
    this._avg.y = y / n;
    return this._avg;
  }

  totalDye() {
    const a = this.averages();
    return a.r + a.b + a.y;
  }

  // Colour of the liquid that would come out if squeezed right now.
  liquidColor(out) {
    const a = this.averages();
    const boost = 3.4;
    return mixDye(
      { r: Math.min(1, a.r * boost), b: Math.min(1, a.b * boost), y: Math.min(1, a.y * boost) },
      out
    );
  }

  // Amounts (normalised) of what gets squeezed out, for painting targets.
  liquidAmounts() {
    const a = this.averages();
    const boost = 3.4;
    return {
      r: Math.min(1, a.r * boost),
      b: Math.min(1, a.b * boost),
      y: Math.min(1, a.y * boost),
    };
  }

  updateColors() {
    if (!this._dirty) return;
    this._dirty = false;
    const colorAttr = this.mesh.geometry.attributes.color;
    const arr = colorAttr.array;
    const amounts = { r: 0, b: 0, y: 0 };
    for (let n = 0; n < this.nodes.length; n++) {
      amounts.r = this.dyeR[n];
      amounts.b = this.dyeB[n];
      amounts.y = this.dyeY[n];
      const total = amounts.r + amounts.b + amounts.y;
      mixDye(amounts, this._mixed);
      const blend = smoothstep(0.006, 0.38, total);
      this._vcol.copy(this._white).lerp(this._mixed, blend);
      const members = this.nodes[n].members;
      for (let m = 0; m < members.length; m++) {
        const o = members[m] * 3;
        arr[o] = this._vcol.r;
        arr[o + 1] = this._vcol.g;
        arr[o + 2] = this._vcol.b;
      }
    }
    colorAttr.needsUpdate = true;
  }
}
