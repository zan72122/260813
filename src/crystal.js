import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeRng } from './rng.js';
import { CRYSTAL_VERT, CRYSTAL_FRAG } from './shaders.js';

/**
 * ビスマスの「ホッパー結晶」＝四角い枠が階段状に積み上がった形。
 * 中央がへこんで、上に行くほど小さくなる。
 *
 * たねの数だけ結晶が生え、近いものは重なって双晶になる。
 * 段ごとに育つアニメができるよう、頂点に aLayer / aCenter / aRand を持たせ、
 * ぜんぶを1つのジオメトリにまとめる（ドローコールは1回）。
 */
export function buildClusterGeometry(spec) {
  const parts = [];

  const pushBox = (w, h, d, x, y, z, rotY, layerIdx, center, rand) => {
    if (w <= 0.001 || d <= 0.001 || h <= 0.001) return;
    const g = new THREE.BoxGeometry(w, h, d);
    // その場で回してから置く（枠の向きだけ変えたい）
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z));

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

  spec.crystals.forEach((c, ci) => {
    const rng = makeRng((spec.seed >>> 0 || 1) + ci * 7919);

    for (let i = 0; i < c.layers; i++) {
      const t = i / Math.max(1, c.layers - 1);
      const size = c.size * (1 - c.shrink * Math.pow(t, 0.85)) * rng.range(0.95, 1.05);
      const y = 0.02 + i * c.step;
      const rotY = c.twist * i + rng.range(-0.015, 0.015);
      const cx = c.x + c.lean * i;
      const cz = c.z + c.lean * i * 0.6;
      const center = new THREE.Vector3(cx, y, cz);
      const h = c.step * 1.06;

      if (i === 0) {
        // 一番下は板（すけない土台）
        pushBox(size * 2, h, size * 2, cx, y, cz, rotY, i, center, rng.next());
        continue;
      }

      // 四角い枠を 4 本の棒で作る。枠が細いほど 空洞が深く見える。
      const w = Math.max(0.022, size * c.frameRatio * rng.range(0.9, 1.15));
      const bar = size - w / 2;
      pushBox(size * 2, h, w, cx, y, cz + bar, rotY, i, center, rng.next());
      pushBox(size * 2, h, w, cx, y, cz - bar, rotY, i, center, rng.next());
      pushBox(w, h, size * 2 - w * 2, cx + bar, y, cz, rotY, i, center, rng.next());
      pushBox(w, h, size * 2 - w * 2, cx - bar, y, cz, rotY, i, center, rng.next());

      // ときどき小さな出っぱり（おなじ形にならないように）
      if (rng.next() < 0.45) {
        const sx = rng.sign();
        const sz = rng.sign();
        pushBox(
          w * rng.range(0.8, 1.4),
          h,
          w * rng.range(0.8, 1.4),
          cx + sx * size * rng.range(0.75, 1.15),
          y,
          cz + sz * size * rng.range(0.75, 1.15),
          rotY,
          i,
          center,
          rng.next(),
        );
      }
    }

    // たまごいし：深い空洞のなかに、小さな結晶が ひとつ入る
    if (spec.inner && ci === 0) {
      const iy = 0.02 + Math.floor(c.layers * 0.45) * c.step;
      const isz = c.size * 0.26;
      for (let k = 0; k < 3; k++) {
        const center = new THREE.Vector3(c.x, iy + k * c.step * 0.7, c.z);
        pushBox(
          isz * 2 * (1 - k * 0.22),
          c.step * 0.72,
          isz * 2 * (1 - k * 0.22),
          c.x,
          iy + k * c.step * 0.7,
          c.z,
          k * 0.3,
          Math.floor(c.layers * 0.45) + k,
          center,
          rng.next(),
        );
      }
    }
  });

  const geo = mergeGeometries(parts, false);
  parts.forEach((p) => p.dispose());
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
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
      uFilmBase: { value: 0 }, // 酸化膜の厚み＝色（引き上げた温度で決まる）
      uFilmSpread: { value: 0.3 }, // 段ごとの色のずれ
      uWaterline: { value: 0 }, // これより下は 液に浸かっていたので 銀のまま
    },
    vertexShader: CRYSTAL_VERT,
    fragmentShader: CRYSTAL_FRAG,
  });
}
