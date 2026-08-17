import { sfx } from './audio'
import { DISH_TINTS } from './materials'

export type ReplayChoice = 'again' | 'dish' | 'home'

const CLOCKS = ['🕐', '🕑', '🕒', '🕓', '🕔', '🕕', '🕖', '🕗', '🕘', '🕙', '🕚', '🕛']

class UI {
  private title = document.getElementById('overlay-title')!
  private replay = document.getElementById('overlay-replay')!
  private clock = document.getElementById('clock')!
  private clockTimer = 0

  showTitle(): Promise<void> {
    this.title.classList.remove('hidden')
    return new Promise((resolve) => {
      const btn = document.getElementById('btn-play')!
      const onTap = () => {
        sfx.unlock()
        sfx.pop()
        btn.removeEventListener('click', onTap)
        this.title.classList.add('hidden')
        resolve()
      }
      btn.addEventListener('click', onTap)
    })
  }

  showReplay(nextTint: number): Promise<ReplayChoice> {
    // recolor the "different dish" pictogram to the tint that would be used
    const icon = document.querySelector('#dish-icon rect') as SVGRectElement | null
    if (icon) icon.setAttribute('fill', '#' + DISH_TINTS[nextTint % DISH_TINTS.length].toString(16).padStart(6, '0'))
    this.replay.classList.remove('hidden')
    return new Promise((resolve) => {
      const done = (c: ReplayChoice) => {
        sfx.pop()
        this.replay.classList.add('hidden')
        cleanup()
        resolve(c)
      }
      const a = () => done('again')
      const d = () => done('dish')
      const h = () => done('home')
      const btnA = document.getElementById('btn-again')!
      const btnD = document.getElementById('btn-dish')!
      const btnH = document.getElementById('btn-home')!
      const cleanup = () => {
        btnA.removeEventListener('click', a)
        btnD.removeEventListener('click', d)
        btnH.removeEventListener('click', h)
      }
      btnA.addEventListener('click', a)
      btnD.addEventListener('click', d)
      btnH.addEventListener('click', h)
    })
  }

  replayButtonRect(): { x: number; y: number } | null {
    if (this.replay.classList.contains('hidden')) return null
    const r = document.getElementById('btn-again')!.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }

  titleButtonRect(): { x: number; y: number } | null {
    if (this.title.classList.contains('hidden')) return null
    const r = document.getElementById('btn-play')!.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
  }

  /** Picture-only time-lapse: cycling clock faces. */
  startClock() {
    this.clock.classList.remove('hidden')
    let i = 0
    this.clock.textContent = CLOCKS[0]
    this.clockTimer = window.setInterval(() => {
      i = (i + 1) % CLOCKS.length
      this.clock.textContent = CLOCKS[i]
    }, 110)
  }

  stopClock() {
    window.clearInterval(this.clockTimer)
    this.clock.classList.add('hidden')
  }
}

export const ui = new UI()
