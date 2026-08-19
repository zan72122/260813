export type Settings = {
  /** 0 = mute, 1 = quiet, 2 = normal */
  volume: number
  /** Reduce camera motion, particles and flourishes. */
  calmMotion: boolean
}

const KEY = 'sandcastle.settings.v1'

const DEFAULTS: Settings = { volume: 2, calmMotion: false }

function prefersReduced(): boolean {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

export function loadSettings(): Settings {
  const base: Settings = { ...DEFAULTS, calmMotion: prefersReduced() }
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return base
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      volume:
        typeof parsed.volume === 'number' ? Math.max(0, Math.min(2, Math.round(parsed.volume))) : base.volume,
      calmMotion: typeof parsed.calmMotion === 'boolean' ? parsed.calmMotion : base.calmMotion,
    }
  } catch {
    return base
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    /* private mode — running with defaults is fine */
  }
}
