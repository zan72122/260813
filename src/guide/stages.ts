import * as THREE from 'three'
import { WORLD } from '../core/config'
import { framing, type Framing } from '../core/cameraRig'
import { PathGuide, makeFoundationDecal, makeGateOutline } from './guides'

export type StageId =
  | 'title'
  | 'surface'
  | 'dive'
  | 'foundation'
  | 'towerL'
  | 'towerR'
  | 'wall'
  | 'arch'
  | 'decor'
  | 'finale'
  | 'free'

/** Castle proportions. Mutable so "another castle" can change the shape. */
export const LAYOUT = {
  towerX: WORLD.towerX,
  towerTop: WORLD.towerTop,
  gateHalf: WORLD.gateHalf,
  wallTop: WORLD.wallTop,
  archTop: WORLD.archTop,
  foundationRX: WORLD.foundationRX,
  wallY: 1.02,
}

export const VARIANTS = [
  { towerX: 1.85, towerTop: 3.1, gateHalf: 0.85, wallTop: 1.55, archTop: 2.2, foundationRX: 2.35, wallY: 1.0 },
  { towerX: 2.2, towerTop: 2.5, gateHalf: 1.0, wallTop: 1.3, archTop: 1.95, foundationRX: 2.7, wallY: 0.85 },
  { towerX: 1.55, towerTop: 3.6, gateHalf: 0.7, wallTop: 1.72, archTop: 2.45, foundationRX: 2.1, wallY: 1.12 },
]

export function setVariant(i: number) {
  const v = VARIANTS[((i % VARIANTS.length) + VARIANTS.length) % VARIANTS.length]
  Object.assign(LAYOUT, v)
}

/** The doorway that must stay hollow for the fish. */
export const GATE = {
  get halfX() {
    return LAYOUT.gateHalf
  },
  get yMin() {
    return WORLD.seabedY + 0.38
  },
  get yMax() {
    return LAYOUT.wallTop - 0.1
  },
  get centerY() {
    return (WORLD.seabedY + 0.38 + LAYOUT.wallTop - 0.1) * 0.5
  },
}

const _tmp = new THREE.Vector3()
const _arc = new THREE.Vector3()

function softClampX(p: THREE.Vector3, limit: number, k = 0.5) {
  if (p.x > limit) p.x += (limit - p.x) * k
  else if (p.x < -limit) p.x += (-limit - p.x) * k
}

/** Slides sand out of the doorway instead of letting it plug the hole. */
export function keepGateClear(p: THREE.Vector3) {
  const pad = 0.3
  if (p.y > GATE.yMin - 0.18 && p.y < GATE.yMax && Math.abs(p.x) < GATE.halfX + pad) {
    const s = p.x >= 0 ? 1 : -1
    const target = s * (GATE.halfX + 0.24)
    p.x += (target - p.x) * 0.85
  }
}

export function archPoints(n: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = []
  const gh = LAYOUT.gateHalf + 0.1
  const base = LAYOUT.wallTop
  const rise = LAYOUT.archTop - LAYOUT.wallTop
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * Math.PI
    pts.push(new THREE.Vector3(-Math.cos(a) * gh, base + Math.sin(a) * rise, 0))
  }
  return pts
}

function nearestOnArch(p: THREE.Vector3, out: THREE.Vector3) {
  const pts = archPoints(20)
  let bd = Infinity
  for (const q of pts) {
    const d = (q.x - p.x) ** 2 + (q.y - p.y) ** 2
    if (d < bd) {
      bd = d
      out.copy(q)
    }
  }
  void _tmp
}

export interface StageDef {
  id: StageId
  guide: () => PathGuide | null
  view: () => Framing
  snap: (p: THREE.Vector3, speed: number) => void
  zSpread: number
  need: number
  patience: number
  soft: number
  pip: boolean
}

export const STAGES: Record<StageId, StageDef> = {
  title: {
    id: 'title',
    guide: () => null,
    view: () =>
      window.innerWidth > window.innerHeight
        ? framing(1.15, WORLD.waterY + 1.25, 2.3, 1.5, 5, 0)
        : framing(0, WORLD.waterY + 1.35, 1.5, 1.75, 5, 0),
    snap: () => {},
    zSpread: 0.3,
    need: 2,
    patience: 1e9,
    soft: 2,
    pip: false,
  },
  surface: {
    id: 'surface',
    guide: () => null,
    view: () =>
      window.innerWidth > window.innerHeight
        ? framing(0, WORLD.waterY + 0.55, 2.4, 1.7, 4, 0)
        : framing(0, WORLD.waterY + 0.7, 1.7, 2.0, 4, 0),
    snap: () => {},
    zSpread: 0.3,
    need: 2,
    patience: 1e9,
    soft: 2,
    pip: false,
  },
  dive: {
    id: 'dive',
    guide: () => null,
    view: () => framing(0, WORLD.waterY - 2.2, 2.6, 2.1, 2, 0),
    snap: () => {},
    zSpread: 0.3,
    need: 2,
    patience: 1e9,
    soft: 2,
    pip: false,
  },

  foundation: {
    id: 'foundation',
    guide: () => {
      const g = new PathGuide(
        [
          [
            new THREE.Vector3(-LAYOUT.foundationRX + 0.15, WORLD.seabedY + 0.24, 0),
            new THREE.Vector3(0, WORLD.seabedY + 0.26, 0),
            new THREE.Vector3(LAYOUT.foundationRX - 0.15, WORLD.seabedY + 0.24, 0),
          ],
        ],
        0.44,
        0xffe6a8
      )
      const decal = makeFoundationDecal()
      decal.scale.set(LAYOUT.foundationRX + 0.35, 1, WORLD.foundationRZ + 0.45)
      g.addExtra(decal)
      return g
    },
    view: () => framing(0, 0.6, LAYOUT.foundationRX + 0.32, 1.05, 14, 0),
    snap: (p) => {
      p.y += (WORLD.seabedY + 0.22 - p.y) * 0.72
      softClampX(p, LAYOUT.foundationRX + 0.25, 0.6)
    },
    zSpread: 0.62,
    need: 0.8,
    patience: 26,
    soft: 0.45,
    pip: true,
  },

  towerL: {
    id: 'towerL',
    guide: () =>
      new PathGuide(
        [
          [
            new THREE.Vector3(-LAYOUT.towerX, WORLD.seabedY + 0.45, 0),
            new THREE.Vector3(-LAYOUT.towerX, LAYOUT.towerTop, 0),
          ],
        ],
        0.4,
        0xbfeaff
      ),
    view: () => framing(-LAYOUT.towerX, LAYOUT.towerTop * 0.54, 1.45, LAYOUT.towerTop * 0.62, 9, -11),
    snap: (p) => {
      p.x += (-LAYOUT.towerX - p.x) * 0.55
      if (p.y > LAYOUT.towerTop + 0.35) p.y += (LAYOUT.towerTop + 0.35 - p.y) * 0.6
    },
    zSpread: 0.28,
    need: 0.8,
    patience: 26,
    soft: 0.5,
    pip: true,
  },

  towerR: {
    id: 'towerR',
    guide: () =>
      new PathGuide(
        [
          [
            new THREE.Vector3(LAYOUT.towerX, WORLD.seabedY + 0.45, 0),
            new THREE.Vector3(LAYOUT.towerX, LAYOUT.towerTop, 0),
          ],
        ],
        0.4,
        0xffc9e2
      ),
    view: () => framing(LAYOUT.towerX, LAYOUT.towerTop * 0.54, 1.45, LAYOUT.towerTop * 0.62, 9, 11),
    snap: (p) => {
      p.x += (LAYOUT.towerX - p.x) * 0.55
      if (p.y > LAYOUT.towerTop + 0.35) p.y += (LAYOUT.towerTop + 0.35 - p.y) * 0.6
    },
    zSpread: 0.28,
    need: 0.8,
    patience: 26,
    soft: 0.5,
    pip: true,
  },

  wall: {
    id: 'wall',
    guide: () => {
      const y = LAYOUT.wallY
      const g = new PathGuide(
        [
          [
            new THREE.Vector3(-LAYOUT.towerX + 0.05, y, 0),
            new THREE.Vector3(-LAYOUT.gateHalf - 0.25, y, 0),
          ],
          [
            new THREE.Vector3(LAYOUT.gateHalf + 0.25, y, 0),
            new THREE.Vector3(LAYOUT.towerX - 0.05, y, 0),
          ],
        ],
        0.38,
        0xffe6a8
      )
      g.addExtra(makeGateOutline(LAYOUT.gateHalf, LAYOUT.wallTop, LAYOUT.archTop))
      return g
    },
    view: () => framing(0, LAYOUT.wallTop * 0.8, LAYOUT.towerX + 0.72, 1.5, 7, 0),
    snap: (p) => {
      p.y += (LAYOUT.wallY - p.y) * 0.5
      keepGateClear(p)
      softClampX(p, LAYOUT.towerX + 0.1, 0.55)
    },
    zSpread: 0.34,
    need: 0.75,
    patience: 30,
    soft: 0.45,
    pip: true,
  },

  arch: {
    id: 'arch',
    guide: () => {
      const g = new PathGuide([archPoints(8)], 0.34, 0x9ff0ff)
      g.addExtra(makeGateOutline(LAYOUT.gateHalf, LAYOUT.wallTop, LAYOUT.archTop))
      return g
    },
    view: () => framing(0, LAYOUT.archTop * 0.74, 1.6, 1.3, 3, 0),
    snap: (p) => {
      nearestOnArch(p, _arc)
      p.x += (_arc.x - p.x) * 0.5
      p.y += (_arc.y - p.y) * 0.55
      keepGateClear(p)
    },
    zSpread: 0.3,
    need: 0.75,
    patience: 30,
    soft: 0.45,
    pip: true,
  },

  decor: {
    id: 'decor',
    guide: () => null,
    view: () => framing(0, LAYOUT.towerTop * 0.56, LAYOUT.towerX + 0.9, LAYOUT.towerTop * 0.8, 10, 0),
    snap: (p) => {
      keepGateClear(p)
      softClampX(p, WORLD.halfWidth - 0.4, 0.6)
    },
    zSpread: 0.36,
    need: 2,
    patience: 1e9,
    soft: 2,
    pip: true,
  },

  finale: {
    id: 'finale',
    guide: () => null,
    view: () => framing(0, LAYOUT.towerTop * 0.5, LAYOUT.towerX + 1.25, LAYOUT.towerTop * 0.75, 12, 0),
    snap: () => {},
    zSpread: 0.3,
    need: 2,
    patience: 1e9,
    soft: 2,
    pip: false,
  },

  free: {
    id: 'free',
    guide: () => null,
    view: () => framing(0, 1.45, LAYOUT.towerX + 1.2, 2.0, 11, 0),
    snap: (p) => {
      softClampX(p, WORLD.halfWidth - 0.3, 0.6)
    },
    zSpread: 0.42,
    need: 2,
    patience: 1e9,
    soft: 2,
    pip: false,
  },
}

export const GUIDED_ORDER: StageId[] = ['foundation', 'towerL', 'towerR', 'wall', 'arch', 'decor']
