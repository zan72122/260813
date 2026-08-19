import * as THREE from 'three';
import { BASKET_R, BED, BULB, HOLE, HOLES } from '../game/config';
import { basketTexture, bulbTexture, ringGlowTexture, woodTexture } from '../gfx/textures';
import { clamp01, smoothstep } from '../core/math';

/**
 * The raised planting bed, the basket, and the bulbs.
 *
 * The holes are real geometry, not a decal, so when the soil folds back over a
 * bulb the bulb genuinely disappears into the ground - which is the whole point
 * of the "ぽとん / ふわっ" beat.
 */

const GX = 92;
const GZ = 68;

export class Plot {
  readonly group = new THREE.Group();
  readonly bed: THREE.Mesh;
  readonly basket = new THREE.Group();
  /** low plank frame: the clearest possible "plant here" signal, no words needed */
  readonly frame = new THREE.Group();
  readonly bulbs: THREE.Mesh[] = [];
  readonly rings: THREE.Mesh[] = [];
  /** 1 = hole fully open, 0 = filled back in */
  readonly holeOpen: number[] = HOLES.map(() => 1);
  private geo: THREE.BufferGeometry;
  private basePos: Float32Array;
  private occ!: THREE.BufferAttribute;
  private dirty = true;
  private bulbTex: THREE.Texture;
  private basketTex: THREE.Texture;
  private woodTex: THREE.Texture;
  private ringMat: THREE.MeshBasicMaterial;
  private ringTex!: THREE.Texture;

  constructor(bedMaterial: THREE.Material) {
    this.geo = buildBedGeometry();
    this.basePos = (this.geo.getAttribute('position').array as Float32Array).slice();
    this.occ = this.geo.getAttribute('aOcc') as THREE.BufferAttribute;
    this.bed = new THREE.Mesh(this.geo, bedMaterial);
    this.bed.name = 'bed';
    this.bed.frustumCulled = false;
    this.group.add(this.bed);

    this.bulbTex = bulbTexture(256);
    this.basketTex = basketTexture(256);
    this.woodTex = woodTexture(256);
    this.buildFrame();
    this.group.add(this.frame);

    const bulbGeo = buildBulbGeometry();
    const bulbMat = new THREE.MeshPhongMaterial({
      map: this.bulbTex, shininess: 12, specular: 0x4a3620, color: 0xffffff,
    });
    for (let i = 0; i < HOLES.length; i++) {
      const m = new THREE.Mesh(bulbGeo, bulbMat);
      m.name = `bulb${i}`;
      m.userData.index = i;
      this.bulbs.push(m);
      this.group.add(m);
    }

    this.ringTex = ringGlowTexture(128);
    this.ringMat = new THREE.MeshBasicMaterial({
      map: this.ringTex, color: 0xffe98a, transparent: true, opacity: 0,
      depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    });
    const ringGeo = new THREE.PlaneGeometry(HOLE.radius * 2.6, HOLE.radius * 2.6);
    ringGeo.rotateX(-Math.PI / 2);
    for (const h of HOLES) {
      const r = new THREE.Mesh(ringGeo, this.ringMat.clone());
      r.position.set(h.x, BED.top + 0.035, h.z);
      r.renderOrder = 4;
      this.rings.push(r);
      this.group.add(r);
    }

    this.buildBasket();
    this.group.add(this.basket);
    this.refresh();
  }

  private buildFrame() {
    const mat = new THREE.MeshLambertMaterial({ map: this.woodTex, color: 0xb98f62 });
    const h = 0.062, th = 0.042;
    const ex = BED.halfX + 0.10, ez = BED.halfZ + 0.10;
    const long = new THREE.BoxGeometry(ex * 2 + th * 2, h, th);
    const side = new THREE.BoxGeometry(th, h, ez * 2);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(long, mat);
      p.position.set(0, BED.top + 0.004, s * ez);
      this.frame.add(p);
      const q = new THREE.Mesh(side, mat);
      q.position.set(s * ex, BED.top + 0.004, 0);
      this.frame.add(q);
    }
  }

  private buildBasket() {
    const mat = new THREE.MeshLambertMaterial({ map: this.basketTex });
    mat.side = THREE.DoubleSide;
    const R = BASKET_R, Hh = BASKET_R * 0.72;
    const profile: THREE.Vector2[] = [];
    for (let i = 0; i <= 9; i++) {
      const t = i / 9;
      profile.push(new THREE.Vector2(R * (0.52 + 0.48 * Math.pow(t, 0.85)), t * Hh));
    }
    const bowl = new THREE.Mesh(new THREE.LatheGeometry(profile, 24, 0, Math.PI * 2), mat);
    this.basket.add(bowl);
    const floor = new THREE.Mesh(new THREE.CircleGeometry(R * 0.52, 20), mat);
    floor.rotateX(-Math.PI / 2);
    floor.position.y = 0.004;
    this.basket.add(floor);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, R * 0.085, 7, 26), mat);
    rim.rotateX(Math.PI / 2);
    rim.position.y = Hh;
    this.basket.add(rim);
  }

  /** Recompute the bed surface. Only runs while a hole is opening or closing. */
  refresh() {
    const pos = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const occ = this.occ.array as Float32Array;
    const base = this.basePos;
    for (let i = 0, v = 0; i < arr.length; i += 3, v++) {
      const x = base[i], z = base[i + 2];
      let y = base[i + 1];
      let deep = 0;
      for (let h = 0; h < HOLES.length; h++) {
        const open = this.holeOpen[h];
        if (open <= 0.0005) continue;
        const dx = x - HOLES[h].x, dz = z - HOLES[h].z;
        const d = Math.sqrt(dx * dx + dz * dz);
        // bowl-shaped depression with a low ring of thrown-up soil around it
        const dig = 1 - smoothstep(0, HOLE.radius * 1.06, d);
        const ridge = Math.exp(-Math.pow((d - HOLE.radius * 1.22) / (HOLE.radius * 0.30), 2));
        const bowl = dig * dig * (3 - 2 * dig) * open;
        y -= HOLE.depth * bowl;
        y += 0.020 * ridge * open;
        deep = Math.max(deep, bowl);
      }
      arr[i + 1] = y;
      // the inside of a hole is in shadow, which is what makes it read as a hole
      occ[v] = 1 - 0.92 * deep;
    }
    pos.needsUpdate = true;
    this.occ.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.dirty = false;
  }

  setHoleOpen(i: number, v: number) {
    const nv = clamp01(v);
    if (Math.abs(nv - this.holeOpen[i]) < 0.0008) return;
    this.holeOpen[i] = nv;
    this.dirty = true;
  }

  update() { if (this.dirty) this.refresh(); }

  /** Ground height on top of the bed, used to sit bulbs and rings correctly. */
  bedHeight(x: number, z: number) {
    let y = bedBase(x, z);
    for (let h = 0; h < HOLES.length; h++) {
      const open = this.holeOpen[h];
      if (open <= 0.0005) continue;
      const d = Math.hypot(x - HOLES[h].x, z - HOLES[h].z);
      const dig = 1 - smoothstep(0, HOLE.radius * 1.06, d);
      y -= HOLE.depth * dig * dig * (3 - 2 * dig) * open;
    }
    return y;
  }

  setRingGlow(i: number, v: number) {
    (this.rings[i].material as THREE.MeshBasicMaterial).opacity = v * 0.70;
    const s = 0.92 + 0.16 * v;
    this.rings[i].scale.set(s, 1, s);
  }

  dispose() {
    this.geo.dispose();
    this.bulbTex.dispose();
    this.basketTex.dispose();
    this.woodTex.dispose();
    this.ringTex.dispose();
    this.ringMat.dispose();
  }
}

/** Bed profile before any holes are dug. */
function bedBase(x: number, z: number) {
  const ex = smoothstep(BED.halfX + BED.skirt, BED.halfX, Math.abs(x));
  const ez = smoothstep(BED.halfZ + BED.skirt, BED.halfZ, Math.abs(z));
  const e = ex * ez;
  const tilth = 0.010 * Math.sin(x * 7.7) * Math.sin(z * 9.3) + 0.006 * Math.sin(x * 21 + 1.4);
  return BED.top * e + tilth * e - 0.022 * (1 - e);
}

function buildBedGeometry() {
  const w = (BED.halfX + BED.skirt) * 2;
  const d = (BED.halfZ + BED.skirt) * 2;
  const pos: number[] = [];
  const idx: number[] = [];
  for (let j = 0; j <= GZ; j++) {
    const z = -d / 2 + (j / GZ) * d;
    for (let i = 0; i <= GX; i++) {
      const x = -w / 2 + (i / GX) * w;
      pos.push(x, bedBase(x, z), z);
    }
  }
  for (let j = 0; j < GZ; j++) {
    for (let i = 0; i < GX; i++) {
      const a = j * (GX + 1) + i;
      idx.push(a, a + GX + 1, a + 1, a + 1, a + GX + 1, a + GX + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aOcc', new THREE.Float32BufferAttribute(new Float32Array(pos.length / 3).fill(1), 1));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** A tulip bulb: fat, rounded, with the papery point on top. */
export function buildBulbGeometry() {
  const R = BULB.radius, H = BULB.height;
  const pts: THREE.Vector2[] = [
    [0.00, 0.000], [0.42, 0.010], [0.72, 0.048], [0.92, 0.130], [1.00, 0.250],
    [0.99, 0.400], [0.90, 0.560], [0.70, 0.710], [0.44, 0.840], [0.20, 0.935], [0.05, 0.990], [0.0, 1.0],
  ].map(([r, y]) => new THREE.Vector2(r * R, y * H));
  const g = new THREE.LatheGeometry(pts, 22);
  g.computeVertexNormals();
  return g;
}
