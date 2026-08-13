// src/vfx/pipeFlow.ts
// createPipeFlow(curve, options?) — a glowing water slug traveling t:0..1
// through a cutaway pipe. The pipe shell is a partial-arc tube (open on one
// side so the interior reads as "cutaway"); the water itself is a near-full
// tube driven entirely by an animated shader keyed on tube-length UV vs. a
// uProgress uniform — no geometry is rebuilt per frame, and no fluid
// simulation. Default framing assumes docs/CAMERA_STORYBOARD.md's Gate B
// round 3 diagram-style side-on camera (see PipeFlowOptions.cutawayFaces).

import * as THREE from 'three';
import { buildArcTubeGeometry } from './tubeGeometry';
import { DropletEmitter } from './droplets';

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
  uniform vec3 uColorTrail;
  uniform vec3 uColorGlow;
  varying vec2 vUv;
  void main() {
    // headDist > 0: this point has already been passed by the leading edge
    // (a calming, DARKER wet trail — never a flat constant fill). headDist
    // < 0: water hasn't arrived yet (dry, ~empty pipe). Visible identically
    // at every uProgress from 0 to 1 — no fade-out near the end, since this
    // is purely a function of (uProgress - vUv.y), symmetric across the
    // whole 0..1 range (the earlier "vanishes near t=0.8-0.9" bug was a
    // geometry/frame-orientation issue, fixed in tubeGeometry.ts, not here).
    float headDist = uProgress - vUv.y;
    float wetTrail = exp(-max(headDist, 0.0) / (uWindow * 1.4)) * step(0.0, headDist);
    float leadBright = smoothstep(uWindow * 0.75, 0.0, abs(headDist));
    float aheadHint = smoothstep(0.0, uWindow * 0.3, -headDist) * (1.0 - smoothstep(uWindow * 0.7, uWindow * 1.2, -headDist));

    float shimmer = 0.85 + 0.15 * sin(vUv.x * 18.0 + uTime * 4.0);
    // Trail is a darker, more saturated teal (reads as "wet" rather than
    // "still glowing"); the leading edge itself pops bright cyan-white.
    vec3 color = mix(uColorTrail, uColorBase, smoothstep(1.0, 0.15, wetTrail));
    color = mix(color, uColorGlow, leadBright);
    float alpha = (wetTrail * 0.62 + leadBright * 0.95 + aheadHint * 0.18) * shimmer;
    alpha = clamp(alpha, 0.0, 0.92);
    if (alpha < 0.015) discard;
    gl_FragColor = vec4(color, alpha);
  }
`;

export interface PipeFlowOptions {
  radialSegments?: number;
  /**
   * Which way the cutaway opening faces, in the tube's local cross-section
   * frame (see tubeGeometry.ts): 'up' (world +Y — right for an elevated 3D
   * tracking camera looking down into the pipe) or 'side' (the frame's
   * binormal, a horizontal direction perpendicular to the pipe's run —
   * right for docs/CAMERA_STORYBOARD.md's Gate B round 3 diagram-style
   * side-on camera, which is why it's the default). If the final camera
   * ends up on the opposite horizontal side, flip to 'side-opposite'.
   */
  cutawayFaces?: 'up' | 'side' | 'side-opposite';
}

function cutawayCenterAngleRad(faces: PipeFlowOptions['cutawayFaces']): number {
  if (faces === 'side-opposite') return -Math.PI / 2;
  if (faces === 'up') return 0;
  return Math.PI / 2; // 'side' (default)
}

export function createPipeFlow(curve: THREE.CatmullRomCurve3, options: PipeFlowOptions = {}): PipeFlow {
  const group = new THREE.Group();
  group.name = 'vfx-pipe-flow';

  const radialSegments = options.radialSegments ?? 10;
  const tubularSegments = Math.max(24, Math.min(96, Math.round(curve.getLength() * 12)));
  // Sized up from the original 3D-tracking-shot version: a diagram-style
  // side-on view reads best with a chunkier, more legible cross-section
  // rather than a thin realistic pipe.
  const shellRadius = 0.24;
  const waterRadius = shellRadius * 0.82;
  const gapCenterRad = cutawayCenterAngleRad(options.cutawayFaces);

  // Cutaway casing: leaves a ~100° gap open, centered on gapCenterRad.
  const gapDeg = 100;
  const shellGeo = buildArcTubeGeometry(
    curve,
    tubularSegments,
    shellRadius,
    radialSegments,
    gapCenterRad + THREE.MathUtils.degToRad(gapDeg / 2),
    THREE.MathUtils.degToRad(360 - gapDeg),
  );
  // Light stone/lead interior tone — explicitly NOT near-black, per
  // docs/CAMERA_STORYBOARD.md's "土壌を黒く潰さない" direction extended to
  // the pipe cross-section itself: the shell needs to read as a legible
  // mid-light surface the glowing slug can contrast against, not a dark
  // void. roughness/metalness kept low so it stays a matte stone-like read
  // rather than a shiny metal one.
  const shellMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color('#c9c0a6'),
    roughness: 0.82,
    metalness: 0.04,
    side: THREE.DoubleSide,
  });
  const shell = new THREE.Mesh(shellGeo, shellMaterial);
  shell.name = 'fountain-pipe-shell';
  shell.receiveShadow = true;
  group.add(shell);

  // Water is a near-full ring (340°, only a sliver removed to avoid exactly
  // co-locating with the shell's own gap edge) rather than a narrow partial
  // arc: with the pipe/gap orientation now depending on wherever Worker A's
  // still-landing camera actually ends up (see cutawayFaces above), a wide
  // ring guarantees a clearly visible portion shows through the opening
  // from a broad range of viewing angles instead of depending on hitting
  // one exact angle.
  const waterArcDeg = 340;
  const waterGeo = buildArcTubeGeometry(
    curve,
    tubularSegments,
    waterRadius,
    radialSegments,
    gapCenterRad + Math.PI - THREE.MathUtils.degToRad(waterArcDeg / 2),
    THREE.MathUtils.degToRad(waterArcDeg),
  );
  // A fixed uv-fraction window (not world-length-derived): the camera's
  // on-screen framing can show anywhere from a short to a fairly long
  // stretch of curve depending on its offset/FOV. Sized to be a clearly
  // legible slug + wet trail — "the brightest, most eye-catching thing on
  // screen" per the Gate B round 3 brief — without covering the whole tube
  // like a flat fill.
  const uWindowValue = 0.3;
  const slugMaterial = new THREE.ShaderMaterial({
    vertexShader: SLUG_VERTEX,
    fragmentShader: SLUG_FRAGMENT,
    uniforms: {
      uProgress: { value: 0 },
      uWindow: { value: uWindowValue },
      uTime: { value: 0 },
      uColorBase: { value: new THREE.Color('#4fa7bf') },
      uColorTrail: { value: new THREE.Color('#1f5a6e') },
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

  // A few small, bright sparkle particles right at the leading edge —
  // "optional small win" from the Gate B round 3 brief, cheap and budgeted
  // via the shared particle pool.
  const sparkle = new DropletEmitter({
    requestedCount: 18,
    color: new THREE.Color('#eafcff'),
    baseSize: 3.2,
    gravity: 0.05,
    lifetimeRange: [0.18, 0.32],
    peakAlpha: 0.75,
  });
  sparkle.points.renderOrder = 3;
  group.add(sparkle.points);

  let progress = 0;
  let spawnAccumulator = 0;
  const headPoint = new THREE.Vector3();
  const flatVelocity = (): THREE.Vector3 =>
    new THREE.Vector3((Math.random() - 0.5) * 0.25, (Math.random() - 0.3) * 0.15, (Math.random() - 0.5) * 0.25);

  return {
    group,
    update(dt: number, elapsed: number): void {
      slugMaterial.uniforms.uTime!.value = elapsed;

      if (progress > 0.01 && progress < 0.999) {
        spawnAccumulator += dt * 20;
        while (spawnAccumulator >= 1) {
          spawnAccumulator -= 1;
          headPoint.copy(curve.getPointAt(progress));
          sparkle.spawn(1, headPoint, flatVelocity);
        }
      }
      sparkle.update(dt);
    },
    setProgress(t: number): void {
      progress = Math.max(0, Math.min(1, t));
      slugMaterial.uniforms.uProgress!.value = progress;
    },
    dispose(): void {
      shellGeo.dispose();
      shellMaterial.dispose();
      waterGeo.dispose();
      slugMaterial.dispose();
      sparkle.dispose();
    },
  };
}
