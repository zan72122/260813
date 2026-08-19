import * as THREE from 'three'
import { COLORS, WORLD } from '../core/config'
import { rng } from '../core/rng'

export interface EnvOptions {
  quality: 'high' | 'low'
}

/** Water, seabed, light shafts, drifting motes — everything that is not sand. */
export class Environment {
  readonly group = new THREE.Group()
  readonly seabed: THREE.Mesh
  readonly water: THREE.Mesh
  private uTime = { value: 0 }
  private uCaustic = { value: 1 }
  private waterMat: THREE.ShaderMaterial
  private backMat: THREE.ShaderMaterial
  private shafts: THREE.Mesh[] = []
  private motes: THREE.Points
  private moteMat: THREE.ShaderMaterial
  private decor: THREE.Group
  private weeds: THREE.Group[] = []

  constructor(opts: EnvOptions) {
    const hi = opts.quality === 'high'

    // ------------------------------------------------------------ backdrop
    const backGeo = new THREE.SphereGeometry(70, 24, 16)
    this.backMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: this.uTime,
        uWaterY: { value: WORLD.waterY },
        uDeep: { value: COLORS.deepWater },
        uShallow: { value: COLORS.shallowWater },
        uSky: { value: COLORS.skyTop },
      },
      vertexShader: `
        varying vec3 vPos;
        void main() {
          vPos = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform float uWaterY;
        uniform vec3 uDeep;
        uniform vec3 uShallow;
        uniform vec3 uSky;
        varying vec3 vPos;
        void main() {
          float y = vPos.y;
          vec3 col;
          if (y > uWaterY) {
            float t = clamp((y - uWaterY) / 26.0, 0.0, 1.0);
            col = mix(mix(uShallow, uSky, 0.55), uSky, t);
          } else {
            float t = clamp((uWaterY - y) / 30.0, 0.0, 1.0);
            col = mix(mix(uShallow, uSky, 0.30), uDeep, pow(t, 0.6));
            float band = sin(y * 0.6 + uTime * 0.35) * 0.5 + 0.5;
            col += vec3(0.02, 0.045, 0.05) * band * (1.0 - t);
          }
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    })
    const back = new THREE.Mesh(backGeo, this.backMat)
    back.frustumCulled = false
    this.group.add(back)

    // ------------------------------------------------------------- seabed
    const segs = hi ? 96 : 56
    const seaGeo = new THREE.PlaneGeometry(46, 46, segs, segs)
    seaGeo.rotateX(-Math.PI / 2)
    {
      const pos = seaGeo.attributes.position as THREE.BufferAttribute
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const z = pos.getZ(i)
        const d = Math.hypot(x, z)
        // keep the build area flat, let dunes rise further out
        const away = THREE.MathUtils.smoothstep(d, 5.5, 17)
        const h =
          Math.sin(x * 0.31) * Math.cos(z * 0.27) * 0.55 +
          Math.sin(x * 0.11 + z * 0.16) * 0.9 +
          Math.sin(z * 0.44 + 1.7) * 0.22
        pos.setY(i, h * away + Math.sin(x * 1.6 + z * 1.1) * 0.02)
      }
      seaGeo.computeVertexNormals()
    }
    const seaMat = new THREE.MeshLambertMaterial({ color: 0xe9e7d3 })
    seaMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.uTime
      sh.uniforms.uCaustic = this.uCaustic
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
        .replace(
          '#include <worldpos_vertex>',
          '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;'
        )
      sh.fragmentShader = sh.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform float uTime;
           uniform float uCaustic;
           varying vec3 vWPos;
           float caustic(vec2 p) {
             float t = uTime * 0.32;
             float v = 0.0;
             for (int n = 0; n < ${hi ? 3 : 2}; n++) {
               float f = 1.0 + float(n) * 0.85;
               vec2 q = p * f + vec2(sin(t * 0.7 + float(n) * 2.1), cos(t * 0.53 + float(n) * 1.7));
               v += sin(q.x + sin(q.y * 1.3 + t)) * sin(q.y + sin(q.x * 1.1 - t));
             }
             v /= ${hi ? '3.0' : '2.0'};
             return pow(clamp(v * 0.5 + 0.5, 0.0, 1.0), 4.0);
           }`
        )
        .replace(
          '#include <map_fragment>',
          `#include <map_fragment>
           float g = fract(sin(dot(floor(vWPos.xz * 42.0), vec2(12.9898, 78.233))) * 43758.5453);
           float ripple = sin(vWPos.x * 2.6 + sin(vWPos.z * 0.9) * 2.2) * 0.5 + 0.5;
           diffuseColor.rgb *= 0.9 + g * 0.2;
           diffuseColor.rgb *= 0.93 + ripple * 0.12;
           float d = length(vWPos.xz);
           float ca = caustic(vWPos.xz * 0.95) * uCaustic * (1.0 - smoothstep(6.0, 16.0, d));
           diffuseColor.rgb += vec3(0.55, 0.80, 0.70) * ca * 0.58;
           diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.12, 0.44, 0.53), 0.17 + smoothstep(3.5, 17.0, d) * 0.70);
           diffuseColor.rgb = clamp(diffuseColor.rgb, 0.0, 1.0);`
        )
    }
    this.seabed = new THREE.Mesh(seaGeo, seaMat)
    this.seabed.position.y = WORLD.seabedY
    this.seabed.receiveShadow = false
    this.group.add(this.seabed)

    // -------------------------------------------------------- water surface
    const waterGeo = new THREE.PlaneGeometry(84, 84, hi ? 44 : 22, hi ? 44 : 22)
    waterGeo.rotateX(-Math.PI / 2)
    this.waterMat = new THREE.ShaderMaterial({
      transparent: true,
      side: THREE.DoubleSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uTime: this.uTime,
        uShallow: { value: COLORS.shallowWater },
        uSky: { value: COLORS.skyTop },
        uMotion: { value: 1 },
      },
      vertexShader: `
        uniform float uTime;
        uniform float uMotion;
        varying vec3 vWPos;
        varying float vWave;
        void main() {
          vec3 p = position;
          float w = sin(p.x * 0.7 + uTime * 1.1) * 0.09
                  + sin(p.z * 0.9 - uTime * 0.8) * 0.07
                  + sin((p.x + p.z) * 0.35 + uTime * 0.5) * 0.06;
          p.y += w * uMotion;
          vWave = w;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vWPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform float uTime;
        uniform vec3 uShallow;
        uniform vec3 uSky;
        varying vec3 vWPos;
        varying float vWave;
        void main() {
          vec3 vd = normalize(vWPos - cameraPosition);
          float facing = abs(vd.y);
          float above = step(vWPos.y, cameraPosition.y);

          // seen from below: bright Snell's window straight up, water at the edges
          float win = smoothstep(0.25, 0.95, facing);
          vec3 under = mix(uShallow * 0.75, uSky, win * 0.85);
          float aUnder = 0.36 + win * 0.42;

          // seen from above: sky reflection at grazing angles, water looking down
          float fres = pow(1.0 - facing, 4.0);
          vec3 over = mix(uShallow * 0.82, uSky, clamp(fres * 1.05 + 0.42, 0.0, 1.0));
          float aOver = 0.62 + fres * 0.34;

          vec3 col = mix(under, over, above);
          float a = mix(aUnder, aOver, above);

          float rip = sin(vWPos.x * 3.1 + uTime * 1.7) * sin(vWPos.z * 2.6 - uTime * 1.3);
          col += vec3(0.14, 0.18, 0.16) * smoothstep(0.55, 1.0, rip);
          col += vec3(0.16) * smoothstep(0.03, 0.12, vWave) * (0.5 + above * 0.8);
          float d = length(vWPos.xz);
          a *= 1.0 - smoothstep(24.0, 39.0, d);
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
        }`,
    })
    this.water = new THREE.Mesh(waterGeo, this.waterMat)
    this.water.position.y = WORLD.waterY
    this.water.renderOrder = 20
    this.group.add(this.water)

    // ------------------------------------------------------------- shafts
    const shaftMat = new THREE.MeshBasicMaterial({
      color: 0xa8e8f0,
      transparent: true,
      opacity: 0.05,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    })
    const shaftCount = hi ? 5 : 3
    for (let i = 0; i < shaftCount; i++) {
      const w = rng.range(0.7, 1.7)
      const g = new THREE.PlaneGeometry(w, WORLD.waterY + 3)
      const m = new THREE.Mesh(g, shaftMat)
      m.position.set(rng.range(-8, 8), WORLD.waterY / 2 - 1, rng.range(-9, -2))
      m.rotation.z = rng.range(-0.22, 0.22)
      m.renderOrder = 18
      this.shafts.push(m)
      this.group.add(m)
    }

    // -------------------------------------------------------------- motes
    const moteN = hi ? 260 : 120
    const mp = new Float32Array(moteN * 3)
    const mo = new Float32Array(moteN)
    for (let i = 0; i < moteN; i++) {
      mp[i * 3] = rng.range(-11, 11)
      mp[i * 3 + 1] = rng.range(0.2, WORLD.waterY)
      mp[i * 3 + 2] = rng.range(-7, 5)
      mo[i] = rng.range(0, 6.28)
    }
    const moteGeo = new THREE.BufferGeometry()
    moteGeo.setAttribute('position', new THREE.BufferAttribute(mp, 3))
    moteGeo.setAttribute('aPhase', new THREE.BufferAttribute(mo, 1))
    this.moteMat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      fog: false,
      uniforms: { uTime: this.uTime, uSize: { value: 1 } },
      vertexShader: `
        uniform float uTime;
        uniform float uSize;
        attribute float aPhase;
        varying float vA;
        void main() {
          vec3 p = position;
          p.y = mod(p.y + uTime * 0.14 + aPhase, ${(WORLD.waterY + 0.4).toFixed(2)});
          p.x += sin(uTime * 0.5 + aPhase) * 0.3;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_PointSize = (3.2 * uSize) * (14.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
          vA = 0.30 + 0.25 * sin(uTime * 1.6 + aPhase * 3.0);
        }`,
      fragmentShader: `
        varying float vA;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = 1.0 - smoothstep(0.15, 0.5, length(c));
          gl_FragColor = vec4(vec3(0.82, 0.95, 0.98), d * vA);
        }`,
    })
    this.motes = new THREE.Points(moteGeo, this.moteMat)
    this.motes.frustumCulled = false
    this.group.add(this.motes)

    // -------------------------------------------------------------- decor
    this.decor = new THREE.Group()
    this.buildDecor(hi)
    this.group.add(this.decor)
  }

  private buildDecor(hi: boolean) {
    const shellMat = new THREE.MeshPhongMaterial({ color: 0xffe7ef, shininess: 70, specular: 0xffffff })
    const shellMat2 = new THREE.MeshPhongMaterial({ color: 0xdff3ff, shininess: 70, specular: 0xffffff })
    const rockMat = new THREE.MeshLambertMaterial({ color: 0x7c8f8a })
    const shellGeo = new THREE.SphereGeometry(0.2, 10, 7, 0, Math.PI * 2, 0, Math.PI * 0.55)
    const rockGeo = new THREE.DodecahedronGeometry(0.4, 0)
    const n = hi ? 16 : 9
    for (let i = 0; i < n; i++) {
      const ring = rng.range(4.6, 11)
      const a = rng.range(0, Math.PI * 2)
      const x = Math.cos(a) * ring
      const z = Math.sin(a) * ring * 0.75 - 1.5
      if (Math.abs(x) < 4.2 && z > -3 && z < 2.4) continue
      if (rng.next() < 0.55) {
        const m = new THREE.Mesh(shellGeo, rng.next() < 0.5 ? shellMat : shellMat2)
        m.position.set(x, 0.03, z)
        m.rotation.set(rng.range(-0.3, 0.3), rng.range(0, 6.28), rng.range(-0.3, 0.3))
        m.scale.setScalar(rng.range(0.7, 1.5))
        this.decor.add(m)
      } else {
        const m = new THREE.Mesh(rockGeo, rockMat)
        m.position.set(x, rng.range(-0.15, 0.05), z)
        m.rotation.set(rng.range(0, 3), rng.range(0, 3), rng.range(0, 3))
        m.scale.set(rng.range(0.6, 1.6), rng.range(0.4, 0.9), rng.range(0.6, 1.6))
        this.decor.add(m)
      }
    }
    // seaweed-ish fronds far back
    const weedMat = new THREE.MeshLambertMaterial({
      color: 0x74d3aa,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
    })
    for (let i = 0; i < (hi ? 9 : 5); i++) {
      const h = rng.range(1.2, 2.8)
      const g = new THREE.PlaneGeometry(0.3, h, 1, 5)
      g.translate(0, h / 2, 0)
      // gentle curve so the frond is not a flat card
      {
        const pos = g.attributes.position as THREE.BufferAttribute
        const bend = rng.range(-0.35, 0.35)
        for (let v = 0; v < pos.count; v++) {
          const y = pos.getY(v)
          pos.setX(v, pos.getX(v) + bend * (y / h) * (y / h))
        }
        g.computeVertexNormals()
      }
      const blade = new THREE.Group()
      const a = new THREE.Mesh(g, weedMat)
      const b = new THREE.Mesh(g, weedMat)
      b.rotation.y = Math.PI / 2.2
      blade.add(a)
      blade.add(b)
      const side = rng.sign()
      blade.position.set(side * rng.range(4.6, 9), 0, rng.range(-6.5, -2))
      blade.rotation.y = rng.range(0, 3)
      this.weeds.push(blade)
      this.decor.add(blade)
    }
  }

  setMotion(motion: number) {
    this.waterMat.uniforms.uMotion.value = 0.25 + motion * 0.75
    this.moteMat.uniforms.uSize.value = 0.7 + motion * 0.5
  }

  setBrightness(b: number) {
    this.uCaustic.value = b
  }

  update(t: number, motion: number) {
    this.uTime.value = t
    for (let i = 0; i < this.weeds.length; i++) {
      this.weeds[i].rotation.z = Math.sin(t * 0.6 + i * 1.9) * 0.09 * motion
    }
    for (let i = 0; i < this.shafts.length; i++) {
      const s = this.shafts[i]
      s.rotation.z = Math.sin(t * 0.15 + i) * 0.16 * motion
      const mat = s.material as THREE.MeshBasicMaterial
      mat.opacity = 0.035 + 0.03 * (0.5 + 0.5 * Math.sin(t * 0.4 + i * 1.7))
    }
  }

  /** Keeps the light shafts roughly facing the camera without a full billboard. */
  faceCamera(cam: THREE.Camera) {
    for (const s of this.shafts) s.rotation.y = Math.atan2(cam.position.x - s.position.x, cam.position.z - s.position.z)
  }
}
