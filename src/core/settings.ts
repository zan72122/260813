export interface Settings {
  volume: number // 0..1
  brightness: number // 0.6..1.4
  motion: number // 0..1  (1 = full motion, 0 = calm)
}

const KEY = 'suijou-sand-castle.settings.v1'

const DEFAULTS: Settings = { volume: 0.8, brightness: 1, motion: 1 }

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v
}

export const settings: Settings = load()

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return { ...DEFAULTS }
    const p = JSON.parse(raw) as Partial<Settings>
    return {
      volume: clamp(Number(p.volume ?? DEFAULTS.volume), 0, 1),
      brightness: clamp(Number(p.brightness ?? DEFAULTS.brightness), 0.6, 1.4),
      motion: clamp(Number(p.motion ?? DEFAULTS.motion), 0, 1),
    }
  } catch {
    return { ...DEFAULTS }
  }
}

export function saveSettings() {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    /* private mode — ignore */
  }
}
