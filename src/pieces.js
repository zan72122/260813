import * as THREE from 'three';
import { makeThicknessTexture } from './util.js';

/* Real-world scale: charms about 8-9 cm across, 4 mm thick titanium sheet,
 *  with a small hanging eyelet on top. Origin of each group = the eyelet,
 *  so hanging from the hoist hook is natural. */

const EXTRUDE = {
  depth: 0.004,
  bevelEnabled: true,
  bevelThickness: 0.0012,
  bevelSize: 0.0012,
  bevelSegments: 2,
  curveSegments: 24,
};

function starShape() {
  const shape = new THREE.Shape();
  const outer = 0.044, inner = 0.0205, n = 5;
  for (let i = 0; i < n * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (n * 2)) * Math.PI * 2 + Math.PI / 2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return [shape];
}

function butterflyShapes() {
  // one wing pair (right), mirrored for left
  const wing = new THREE.Shape();
  wing.moveTo(0.004, 0.010);
  wing.bezierCurveTo(0.030, 0.052, 0.062, 0.048, 0.052, 0.016);
  wing.bezierCurveTo(0.046, -0.002, 0.020, -0.002, 0.008, 0.000);
  wing.bezierCurveTo(0.026, -0.008, 0.044, -0.022, 0.034, -0.038);
  wing.bezierCurveTo(0.024, -0.052, 0.006, -0.032, 0.003, -0.014);
  wing.closePath();
  const wingL = new THREE.Shape();
  wing.getPoints(40).forEach((p, i) => {
    if (i === 0) wingL.moveTo(-p.x, p.y); else wingL.lineTo(-p.x, p.y);
  });
  wingL.closePath();
  return [wing, wingL];
}

function flowerShape() {
  // polar rose: 6 rounded petals
  const shape = new THREE.Shape();
  const N = 180;
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 2;
    const petal = Math.pow(Math.abs(Math.cos(th * 3)), 0.9);
    const r = 0.017 + 0.028 * petal;
    const x = Math.cos(th) * r, y = Math.sin(th) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  shape.closePath();
  return [shape];
}

/** MeshPhysicalMaterial with thin-film iridescence (three's model is the real
 *  interference computation - exactly what anodized TiO2 does) plus an
 *  underwater tint patched into the shader. */
export function makeTitaniumMaterial(envIntensity = 1.0) {
  const mat = new THREE.MeshPhysicalMaterial({
    color: 0xd9dade,
    metalness: 1.0,
    roughness: 0.22,
    envMapIntensity: envIntensity,
    iridescence: 0.0,
    iridescenceIOR: 2.35,           // TiO2
    iridescenceThicknessRange: [0, 12],
    iridescenceThicknessMap: makeThicknessTexture(),
    clearcoat: 0.0,
    clearcoatRoughness: 0.08,
  });
  const uniforms = {
    uWaterY: { value: -100 },
    uWaterColor: { value: new THREE.Color(0x0e3f46) },
  };
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vWorldY2;')
      .replace('#include <project_vertex>',
        '#include <project_vertex>\nvWorldY2 = (modelMatrix * vec4(transformed, 1.0)).y;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>',
        '#include <common>\nvarying float vWorldY2;\nuniform float uWaterY;\nuniform vec3 uWaterColor;')
      .replace('#include <dithering_fragment>', `
        float subDepth = uWaterY - vWorldY2;
        if (subDepth > 0.0) {
          float f = 1.0 - exp(-subDepth * 6.0);
          vec3 wet = mix(gl_FragColor.rgb, uWaterColor, 0.15) * (0.88 + 0.12 * exp(-subDepth * 4.0));
          gl_FragColor.rgb = mix(gl_FragColor.rgb, wet, f);
        }
        #include <dithering_fragment>`);
  };
  mat.userData.waterUniforms = uniforms;
  return mat;
}

function eyelet(mat) {
  const g = new THREE.TorusGeometry(0.0058, 0.0018, 8, 20);
  const m = new THREE.Mesh(g, mat);
  m.castShadow = true;
  return m;
}

/** Builds one charm. kind: 0 star | 1 butterfly | 2 flower.
 *  Group origin at the eyelet; body hangs below. */
export function makePiece(kind, envIntensity) {
  const mat = makeTitaniumMaterial(envIntensity);
  const group = new THREE.Group();
  const body = new THREE.Group();

  let shapes, topY;
  if (kind === 0) { shapes = starShape(); topY = 0.044; }
  else if (kind === 1) { shapes = butterflyShapes(); topY = 0.049; }
  else { shapes = flowerShape(); topY = 0.045; }

  for (const s of shapes) {
    const geo = new THREE.ExtrudeGeometry(s, EXTRUDE);
    geo.translate(0, 0, -EXTRUDE.depth / 2);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    body.add(mesh);
  }

  if (kind === 1) {
    // butterfly body + antennae
    const bodyGeo = new THREE.CapsuleGeometry(0.0052, 0.052, 4, 10);
    const bm = new THREE.Mesh(bodyGeo, mat);
    bm.castShadow = true;
    body.add(bm);
    for (const sx of [-1, 1]) {
      const ant = new THREE.Mesh(new THREE.CylinderGeometry(0.0012, 0.0008, 0.02, 5), mat);
      ant.position.set(sx * 0.006, 0.036, 0);
      ant.rotation.z = -sx * 0.6;
      body.add(ant);
      const tip = new THREE.Mesh(new THREE.SphereGeometry(0.0022, 8, 6), mat);
      tip.position.set(sx * 0.0125, 0.0445, 0);
      body.add(tip);
    }
  }
  if (kind === 2) {
    const center = new THREE.Mesh(new THREE.SphereGeometry(0.011, 16, 10), mat);
    center.scale.set(1, 1, 0.55);
    center.castShadow = true;
    body.add(center);
  }

  const ring = eyelet(mat);
  ring.position.set(0, 0, 0);
  group.add(ring);
  body.position.set(0, -(topY + 0.0065), 0);
  group.add(body);

  group.userData = { kind, mat, body };
  return group;
}

/** Anodizing state helper: drives film thickness + wet look on one material. */
export class Anodizer {
  /* The visible film starts at a 105 nm bias: with three's thin-film model
   * that places the growth arc exactly on the classic titanium journey
   * gold(140) -> purple(180) -> blue(200) -> sky(215) -> green(235) -> pink. */
  constructor(mat) {
    this.mat = mat;
    this.thickness = 0;   // grown nm of TiO2 (on top of the bias)
    this.max = 270;
    this.wet = 0;
  }
  grow(dt, rate = 12) {
    this.thickness = Math.min(this.max, this.thickness + dt * rate);
    this.apply();
  }
  apply() {
    const t = this.thickness;
    const m = this.mat;
    const film = 105 + t;
    m.iridescence = Math.min(1, t / 40);
    m.iridescenceThicknessRange = [film * 0.92, film * 1.06];
  }
  setWet(w) {
    this.wet = w;
    this.mat.clearcoat = 0.15 + 0.85 * w;
    this.mat.clearcoatRoughness = 0.22 - 0.16 * w;
  }
  get progress() { return this.thickness / this.max; }
}
