import * as THREE from 'three';
import { GROWTH, HOLES, SECTION } from '../game/config';
import { CUT } from './Ground';
import { soilWallTexture } from '../gfx/textures';
import { clamp01, makeRng, smoothstep } from '../core/math';
import { softDotTexture } from '../gfx/textures';

/**
 * The cut-away.
 *
 * This is not a diagram screen: it is the same world, with the soil between the
 * camera and the planting row taken away. The child keeps looking at the bulbs
 * they just dropped in, at the same place they dropped them, and the ground
 * surface with the water channel is still visible above the cut face.
 */

const WALL_VERT = /* glsl */`
varying vec2 vUvw;
varying vec3 vWorld;
void main() {
  vUvw = uv;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;

const WALL_FRAG = /* glsl */`
uniform sampler2D uMap;
uniform vec3  uTint;
uniform float uWetY;      // world Y that the damp front has reached
uniform float uWetAmt;
uniform vec3  uSunColor;
uniform vec3  uSkyColor;
varying vec2 vUvw;
varying vec3 vWorld;

void main() {
  vec3 base = texture2D(uMap, vUvw).rgb * uTint;
  // top of the section catches more sky light - keeps the cut friendly, not cavey
  float lit = 0.72 + 0.42 * smoothstep(-1.4, 0.1, vWorld.y);
  vec3 col = base * lit * (uSkyColor * 0.42 + uSunColor * 0.72);
  // damp soil above the front, dry below it, with a soft wavy boundary
  float edge = uWetY + sin(vWorld.x * 7.0) * 0.035;
  float wet = uWetAmt * (1.0 - smoothstep(edge - 0.26, edge, vWorld.y));
  col = mix(col, col * vec3(0.55, 0.48, 0.44), wet);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
}
`;

export class CrossSection {
  readonly group = new THREE.Group();
  readonly wall: THREE.Mesh;
  private wallMat: THREE.ShaderMaterial;
  private tex: THREE.Texture;
  private box: THREE.Mesh;
  private boxMat: THREE.MeshLambertMaterial;

  readonly roots: Roots;
  readonly sprouts: Sprouts;
  private pockets!: THREE.Group;
  private pocketTex!: THREE.Texture;

  constructor(sunColor: THREE.Color, skyColor: THREE.Color) {
    this.tex = soilWallTexture(512);
    this.tex.wrapS = this.tex.wrapT = THREE.RepeatWrapping;
    this.wallMat = new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: this.tex },
        uTint: { value: new THREE.Color('#d3a97e') },
        uWetY: { value: 2.0 },
        uWetAmt: { value: 0 },
        uSunColor: { value: sunColor },
        uSkyColor: { value: skyColor },
      },
      vertexShader: WALL_VERT,
      fragmentShader: WALL_FRAG,
    });

    const H = SECTION.top - SECTION.bottom;
    const wallGeo = new THREE.PlaneGeometry(SECTION.halfX * 2, H, 1, 1);
    const uvw = wallGeo.getAttribute('uv') as THREE.BufferAttribute;
    for (let i = 0; i < uvw.count; i++) {
      uvw.setXY(i, uvw.getX(i) * SECTION.halfX * 1.1, uvw.getY(i) * H * 0.85);
    }
    this.wall = new THREE.Mesh(wallGeo, this.wallMat);
    this.wall.position.set(0, (SECTION.top + SECTION.bottom) / 2, SECTION.z);
    this.wall.frustumCulled = false;
    this.group.add(this.wall);

    // floor + side walls so the removed soil reads as a real pit, not a cardboard flat
    this.boxMat = new THREE.MeshLambertMaterial({ map: this.tex, color: 0xb08b64, side: THREE.DoubleSide });
    this.box = new THREE.Mesh(buildPitGeometry(), this.boxMat);
    this.box.frustumCulled = false;
    this.group.add(this.box);

    // a pocket of darker earth hugging each bulb, so they sit *in* the soil
    this.pocketTex = softDotTexture(64, 0.05);
    const pocketMat = new THREE.MeshBasicMaterial({
      map: this.pocketTex, color: 0x4a3220, transparent: true, opacity: 0.42,
      depthWrite: false, fog: false,
    });
    this.pockets = new THREE.Group();
    for (const h of HOLES) {
      const q = new THREE.Mesh(new THREE.PlaneGeometry(0.32, 0.34), pocketMat);
      q.position.set(h.x, -0.13, SECTION.z + 0.012);
      q.renderOrder = 2;
      this.pockets.add(q);
    }
    this.group.add(this.pockets);

    this.roots = new Roots();
    this.sprouts = new Sprouts();
    this.group.add(this.roots.mesh, this.sprouts.mesh);
    this.group.visible = false;
    this.group.name = 'crossSection';
  }

  /** Damp front descending through the soil, in world Y. */
  setWet(y: number, amount: number) {
    this.wallMat.uniforms.uWetY.value = y;
    this.wallMat.uniforms.uWetAmt.value = amount;
  }

  reset() {
    this.setWet(2, 0);
    this.roots.setGrow(0);
    this.sprouts.setGrow(0);
    // the surface beat hides the cut face when the trench fills back in, so a
    // replay has to put it back
    this.wall.visible = true;
    this.group.visible = false;
  }

  dispose() {
    this.tex.dispose();
    this.pocketTex.dispose();
    this.wallMat.dispose();
    this.boxMat.dispose();
    this.box.geometry.dispose();
    this.roots.dispose();
    this.sprouts.dispose();
  }
}

function buildPitGeometry() {
  const x0 = CUT.cx - CUT.hx, x1 = CUT.cx + CUT.hx;
  // the floor tucks a little behind the cut face so no sliver of sky shows
  // through the join between the two
  const z0 = SECTION.z - 0.18, z1 = CUT.cz + CUT.hz;
  const yb = SECTION.bottom, yt = SECTION.top;
  const pos: number[] = [], idx: number[] = [], uv: number[] = [];
  const quad = (a: number[], b: number[], c: number[], d: number[], su: number, sv: number) => {
    const base = pos.length / 3;
    for (const p of [a, b, c, d]) pos.push(p[0], p[1], p[2]);
    uv.push(0, 0, su, 0, su, sv, 0, sv);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  // floor
  quad([x0, yb, z0], [x1, yb, z0], [x1, yb, z1], [x0, yb, z1], 6, 4);
  // left / right walls (facing inward)
  quad([x0, yb, z1], [x0, yb, z0], [x0, yt, z0], [x0, yt, z1], 4, 2);
  quad([x1, yb, z0], [x1, yb, z1], [x1, yt, z1], [x1, yt, z0], 4, 2);
  // near wall, behind the camera most of the time but it closes the box
  quad([x1, yb, z1], [x0, yb, z1], [x0, yt, z1], [x1, yt, z1], 6, 2);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/* -------------------------------------------------------------------------- */
/*  Roots                                                                      */
/* -------------------------------------------------------------------------- */

interface Strand {
  pts: THREE.Vector3[];
  width: number;
  offset: number;   // 0..1 delay so roots do not all appear at once
}

/**
 * Root strands are flat ribbons in the cut plane, rewritten on the CPU as they
 * grow. There are only a few hundred vertices, so a shader trick would cost more
 * to write than it saves.
 */
export class Roots {
  readonly mesh: THREE.Mesh;
  private strands: Strand[] = [];
  private geo: THREE.BufferGeometry;
  private mat: THREE.MeshBasicMaterial;
  private segs = 9;

  constructor() {
    const rng = makeRng(20250819);
    for (let i = 0; i < HOLES.length; i++) {
      const h = HOLES[i];
      const y0 = -0.10;
      const n = 5;
      for (let s = 0; s < n; s++) {
        const dir = (s / (n - 1) - 0.5) * 2;           // -1 .. 1
        const spread = dir * (0.10 + rng() * 0.16);
        const depth = GROWTH.rootBottom * (0.55 + rng() * 0.5);
        const pts: THREE.Vector3[] = [];
        for (let k = 0; k <= this.segs; k++) {
          const t = k / this.segs;
          const wob = Math.sin(t * 7 + s * 2.1 + i) * 0.016 * t;
          pts.push(new THREE.Vector3(
            h.x + spread * Math.pow(t, 1.5) + wob,
            y0 + (depth - y0) * Math.pow(t, 0.86),
            h.z + 0.012 + s * 0.003,
          ));
        }
        this.strands.push({ pts, width: 0.0062 - 0.0022 * Math.abs(dir), offset: rng() * 0.35 });
      }
    }
    this.geo = new THREE.BufferGeometry();
    const verts = this.strands.length * (this.segs + 1) * 2;
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    const idx: number[] = [];
    let base = 0;
    for (let s = 0; s < this.strands.length; s++) {
      for (let k = 0; k < this.segs; k++) {
        const a = base + k * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      base += (this.segs + 1) * 2;
    }
    this.geo.setIndex(idx);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, -0.5, 0), 4);
    this.mat = new THREE.MeshBasicMaterial({ color: 0xf6ead2, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.setGrow(0);
  }

  setGrow(t: number) {
    const arr = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const a = arr.array as Float32Array;
    let v = 0;
    for (const st of this.strands) {
      const g = clamp01((t - st.offset) / (1 - st.offset));
      const reach = g * this.segs;
      for (let k = 0; k <= this.segs; k++) {
        const kk = Math.min(k, reach);
        const i0 = Math.floor(kk), i1 = Math.min(this.segs, i0 + 1);
        const f = kk - i0;
        const p0 = st.pts[i0], p1 = st.pts[i1];
        const px = p0.x + (p1.x - p0.x) * f;
        const py = p0.y + (p1.y - p0.y) * f;
        const pz = p0.z + (p1.z - p0.z) * f;
        const taper = st.width * (1 - k / this.segs) * (g > 0 ? 1 : 0);
        a[v++] = px - taper; a[v++] = py; a[v++] = pz;
        a[v++] = px + taper; a[v++] = py; a[v++] = pz;
      }
    }
    arr.needsUpdate = true;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}

/* -------------------------------------------------------------------------- */
/*  Sprouts                                                                    */
/* -------------------------------------------------------------------------- */

/** The green shoot that climbs from the bulb up through the surface. */
export class Sprouts {
  readonly mesh: THREE.Mesh;
  private geo: THREE.BufferGeometry;
  private mat: THREE.MeshBasicMaterial;
  private segs = 8;
  private cols: THREE.Color[] = [];

  constructor() {
    this.geo = new THREE.BufferGeometry();
    const verts = HOLES.length * (this.segs + 1) * 2;
    this.geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    this.geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(verts * 3), 3));
    const idx: number[] = [];
    let base = 0;
    for (let s = 0; s < HOLES.length; s++) {
      for (let k = 0; k < this.segs; k++) {
        const a = base + k * 2;
        idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
      base += (this.segs + 1) * 2;
    }
    this.geo.setIndex(idx);
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), 4);
    this.cols = [new THREE.Color('#4f9c46'), new THREE.Color('#9ed86a')];
    this.mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.mesh = new THREE.Mesh(this.geo, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    this.setGrow(0);
  }

  /**
   * 0 = nothing, 1 = the tip has fully cleared the surface.
   *
   * `baseY` lifts the bottom of the shoot as the trench fills back in. Without
   * it the buried half of each shoot stays visible through the grazing angle of
   * the surface shot, and the plants look like they are lying on the soil.
   */
  setGrow(t: number, baseY = -0.02) {
    const pa = this.geo.getAttribute('position') as THREE.BufferAttribute;
    const ca = this.geo.getAttribute('color') as THREE.BufferAttribute;
    const p = pa.array as Float32Array;
    const c = ca.array as Float32Array;
    let v = 0;
    const y0 = baseY;
    for (let s = 0; s < HOLES.length; s++) {
      const h = HOLES[s];
      const delay = s * 0.07;
      const g = clamp01((t - delay) / (1 - delay));
      const topY = y0 + (GROWTH.sproutTop - y0) * g;
      for (let k = 0; k <= this.segs; k++) {
        const tt = k / this.segs;
        const y = y0 + (topY - y0) * tt;
        // a shoot leans a touch as it lengthens, and narrows to a point
        const lean = Math.sin(tt * 1.9) * 0.020 * g * (s % 2 ? 1 : -1);
        const w = 0.0145 * (1 - Math.pow(tt, 1.55)) * g;
        const x = h.x + lean;
        const z = h.z + 0.022;
        p[v] = x - w; p[v + 1] = y; p[v + 2] = z;
        p[v + 3] = x + w; p[v + 4] = y; p[v + 5] = z;
        const col = this.cols[0].clone().lerp(this.cols[1], smoothstep(0.25, 1, tt));
        c[v] = col.r; c[v + 1] = col.g; c[v + 2] = col.b;
        c[v + 3] = col.r; c[v + 4] = col.g; c[v + 5] = col.b;
        v += 6;
      }
    }
    pa.needsUpdate = true;
    ca.needsUpdate = true;
  }

  dispose() { this.geo.dispose(); this.mat.dispose(); }
}
