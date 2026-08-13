import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng } from './rng.js';
import { CRYSTAL_VERT, CRYSTAL_FRAG } from './shaders.js';

/**
 * ビスマスの「ホッパー結晶」＝四角い枠が階段状に積み上がった形。
 * 中央がへこんで、上に行くほど小さくなる。段ごとに育つアニメが
 * できるよう、頂点に aLayer / aCenter / aRand を持たせる。
 */
export function buildCrystalGeometry(seed) {
  const rng = makeRng(seed);

  const layerCount = rng.int(7, 11);
  const step = rng.range(0.075, 0.098); // 一段の高さ
  const baseSize = rng.range(0.26, 0.35); // 一番下の半径
  const shrink = rng.range(0.44, 0.66); // 上に行くほど細くなる量
  const twist = rng.range(-0.07, 0.07); // 段ごとのねじれ
  const frameRatio = rng.range(0.22, 0.32); // 枠のふとさ
  const lean = rng.range(-0.016, 0.016); // すこしだけ かたよって育つ

  const parts = [];
  const layers = [];

  const pushBox = (w, h, d, x, y, z, rotY, layerIdx, center, rand) => {
    const g = new THREE.BoxGeometry(w, h, d);
    // その場で回してから置く（枠の向きだけ変えたい）
    const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z);
    g.applyMatrix4(m);

    const n = g.attributes.position.count;
    const aLayer = new Float32Array(n);
    const aCenter = new Float32Array(n * 3);
    const aRand = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      aLayer[i] = layerIdx;
      aCenter[i * 3] = center.x;
      aCenter[i * 3 + 1] = center.y;
      aCenter[i * 3 + 2] = center.z;
      aRand[i] = rand;
    }
    g.setAttribute('aLayer', new THREE.BufferAttribute(aLayer, 1));
    g.setAttribute('aCenter', new THREE.BufferAttribute(aCenter, 3));
    g.setAttribute('aRand', new THREE.BufferAttribute(aRand, 1));
    g.deleteAttribute('uv');
    parts.push(g);
  };

  for (let i = 0; i < layerCount; i++) {
    const t = i / Math.max(1, layerCount - 1);
    const size = baseSize * (1 - shrink * Math.pow(t, 0.85)) * rng.range(0.95, 1.05);
    const y = 0.02 + i * step;
    const rotY = twist * i + rng.range(-0.015, 0.015);
    const cx = lean * i;
    const cz = lean * i * 0.6;
    const center = new THREE.Vector3(cx, y, cz);
    const h = step * 1.06;
    layers.push({ y, size, center });

    if (i === 0) {
      // 一番下は板（すけない土台）
      pushBox(size * 2, h, size * 2, cx, y, cz, rotY, i, center, rng.next());
      continue;
    }

    // 四角い枠を 4 本の棒で作る
    const w = Math.max(0.028, size * frameRatio * rng.range(0.9, 1.15));
    const bar = size - w / 2;
    pushBox(size * 2, h, w, cx, y, cz + bar, rotY, i, center, rng.next());
    pushBox(size * 2, h, w, cx, y, cz - bar, rotY, i, center, rng.next());
    pushBox(w, h, size * 2 - w * 2, cx + bar, y, cz, rotY, i, center, rng.next());
    pushBox(w, h, size * 2 - w * 2, cx - bar, y, cz, rotY, i, center, rng.next());

    // ときどき小さな出っぱり（同じ形にならないように）
    if (rng.next() < 0.45) {
      const s = rng.sign();
      const q = rng.sign();
      pushBox(
        w * rng.range(0.8, 1.4),
        h,
        w * rng.range(0.8, 1.4),
        cx + s * size * rng.range(0.75, 1.15),
        y,
        cz + q * size * rng.range(0.75, 1.15),
        rotY,
        i,
        center,
        rng.next(),
      );
    }
  }

  // ときどき、となりに小さな双子の結晶がくっつく
  if (rng.next() < 0.5) {
    const sub = Math.min(4, layerCount - 3);
    const ox = rng.sign() * baseSize * rng.range(0.9, 1.25);
    const oz = rng.sign() * baseSize * rng.range(0.5, 1.0);
    for (let i = 0; i < sub; i++) {
      const size = baseSize * rng.range(0.34, 0.48) * (1 - 0.4 * (i / sub));
      const y = 0.02 + i * step;
      const center = new THREE.Vector3(ox, y, oz);
      const layerIdx = i + 0.5;
      const h = step * 1.06;
      if (i === 0) {
        pushBox(size * 2, h, size * 2, ox, y, oz, twist * i, layerIdx, center, rng.next());
      } else {
        const w = Math.max(0.022, size * frameRatio);
        const bar = size - w / 2;
        pushBox(size * 2, h, w, ox, y, oz + bar, twist * i, layerIdx, center, rng.next());
        pushBox(size * 2, h, w, ox, y, oz - bar, twist * i, layerIdx, center, rng.next());
        pushBox(w, h, size * 2 - w * 2, ox + bar, y, oz, twist * i, layerIdx, center, rng.next());
        pushBox(w, h, size * 2 - w * 2, ox - bar, y, oz, twist * i, layerIdx, center, rng.next());
      }
    }
  }

  const geo = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  geo.computeBoundingBox();
  geo.computeBoundingSphere();

  const bb = geo.boundingBox;
  const height = bb.max.y - bb.min.y;
  const width = Math.max(bb.max.x - bb.min.x, bb.max.z - bb.min.z);

  return {
    geometry: geo,
    layerCount,
    height,
    width,
    seed,
    // 大きさは毎回すこし変わる（4歳児にも「おおきい！」がわかる）
    sizeClass: width > 0.72 ? 'big' : width > 0.58 ? 'mid' : 'small',
  };
}

export function makeCrystalMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCam: { value: new THREE.Vector3() },
      uTime: { value: 0 },
      uGrow: { value: 0 },
      uRainbow: { value: 0 },
      uHeat: { value: 0 },
      uMelt: { value: 0 },
      uLayers: { value: 8 },
      uSpin: { value: 0 },
      uSpotlight: { value: 0 },
    },
    vertexShader: CRYSTAL_VERT,
    fragmentShader: CRYSTAL_FRAG,
  });
}
