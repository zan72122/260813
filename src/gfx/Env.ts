import * as THREE from 'three';

/**
 * One shared bag of uniforms for lighting, fog, wind and the bloom wave.
 * Every material references the *same* uniform objects, so changing the wind or
 * moving the bloom front is a single assignment rather than a walk over the scene.
 */
export class Env {
  readonly u = {
    uTime: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0.42, 0.78, 0.46).normalize() },
    uSunColor: { value: new THREE.Color('#fff3d8') },
    uSkyColor: { value: new THREE.Color('#bfe2f7') },
    uGroundBounce: { value: new THREE.Color('#8d6a48') },
    uFogColor: { value: new THREE.Color('#cfe6f5') },
    uFogNear: { value: 85 },
    uFogFar: { value: 520 },
    uWindDir: { value: new THREE.Vector2(0.86, 0.5) },
    uWindAmp: { value: 0.05 },
    uWindSpeed: { value: 1.25 },
    uWaveOrigin: { value: new THREE.Vector3(0, 0, 0) },
    /** radius in metres of the bloom front; -1 means "nothing has bloomed" */
    uWaveRadius: { value: -1 },
    uWaveSoft: { value: 6.0 },
    /** biases the wave into an oval so replays can bloom in a different direction */
    uWaveDir: { value: new THREE.Vector2(0, 0) },
    uExposure: { value: 1.0 },
  };

  setSky(sky: string, fog: string, sun: string) {
    this.u.uSkyColor.value.set(sky);
    this.u.uFogColor.value.set(fog);
    this.u.uSunColor.value.set(sun);
  }
}

/** GLSL shared by the flower, ground and carpet materials. */
export const ENV_GLSL = /* glsl */`
uniform float uTime;
uniform vec3  uSunDir;
uniform vec3  uSunColor;
uniform vec3  uSkyColor;
uniform vec3  uGroundBounce;
uniform vec3  uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform vec2  uWindDir;
uniform float uWindAmp;
uniform float uWindSpeed;
uniform vec3  uWaveOrigin;
uniform float uWaveRadius;
uniform float uWaveSoft;
uniform vec2  uWaveDir;
uniform float uExposure;

float envWaveDist(vec2 p) {
  vec2 d = p - uWaveOrigin.xz;
  // uWaveDir stretches the metric so the wave can sweep preferentially one way
  float along = dot(d, uWaveDir);
  return length(d) - along * 0.35;
}

vec3 envFog(vec3 col, float dist) {
  float f = smoothstep(uFogNear, uFogFar, dist);
  return mix(col, uFogColor, f * 0.86);
}

vec3 envSaturate(vec3 c, float s) {
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  return max(vec3(0.0), mix(vec3(l), c, s));
}

float hash11(float p) { return fract(sin(p * 127.1) * 43758.5453); }
float hash12(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

/** Soft wrapped-diffuse lighting with a translucency term for petals. */
export const LIGHT_GLSL = /* glsl */`
vec3 envShade(vec3 albedo, vec3 N, vec3 V, float translucency, float ao) {
  float nl = dot(N, uSunDir);
  float wrap = clamp(nl * 0.55 + 0.55, 0.0, 1.0);
  vec3 sky = mix(uGroundBounce, uSkyColor, clamp(N.y * 0.5 + 0.5, 0.0, 1.0));
  vec3 col = albedo * (sky * 0.46 + uSunColor * wrap * 0.86);
  // light coming through the back of a petal - the thing that stops plastic look
  float back = clamp(dot(-N, uSunDir), 0.0, 1.0);
  float vb = clamp(dot(V, -uSunDir) * 0.5 + 0.5, 0.0, 1.0);
  col += albedo * uSunColor * pow(back, 1.6) * vb * translucency;
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  col += uSunColor * rim * 0.10 * translucency;
  col *= mix(0.62, 1.0, ao);
  return col * uExposure;
}
`;
