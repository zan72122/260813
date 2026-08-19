import {
  BoxGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  SphereGeometry,
  TorusGeometry,
  Vector2,
} from 'three'

export type ToolId = 'dig' | 'mound' | 'pour'

export type ToolModel = {
  id: ToolId
  group: Group
  /** Marker at the business end — blade tip / scoop mouth / spout hole. */
  tip: Object3D
  dispose: () => void
}

function matFactory(bag: Array<{ dispose: () => void }>) {
  return (color: string, roughness = 0.55, metalness = 0) => {
    const m = new MeshStandardMaterial({
      color: new Color(color),
      roughness,
      metalness,
    })
    bag.push(m)
    return m
  }
}

/** The big digging shovel: pink grip, wide pale blade. */
export function createShovel(): ToolModel {
  const bag: Array<{ dispose: () => void }> = []
  const mat = matFactory(bag)
  const keep = <T extends { dispose: () => void }>(g: T) => {
    bag.push(g)
    return g
  }
  const g = new Group()
  const grip = mat('#ff8ab5', 0.5)
  const gripDark = mat('#e05f92', 0.5)
  const blade = mat('#dff0fa', 0.32, 0.25)
  const bladeEdge = mat('#9fc6dd', 0.3, 0.35)

  const shaft = new Mesh(keep(new CylinderGeometry(0.062, 0.07, 0.86, 12)), grip)
  shaft.position.y = 0.44
  shaft.castShadow = true
  g.add(shaft)

  const bar = new Mesh(keep(new CylinderGeometry(0.05, 0.05, 0.34, 10)), gripDark)
  bar.rotation.z = Math.PI / 2
  bar.position.y = 0.88
  bar.castShadow = true
  g.add(bar)
  for (const s of [-1, 1]) {
    const knob = new Mesh(keep(new SphereGeometry(0.06, 10, 8)), grip)
    knob.position.set(s * 0.17, 0.88, 0)
    knob.castShadow = true
    g.add(knob)
  }

  const neck = new Mesh(keep(new CylinderGeometry(0.05, 0.06, 0.16, 10)), bladeEdge)
  neck.position.y = 0.03
  g.add(neck)

  const scoopShape = new Mesh(keep(new BoxGeometry(0.42, 0.07, 0.5)), blade)
  scoopShape.position.set(0, -0.06, 0.06)
  scoopShape.rotation.x = 0.2
  scoopShape.castShadow = true
  g.add(scoopShape)

  const lipL = new Mesh(keep(new BoxGeometry(0.05, 0.11, 0.5)), blade)
  for (const s of [-1, 1]) {
    const l = lipL.clone()
    l.position.set(s * 0.2, -0.02, 0.06)
    l.rotation.x = 0.2
    l.castShadow = true
    g.add(l)
  }

  const tipEdge = new Mesh(keep(new ConeGeometry(0.24, 0.2, 3)), bladeEdge)
  tipEdge.rotation.x = -Math.PI / 2 + 0.2
  tipEdge.rotation.y = Math.PI
  tipEdge.position.set(0, -0.12, 0.34)
  tipEdge.scale.set(1.2, 1, 0.5)
  tipEdge.castShadow = true
  g.add(tipEdge)

  const tip = new Object3D()
  tip.position.set(0, -0.15, 0.36)
  g.add(tip)

  return { id: 'dig', group: g, tip, dispose: () => bag.forEach((d) => d.dispose()) }
}

/** The mounding scoop: a chunky bucket-scoop for patting sand into place. */
export function createScoop(): ToolModel {
  const bag: Array<{ dispose: () => void }> = []
  const mat = matFactory(bag)
  const keep = <T extends { dispose: () => void }>(g: T) => {
    bag.push(g)
    return g
  }
  const g = new Group()
  const grip = mat('#ffd166', 0.5)
  const gripDark = mat('#e8a83a', 0.5)
  const cup = mat('#7fd8b8', 0.45)
  const cupDark = mat('#3fa682', 0.45)

  // Short, fat handle — the scoop's mass is in the bucket.
  const shaft = new Mesh(keep(new CylinderGeometry(0.075, 0.085, 0.46, 12)), grip)
  shaft.position.y = 0.5
  shaft.rotation.z = -0.12
  shaft.castShadow = true
  g.add(shaft)

  const knob = new Mesh(keep(new SphereGeometry(0.14, 14, 10)), gripDark)
  knob.position.set(-0.05, 0.74, 0)
  knob.scale.y = 0.82
  knob.castShadow = true
  g.add(knob)

  // Wide open bucket, tipped toward the viewer.
  const cupMesh = new Mesh(
    keep(new SphereGeometry(0.38, 18, 12, 0, Math.PI * 2, Math.PI * 0.46, Math.PI * 0.54)),
    cup,
  )
  cupMesh.position.set(0.02, 0.1, 0.06)
  cupMesh.rotation.x = -0.42
  cupMesh.scale.set(1.06, 1.15, 1.18)
  cupMesh.castShadow = true
  g.add(cupMesh)

  const rim = new Mesh(keep(new TorusGeometry(0.4, 0.045, 8, 22)), cupDark)
  rim.rotation.x = Math.PI / 2 - 0.42
  rim.position.set(0.02, 0.12, 0.06)
  rim.scale.set(1.06, 1.18, 1)
  rim.castShadow = true
  g.add(rim)

  // A heaped load of sand: the verb "pile", stated by the object itself.
  const sandMat = mat('#ecd49c', 0.99)
  const sandBlob = new Mesh(keep(new SphereGeometry(0.31, 14, 10)), sandMat)
  sandBlob.position.set(0.02, 0.16, 0.08)
  sandBlob.scale.set(1.12, 0.58, 1.2)
  g.add(sandBlob)
  const grainMat = mat('#f6e6bd', 0.99)
  for (const [gx, gz, gs] of [
    [-0.13, 0.02, 0.9],
    [0.12, 0.14, 0.75],
    [0.0, -0.09, 0.8],
  ] as Array<[number, number, number]>) {
    const b = new Mesh(keep(new SphereGeometry(0.09, 8, 6)), grainMat)
    b.position.set(0.02 + gx, 0.24, 0.08 + gz)
    b.scale.setScalar(gs)
    g.add(b)
  }

  const tip = new Object3D()
  tip.position.set(0, -0.16, 0.1)
  g.add(tip)

  return { id: 'mound', group: g, tip, dispose: () => bag.forEach((d) => d.dispose()) }
}

/** The watering can: sky-blue body, rainbow band, long spout. */
export function createCan(): ToolModel {
  const bag: Array<{ dispose: () => void }> = []
  const mat = matFactory(bag)
  const keep = <T extends { dispose: () => void }>(g: T) => {
    bag.push(g)
    return g
  }
  const g = new Group()
  const body = mat('#6fc7ea', 0.42)
  const bodyDark = mat('#3f9fca', 0.42)
  const band = mat('#ff9ec4', 0.4)
  const bandB = mat('#ffe08a', 0.4)

  // Lathe a soft can silhouette.
  const profile: Vector2[] = []
  const pts: Array<[number, number]> = [
    [0.0, 0.0],
    [0.3, 0.02],
    [0.36, 0.12],
    [0.37, 0.4],
    [0.33, 0.56],
    [0.27, 0.62],
    [0.26, 0.66],
    [0.0, 0.68],
  ]
  for (const [x, y] of pts) profile.push(new Vector2(x, y))
  const canBody = new Mesh(keep(new LatheGeometry(profile, 22)), body)
  canBody.castShadow = true
  g.add(canBody)

  const stripe = new Mesh(keep(new CylinderGeometry(0.375, 0.375, 0.09, 22)), band)
  stripe.position.y = 0.3
  g.add(stripe)
  const stripe2 = new Mesh(keep(new CylinderGeometry(0.372, 0.372, 0.05, 22)), bandB)
  stripe2.position.y = 0.2
  g.add(stripe2)

  const collar = new Mesh(keep(new TorusGeometry(0.26, 0.035, 8, 18)), bodyDark)
  collar.rotation.x = Math.PI / 2
  collar.position.y = 0.67
  g.add(collar)

  // Handle over the top.
  const handle = new Mesh(keep(new TorusGeometry(0.24, 0.038, 8, 20, Math.PI)), bodyDark)
  handle.position.set(-0.06, 0.66, 0)
  handle.rotation.y = Math.PI / 2
  handle.castShadow = true
  g.add(handle)

  // Spout.
  const spout = new Mesh(keep(new CylinderGeometry(0.055, 0.085, 0.72, 12)), bodyDark)
  spout.position.set(0.35, 0.36, 0)
  spout.rotation.z = -0.72
  spout.castShadow = true
  g.add(spout)
  const rose = new Mesh(keep(new CylinderGeometry(0.085, 0.06, 0.1, 12)), band)
  rose.position.set(0.58, 0.58, 0)
  rose.rotation.z = -0.72
  g.add(rose)

  const tip = new Object3D()
  tip.position.set(0.63, 0.62, 0)
  g.add(tip)

  return { id: 'pour', group: g, tip, dispose: () => bag.forEach((d) => d.dispose()) }
}

export function createTool(id: ToolId): ToolModel {
  if (id === 'dig') return createShovel()
  if (id === 'mound') return createScoop()
  return createCan()
}
