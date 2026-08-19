import * as THREE from 'three'

/**
 * The squeeze-bag + nozzle the child "holds". Its tip sits a little ABOVE the
 * finger so the sand never comes out from under the fingertip.
 */
export class Nozzle {
  readonly group = new THREE.Group()
  readonly tip = new THREE.Object3D()
  private bag: THREE.Mesh
  private bagMat: THREE.MeshPhongMaterial
  private neckMat: THREE.MeshPhongMaterial
  private ring: THREE.Mesh
  private ringMat: THREE.MeshBasicMaterial
  private squeeze = 0
  private bob = 0
  private vacuum = false
  private lastColor = '#ffc86a'

  constructor() {
    this.bagMat = new THREE.MeshPhongMaterial({
      color: 0xffd07a,
      shininess: 70,
      specular: 0xffffff,
      emissive: 0x1c1408,
      transparent: true,
      opacity: 0.97,
    })
    this.neckMat = new THREE.MeshPhongMaterial({
      color: 0xf2fbff,
      shininess: 110,
      specular: 0xffffff,
      emissive: 0x141c20,
      transparent: true,
      opacity: 0.92,
    })

    // bag body
    this.bag = new THREE.Mesh(new THREE.SphereGeometry(0.36, 18, 14), this.bagMat)
    this.bag.position.y = 0.78
    this.bag.scale.set(1, 1.12, 1)
    this.group.add(this.bag)

    // collar
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.055, 8, 18), this.neckMat)
    collar.position.y = 0.46
    collar.rotation.x = Math.PI / 2
    this.group.add(collar)

    // neck / nozzle cone
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.26, 0.44, 14, 1, true), this.neckMat)
    neck.position.y = 0.26
    this.group.add(neck)

    const lip = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.035, 8, 14), this.neckMat)
    lip.position.y = 0.045
    lip.rotation.x = Math.PI / 2
    this.group.add(lip)

    // glowing tip ring, so the emission point is always visible
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xfff3c4,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    })
    this.ring = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.028, 6, 18), this.ringMat)
    this.ring.rotation.x = Math.PI / 2
    this.ring.position.y = 0.02
    this.group.add(this.ring)

    this.tip.position.set(0, 0, 0)
    this.group.add(this.tip)
    this.group.renderOrder = 5
  }

  setColor(hex: string) {
    if (!this.vacuum) this.bagMat.color.set(hex)
    this.lastColor = hex
  }

  /** Swaps the look between "squeeze out sand" and "suck sand back in". */
  setMode(mode: 'sand' | 'vacuum') {
    this.vacuum = mode === 'vacuum'
    if (this.vacuum) {
      this.bagMat.color.set(0xbcdae8)
      this.bagMat.opacity = 0.7
      this.ringMat.color.set(0x9fe6ff)
    } else {
      this.bagMat.color.set(this.lastColor)
      this.bagMat.opacity = 0.97
      this.ringMat.color.set(0xfff3c4)
    }
  }

  update(dt: number, pressing: boolean, motion: number) {
    const target = pressing ? 1 : 0
    this.squeeze += (target - this.squeeze) * Math.min(1, dt * 12)
    const s = this.squeeze
    this.bag.scale.set(1 + s * 0.14, 1.12 - s * 0.24, 1 + s * 0.14)
    this.bag.position.y = 0.78 - s * 0.07
    this.bob += dt * (pressing ? 9 : 2.2)
    const wobble = Math.sin(this.bob) * (pressing ? 0.012 : 0.02) * motion
    this.group.position.y += wobble * 0.0
    this.bag.rotation.z = wobble * 2
    this.ringMat.opacity = 0.35 + s * 0.5 + Math.sin(this.bob * 1.7) * 0.08
    // sucking rings pull inward, squeezing rings push out
    this.ring.scale.setScalar(
      this.vacuum ? 1.35 - 0.5 * (this.bob * 0.35 % 1) : 1 + s * 0.25
    )
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh
      if (m.geometry) m.geometry.dispose()
    })
    this.bagMat.dispose()
    this.neckMat.dispose()
    this.ringMat.dispose()
  }
}
