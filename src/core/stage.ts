import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { PALETTE, LIGHTS, STYLE, PARTICLES, REDUCED_MOTION } from '../style';

/**
 * Stage owns renderer, scene, lights, sky dome and the floating light motes.
 * Depth is painted with light and value hierarchy — no shadow maps (see STYLE_LOCK.rendering).
 */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly motes: THREE.Points;
  private moteMat: THREE.ShaderMaterial;
  private skyMat: THREE.ShaderMaterial;
  time = 0;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: STYLE.rendering.antialias,
      powerPreference: 'high-performance'
    });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = STYLE.rendering.toneMappingExposure;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, STYLE.rendering.pixelRatioMax));
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(
      new THREE.Color(STYLE.rendering.fog.color),
      STYLE.rendering.fog.near,
      STYLE.rendering.fog.far
    );

    // Soft studio environment for hair sheen / gem sparkle. Generated once, tiny.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.06).texture;
    pmrem.dispose();

    // --- Lights (three-point; the rim is the soul of the hair) ---
    const key = new THREE.DirectionalLight(new THREE.Color(LIGHTS.key.color), LIGHTS.key.intensity);
    key.position.fromArray(LIGHTS.key.position);
    const fill = new THREE.DirectionalLight(new THREE.Color(LIGHTS.fill.color), LIGHTS.fill.intensity);
    fill.position.fromArray(LIGHTS.fill.position);
    const rim = new THREE.DirectionalLight(new THREE.Color(LIGHTS.rim.color), LIGHTS.rim.intensity);
    rim.position.fromArray(LIGHTS.rim.position);
    const hemi = new THREE.HemisphereLight(
      new THREE.Color(LIGHTS.ambient.skyColor),
      new THREE.Color(LIGHTS.ambient.groundColor),
      LIGHTS.ambient.intensity
    );
    this.scene.add(key, fill, rim, hemi);

    // --- Twilight sky dome ---
    this.skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTop: { value: new THREE.Color(PALETTE.skyTop) },
        uMid: { value: new THREE.Color(PALETTE.skyMid) },
        uLow: { value: new THREE.Color(PALETTE.skyLow) },
        uGlow: { value: new THREE.Color(PALETTE.skyGlow) },
        uTime: { value: 0 }
      },
      vertexShader: /* glsl */ `
        varying vec3 vPos;
        void main() {
          vPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying vec3 vPos;
        uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uLow; uniform vec3 uGlow;
        uniform float uTime;
        void main() {
          float h = normalize(vPos).y;               // -1..1
          vec3 c = mix(uLow, uMid, smoothstep(-0.55, 0.05, h));
          c = mix(c, uTop, smoothstep(0.05, 0.75, h));
          // A quiet lagoon glow low behind the character, breathing very slowly.
          float glow = exp(-8.0 * pow(h + 0.22, 2.0)) * (0.5 + 0.08 * sin(uTime * 0.35));
          float az = atan(vPos.x, vPos.z);
          glow *= exp(-1.4 * pow(az - 0.35, 2.0));
          c += uGlow * glow * 0.55;
          gl_FragColor = vec4(c, 1.0);
        }
      `
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(18, 32, 24), this.skyMat);
    this.scene.add(dome);

    // Ground mist disc — anchors the figure without a hard floor line.
    const mist = new THREE.Mesh(
      new THREE.CircleGeometry(9, 48),
      new THREE.MeshBasicMaterial({
        color: new THREE.Color(PALETTE.groundMist),
        transparent: true,
        opacity: 0.85,
        depthWrite: false
      })
    );
    mist.rotation.x = -Math.PI / 2;
    mist.position.y = -0.02;
    this.scene.add(mist);

    // --- Floating light motes (fireflies / pollen of the water garden) ---
    const count = REDUCED_MOTION ? PARTICLES.moteCountReducedMotion : PARTICLES.moteCount;
    const pos = new Float32Array(Math.max(count, 1) * 3);
    const seed = new Float32Array(Math.max(count, 1));
    const warm = new Float32Array(Math.max(count, 1));
    let rng = 12841;
    const rand = () => ((rng = (rng * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < count; i++) {
      // Two shells: an intimate ring around the girl + a distant scatter.
      const near = rand() < 0.55;
      const spread = near ? 1.6 : 5.5;
      pos[i * 3] = (rand() - 0.5) * spread;
      pos[i * 3 + 1] = near ? 0.5 + rand() * 1.9 : 0.2 + rand() * 3.2;
      pos[i * 3 + 2] = near ? -0.8 + rand() * 2.2 : -4.5 + rand() * 4.0;
      seed[i] = rand() * 100;
      warm[i] = rand() > 0.6 ? 1 : 0;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    g.setAttribute('aWarm', new THREE.BufferAttribute(warm, 1));
    this.moteMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uWarm: { value: new THREE.Color(PALETTE.moteWarm) },
        uCool: { value: new THREE.Color(PALETTE.moteCool) },
        uDrift: { value: REDUCED_MOTION ? 0 : PARTICLES.moteDriftSpeed }
      },
      vertexShader: /* glsl */ `
        attribute float aSeed; attribute float aWarm;
        uniform float uTime; uniform float uDrift;
        varying float vWarm; varying float vTwinkle;
        void main() {
          vWarm = aWarm;
          vec3 p = position;
          p.x += sin(uTime * uDrift * 4.0 + aSeed) * 0.25;
          p.y += sin(uTime * uDrift * 2.6 + aSeed * 1.7) * 0.35;
          p.z += cos(uTime * uDrift * 3.2 + aSeed * 0.9) * 0.25;
          vTwinkle = 0.45 + 0.55 * pow(0.5 + 0.5 * sin(uTime * 0.8 + aSeed * 3.0), 2.0);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = mix(${PARTICLES.moteSizeMin.toFixed(3)}, ${PARTICLES.moteSizeMax.toFixed(3)}, fract(aSeed * 7.31));
          gl_PointSize = size * 900.0 / max(-mv.z, 0.5);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uWarm; uniform vec3 uCool;
        varying float vWarm; varying float vTwinkle;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float a = smoothstep(0.5, 0.05, length(d)) * vTwinkle * 0.65;
          vec3 c = mix(uCool, uWarm, vWarm);
          gl_FragColor = vec4(c, a);
        }
      `
    });
    this.motes = new THREE.Points(g, this.moteMat);
    this.motes.visible = count > 0;
    this.scene.add(this.motes);
  }

  resize(w: number, h: number): void {
    this.renderer.setSize(w, h, false);
  }

  tick(dt: number): void {
    this.time += dt;
    this.moteMat.uniforms.uTime.value = this.time;
    this.skyMat.uniforms.uTime.value = this.time;
  }

  render(camera: THREE.Camera): void {
    this.renderer.render(this.scene, camera);
  }
}
