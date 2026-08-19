import * as THREE from 'three'

/** World layout (metres-ish). Everything else is derived from these. */
export const WORLD = {
  seabedY: 0,
  waterY: 6.4,
  buildZ: 0, // the construction plane the finger draws on
  halfWidth: 4.6,
  /** how far the base spreads away from the camera */
  foundationRZ: 0.9,
}

export const COLORS = {
  deepWater: new THREE.Color('#0a4a63'),
  shallowWater: new THREE.Color('#2f9fb5'),
  fog: new THREE.Color('#12617d'),
  skyTop: new THREE.Color('#bfeef7'),
  sunlight: new THREE.Color('#fff6dd'),
}

export interface SandColor {
  id: string
  label: string
  hex: string
  /** UI swatch gradient */
  swatch: string
  sparkle: number
  rainbow: number
}

export const SAND_COLORS: SandColor[] = [
  {
    id: 'gold',
    label: 'きんいろ',
    hex: '#ffc86a',
    swatch: 'linear-gradient(160deg,#ffe2ab,#e5a648)',
    sparkle: 0.35,
    rainbow: 0,
  },
  {
    id: 'pink',
    label: 'ももいろ',
    hex: '#ff9dbe',
    swatch: 'linear-gradient(160deg,#ffd4e3,#ff86ae)',
    sparkle: 0.5,
    rainbow: 0,
  },
  {
    id: 'aqua',
    label: 'みずいろ',
    hex: '#7fe0ea',
    swatch: 'linear-gradient(160deg,#d3fbff,#5fcfda)',
    sparkle: 0.5,
    rainbow: 0,
  },
  {
    id: 'pearl',
    label: 'しんじゅ',
    hex: '#f3f0ff',
    swatch: 'linear-gradient(160deg,#ffffff,#d9d4f2)',
    sparkle: 0.95,
    rainbow: 0.25,
  },
  {
    id: 'rainbow',
    label: 'にじいろ',
    hex: '#ffffff',
    swatch: 'linear-gradient(140deg,#ffb3c1,#ffe6a0,#a8f0c6,#a9d8ff,#d9b8ff)',
    sparkle: 0.8,
    rainbow: 1,
  },
]

export const SAND = {
  /** base blob radius */
  radius: 0.235,
  /** distance between sampled trace points, as a fraction of radius */
  spacing: 0.46,
  /** how strongly a new blob is pulled onto its neighbours */
  snapPull: 0.55,
  maxSegmentsHigh: 2400,
  maxSegmentsLow: 1400,
}
