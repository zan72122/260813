import * as THREE from 'three';

/**
 * Hero materials of the game: raw dough, baked dough, glossy chocolate and the
 * printed face. Everything is MeshPhongMaterial — cheap on a mobile GPU, and
 * with one warm key light plus a cool rim it still gives chocolate a believable
 * highlight.
 */

const CELLS = 8;

/** Golden-brown tint + oven puff, driven by a moving bake front in world X. */
export function injectBake(mat, key) {
  const u = {
    uBakeX: { value: 1e4 },
    uBakeSpan: { value: 2.0 },
    uPuff: { value: 0 },
    uBakeAll: { value: 0 },
    uBakeTint: { value: new THREE.Color(0.95, 0.76, 0.5) },
  };
  mat.userData.bake = u;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    prev?.(shader);
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float uBakeX; uniform float uBakeSpan; uniform float uPuff; uniform float uBakeAll;
varying float vBake;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vec4 bakeWorld = modelMatrix *
#ifdef USE_INSTANCING
  instanceMatrix *
#endif
  vec4(transformed, 1.0);
vBake = max(uBakeAll, clamp((bakeWorld.x - uBakeX) / uBakeSpan, 0.0, 1.0));
transformed += normal * (uPuff * vBake);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vBake; uniform vec3 uBakeTint;`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * uBakeTint * 1.16, vBake);`,
      );
  };
  const base = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => base() + '|bake|' + key;
  return mat;
}

/** Pick one of the 8 printed cells: per instance, or per mesh for the hero. */
export function injectCell(mat, { instanced, key }) {
  const u = { uCell: { value: 0 } };
  mat.userData.cell = u;
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader) => {
    prev?.(shader);
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
${instanced ? 'attribute float aCell;' : 'uniform float uCell;'}`,
      )
      .replace(
        '#include <uv_vertex>',
        `#include <uv_vertex>
#ifdef USE_MAP
  vMapUv = vec2((vMapUv.x + ${instanced ? 'aCell' : 'uCell'}) / ${CELLS.toFixed(1)}, vMapUv.y);
#endif`,
      );
  };
  const base = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => base() + '|cell|' + key + (instanced ? 'i' : 'u');
  return mat;
}

function dough(extra = {}) {
  return new THREE.MeshPhongMaterial({
    color: 0xffffff,
    specular: 0x3a2a1c,
    shininess: 12,
    flatShading: false,
    ...extra,
  });
}

/**
 * One biscuit material set = [printed face, underside, crumbly edge].
 * @param {{map:THREE.Texture, bottomMap?:THREE.Texture, bump?:THREE.Texture,
 *          instanced?:boolean, baked?:boolean, key:string}} opts
 */
export function makeBiscuitMaterials({
  map,
  bottomMap,
  bump,
  instanced = false,
  baked = false,
  xray = false,
  key,
}) {
  const face = dough({ map, bumpMap: bump, bumpScale: bump ? 0.02 : 0 });
  injectCell(face, { instanced, key: key + 'f' });
  injectBake(face, key + 'f');

  const bottom = dough({ map: bottomMap || null, color: bottomMap ? 0xffffff : 0xf0d9a9 });
  injectBake(bottom, key + 'b');

  const edge = dough({ color: 0xecd2a0, shininess: 6 });
  injectBake(edge, key + 'e');

  const set = [face, bottom, edge];
  set.forEach((m) => {
    if (baked) m.userData.bake.uBakeAll.value = 1;
    // `transparent` is baked into the shader program (it defines OPAQUE), so a
    // material that will ever need the x-ray is created transparent up front —
    // flipping it at runtime would force a recompile mid-gesture.
    if (xray) m.transparent = true;
  });
  set.setBake = (x, puff = 0) =>
    set.forEach((m) => {
      m.userData.bake.uBakeX.value = x;
      m.userData.bake.uPuff.value = puff;
    });
  set.setBakeAll = (v) => set.forEach((m) => (m.userData.bake.uBakeAll.value = v));
  set.setCell = (c) => (face.userData.cell.uCell.value = c);
  set.setCutaway = (k) => {
    // k = 0 solid biscuit, 1 = cutaway. The two flat faces go see-through while
    // the crumbly rim stays solid, so it reads like a cut-open diagram and the
    // biscuit keeps its silhouette.
    face.opacity = 1 - k * 0.82;
    bottom.opacity = 1 - k * 0.82;
    edge.opacity = 1 - k * 0.12;
    set.forEach((m) => (m.depthWrite = k < 0.3));
  };
  return set;
}

/** Glossy chocolate that spreads outward from the injection hole. */
export function makeChocoMaterial({ key = 'choco' } = {}) {
  const mat = new THREE.MeshPhongMaterial({
    color: 0x51280f,
    specular: 0xf0c48c,
    shininess: 150,
    side: THREE.DoubleSide,
  });
  const u = {
    uFillR: { value: 0 },
    uHole: { value: new THREE.Vector2(0, 0) },
    uFront: { value: new THREE.Color(0x9c5620) },
    uFlow: { value: 1 },
  };
  mat.userData.fill = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLocal;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvLocal = transformed;`);
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vLocal; uniform float uFillR; uniform vec2 uHole; uniform vec3 uFront; uniform float uFlow;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
float chocoR = length(vLocal.xz - uHole);
if (chocoR > uFillR) discard;
diffuseColor.rgb = mix(diffuseColor.rgb, uFront, smoothstep(uFillR - 0.09, uFillR - 0.005, chocoR) * uFlow);`,
      );
  };
  const base = mat.customProgramCacheKey.bind(mat);
  mat.customProgramCacheKey = () => base() + '|fill|' + key;
  mat.setFill = (r) => (u.uFillR.value = r);
  mat.setHole = (x, z) => u.uHole.value.set(x, z);
  return mat;
}

export function makeStripMaterial(map) {
  const m = dough({ map, shininess: 10 });
  injectBake(m, 'strip');
  return m;
}
