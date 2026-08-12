// src/vfx/pipeFlow.ts
// createPipeFlow(curve) — a glowing water slug traveling t:0..1 through a
// cutaway pipe. The pipe shell is a partial-arc tube (open on top so the
// interior reads as "cutaway"); the water itself is a full-arc tube driven
// entirely by an animated shader keyed on tube-length UV vs. a uProgress
// uniform — no geometry is rebuilt per frame, and no fluid simulation.

import * as THREE from 'three';
import { buildArcTubeGeometry } from './tubeGeometry';

export interface PipeFlow {
  readonly group: THREE.Group;
  update(dt: number, elapsed: number): void;
  setProgress(t: number): void;
  dispose(): void;
}

const SLUG_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const SLUG_FRAGMENT = /* glsl */ `
  precision mediump float;
  uniform float uProgress;
  uniform float uWindow;
  uniform float uTime;
  uniform vec3 uColorBase;
  uniform vec3 uColorGlow;
  varying vec2 vUv;
  void main() {
    // headDist > 0: this point has already been passed by the leading edge
    // (a calming wet trail, exponentially dimmer further back — never a
    // flat constant, which is what previously read as a uniform saturated
    // fill). headDist < 0: water hasn't arrived yet (dry, ~empty pipe).
    float headDist = uProgress - vUv.y;
    float wetTrail = exp(-max(headDist, 0.0) / (uWindow * 1.6)) * step(0.0, headDist);
    float leadBright = smoothstep(uWindow * 0.7, 0.0, abs(headDist));
    float aheadHint = smoothstep(0.0, uWindow * 0.35, -headDist) * (1.0 - smoothstep(uWindow * 0.8, uWindow * 1.4, -headDist));

    float shimmer = 0.85 + 0.15 * sin(vUv.x * 18.0 + uTime * 4.0);
    vec3 color = mix(uColorBase, uColorGlow, leadBright);
    float alpha = (wetTrail * 0.55 + leadBright * 0.8 + aheadHint * 0.15) * shimmer;
    alpha = clamp(alpha, 0.0, 0.78);
    if (alpha < 0.015) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export function createPipeFlow(curve: THREE.CatmullRomCurve3, radialSegments = 10): PipeFlow {
  const group = new THREE.Group();
  group.name = 'vfx-pipe-flow';

  const tubularSegments = Math.max(24, Math.min(96, Math.round(curve.getLength() * 12)));
  const shellRadius = 0.16;
  const waterRadius = shellRadius * 0.78;

  // Cutaway casing: leaves a ~100° gap at the top of the arc open.
  const gapDeg = 100;
  const shellGeo = buildArcTubeGeometry(
    curve,
    tubularSegments,
    shellRadius,
    radialSegments,
    THREE.MathUtils.degToRad(gapDeg / 2),
    THREE.MathUtils.degToRad(360 - gapDeg),
  );
  const shellMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#8f8672'),
    roughness: 0.85,
    metalness: 0.08,
    side: THREE.DoubleSide,
  });
  const shell = new THREE.Mesh(shellGeo, shellMaterial);
  shell.name = 'fountain-pipe-shell';
  shell.receiveShadow = true;
  group.add(shell);

  // Water sits as a partial arc nested near the BOTTOM of the interior
  // (opposite the shell's open-top gap, angle ~180°) rather than a full
  // 360° tube — a full tube depended on the viewer's exact angle to peek
  // through the narrow top opening and see the far interior wall, which in
  // practice read as "no water visible" from most external tracking angles.
  // A water surface resting at the bottom of the open channel is directly
  // visible from any angle that can see into the trough at all.
  const waterArcDeg = 110;
  const waterGeo = buildArcTubeGeometry(
    curve,
    tubularSegments,
    waterRadius,
    radialSegments,
    THREE.MathUtils.degToRad(180 - waterArcDeg / 2),
    THREE.MathUtils.degToRad(waterArcDeg),
  );
  // A fixed uv-fraction window (not world-length-derived): the external
  // tracking camera's on-screen framing can show anywhere from a short to a
  // fairly long stretch of curve depending on its offset/FOV, so a window
  // this small keeps the glow a clearly visible ~8% minority of the tube
  // (a legible "slug" with a wet trail behind it, per the exponential decay
  // below) without being so thin it can vanish between visible samples.
  const uWindowValue = 0.15;
  const slugMaterial = new THREE.ShaderMaterial({
    vertexShader: SLUG_VERTEX,
    fragmentShader: SLUG_FRAGMENT,
    uniforms: {
      uProgress: { value: 0 },
      uWindow: { value: uWindowValue },
      uTime: { value: 0 },
      uColorBase: { value: new THREE.Color('#3a7284') },
      uColorGlow: { value: new THREE.Color('#eafcff') },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  slugMaterial.toneMapped = false;
  const water = new THREE.Mesh(waterGeo, slugMaterial);
  water.name = 'fountain-pipe-water';
  water.renderOrder = 2;
  group.add(water);

  return {
    group,
    update(_dt: number, elapsed: number): void {
      slugMaterial.uniforms.uTime!.value = elapsed;
    },
    setProgress(t: number): void {
      slugMaterial.uniforms.uProgress!.value = Math.max(0, Math.min(1, t));
    },
    dispose(): void {
      shellGeo.dispose();
      shellMaterial.dispose();
      waterGeo.dispose();
      slugMaterial.dispose();
    },
  };
}
