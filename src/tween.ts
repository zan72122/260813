export type Ease = (t: number) => number

export const easeLinear: Ease = (t) => t
export const easeInOut: Ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
export const easeOutCubic: Ease = (t) => 1 - Math.pow(1 - t, 3)
export const easeInCubic: Ease = (t) => t * t * t
export const easeOutBack: Ease = (t) => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2)
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t

interface Item {
  t: number
  dur: number
  delay: number
  ease: Ease
  update: (v: number) => void
  resolve: () => void
  done: boolean
}

export class Tweens {
  timescale = 1
  private list: Item[] = []

  to(opts: { dur: number; delay?: number; ease?: Ease; update: (v: number) => void }): Promise<void> {
    return new Promise((resolve) => {
      this.list.push({
        t: 0,
        dur: Math.max(0.0001, opts.dur),
        delay: opts.delay ?? 0,
        ease: opts.ease ?? easeInOut,
        update: opts.update,
        resolve,
        done: false,
      })
    })
  }

  wait(sec: number): Promise<void> {
    return this.to({ dur: sec, ease: easeLinear, update: () => {} })
  }

  update(dt: number) {
    const step = dt * this.timescale
    for (const it of this.list) {
      if (it.done) continue
      if (it.delay > 0) {
        it.delay -= step
        if (it.delay > 0) continue
      }
      it.t += step / it.dur
      const v = it.ease(clamp(it.t, 0, 1))
      try {
        it.update(v)
      } catch (e) {
        console.error(e)
      }
      if (it.t >= 1) {
        it.done = true
        it.resolve()
      }
    }
    this.list = this.list.filter((i) => !i.done)
  }

  clear() {
    for (const it of this.list) {
      it.done = true
      it.resolve()
    }
    this.list = []
  }
}

export const tweens = new Tweens()
