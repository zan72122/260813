import * as THREE from 'three'
import { mulberry32 } from './rng'
import { BISCUIT_H, CREAM_H } from './metrics'

/** Multi-octave value noise texture shared by the hero materials. */
export function makeNoiseTexture(size = 128): THREE.CanvasTexture {
  const rng = mulberry32(777)
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')!
  const img = ctx.createImageData(size, size)

  const grid = (n: number) => {
    const g: number[] = []
    for (let i = 0; i < n * n; i++) g.push(rng())
    return (x: number, y: number) => {
      const xi = Math.floor(x) % n
      const yi = Math.floor(y) % n
      const xf = x - Math.floor(x)
      const yf = y - Math.floor(y)
      const s = (t: number) => t * t * (3 - 2 * t)
      const idx = (a: number, b: number) => g[((a % n) + n) % n + ((((b % n) + n) % n) * n)]
      const v00 = idx(xi, yi)
      const v10 = idx(xi + 1, yi)
      const v01 = idx(xi, yi + 1)
      const v11 = idx(xi + 1, yi + 1)
      return v00 + (v10 - v00) * s(xf) + (v01 - v00) * s(yf) + (v11 + v00 - v10 - v01) * s(xf) * s(yf)
    }
  }
  const n1 = grid(8)
  const n2 = grid(16)
  const n3 = grid(32)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 8
      const v = (y / size) * 8
      const val = n1(u, v) * 0.5 + n2(u * 2, v * 2) * 0.3 + n3(u * 4, v * 4) * 0.2
      const b = Math.round(val * 255)
      const i = (y * size + x) * 4
      img.data[i] = img.data[i + 1] = img.data[i + 2] = b
      img.data[i + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)
  const tex = new THREE.CanvasTexture(c)
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  return tex
}

export interface BiscuitMat {
  mat: THREE.MeshStandardMaterial
  uniforms: { uSoak: { value: number }; uBend: { value: number } }
}

/**
 * Ladyfinger material: dry porous sponge that darkens as coffee soaks in
 * (noise-driven so the stain creeps patch by patch), plus a droop bend
 * used while it is held after dipping.
 */
export function makeBiscuitMaterial(noiseTex: THREE.Texture): BiscuitMat {
  const uniforms = { uSoak: { value: 0 }, uBend: { value: 0 } }
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0,
  })
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uSoak = uniforms.uSoak
    sh.uniforms.uBend = uniforms.uBend
    sh.uniforms.uNoiseTex = { value: noiseTex }
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vLocal;\nuniform float uBend;',
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vLocal = position;
transformed.y -= uBend * pow(abs(position.x) / 0.75, 2.0) * 0.13;`,
      )
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vLocal;
uniform float uSoak;
uniform sampler2D uNoiseTex;
float gWet = 0.0;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float n1 = texture2D(uNoiseTex, vLocal.xz * vec2(0.5, 1.4) + vec2(vLocal.y * 0.35, 0.0)).r;
  float n2 = texture2D(uNoiseTex, vLocal.xz * vec2(2.2, 5.0)).r;
  float n = n1 * 0.7 + n2 * 0.3;
  gWet = smoothstep(n * 0.85 - 0.2, n * 0.85 + 0.3, uSoak * 1.2);
  vec3 dry = vec3(0.93, 0.80, 0.55);
  vec3 crust = vec3(0.82, 0.60, 0.33);
  vec3 wet = vec3(0.30, 0.185, 0.10);
  vec3 base = mix(dry, crust, smoothstep(0.45, 0.9, n2));
  diffuseColor.rgb = mix(base, wet, gWet * 0.95);
}`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.45, gWet);`,
      )
  }
  mat.customProgramCacheKey = () => 'biscuit'
  return { mat, uniforms }
}

/**
 * The layered cross-section: soaked-biscuit brown and cream ivory bands
 * with noisy, slightly wavy boundaries. y is local, 0 at content base.
 */
export function makeStripeMaterial(noiseTex: THREE.Texture): THREE.MeshStandardMaterial {
  const b = BISCUIT_H
  const c = CREAM_H
  const y1 = b // 0.26
  const y2 = b + c // 0.40
  const y3 = 2 * b + c // 0.66
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0 })
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uNoiseTex = { value: noiseTex }
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLocal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position;')
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vLocal;\nuniform sampler2D uNoiseTex;',
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float n = texture2D(uNoiseTex, vLocal.xz * 1.4 + vLocal.yy * 0.7).r;
  float n2 = texture2D(uNoiseTex, vLocal.xz * 5.0 + vLocal.yy * 2.0).r;
  float y = vLocal.y + (n - 0.5) * 0.045;
  vec3 cream = vec3(0.955, 0.93, 0.855);
  vec3 soaked = mix(vec3(0.36, 0.225, 0.125), vec3(0.52, 0.34, 0.19), n2);
  vec3 col;
  if (y < ${y1.toFixed(3)}) col = soaked;
  else if (y < ${y2.toFixed(3)}) col = cream;
  else if (y < ${y3.toFixed(3)}) col = soaked;
  else col = cream;
  float edge = min(min(abs(y - ${y1.toFixed(3)}), abs(y - ${y2.toFixed(3)})), abs(y - ${y3.toFixed(3)}));
  col *= mix(0.82, 1.0, smoothstep(0.0, 0.02, edge));
  diffuseColor.rgb = col;
}`,
      )
  }
  mat.customProgramCacheKey = () => 'stripes'
  return mat
}

export const DISH_TINTS = [0xbfe0f0, 0xf6cfe0, 0xffe2ad, 0xcfeecf]

export function makeGlassMaterial(tint: number): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial({
    color: tint,
    transparent: true,
    opacity: 0.1,
    roughness: 0.08,
    metalness: 0,
    depthWrite: false,
    side: THREE.DoubleSide,
  })
}

/** Soft round sprite used by particle systems. */
export function makeDotTexture(color = '#ffffff'): THREE.CanvasTexture {
  const c = document.createElement('canvas')
  c.width = c.height = 32
  const ctx = c.getContext('2d')!
  const g = ctx.createRadialGradient(16, 16, 1, 16, 16, 15)
  g.addColorStop(0, color)
  g.addColorStop(0.65, color)
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, 32, 32)
  return new THREE.CanvasTexture(c)
}
