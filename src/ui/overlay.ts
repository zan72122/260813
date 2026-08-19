import {
  cardFree,
  cardNew,
  cardSame,
  finishedBanner,
  homeIcon,
  loadingArt,
  motionIcon,
  speakerIcon,
} from './icons'

export type MenuChoice = 'same' | 'new' | 'free'

export type OverlayHandlers = {
  onChoice: (c: MenuChoice) => void
  onVolume: (level: number) => void
  onMotion: (calm: boolean) => void
  onHome: () => void
  onAnyTap: () => void
}

/**
 * Thin DOM layer: settings, the picture menu, and the loading veil.
 * The game itself is entirely WebGL — this only holds things that must be
 * reliably tappable and safe-area aware.
 */
export class Overlay {
  private readonly menu: HTMLDivElement
  private readonly volPop: HTMLDivElement
  private readonly soundBtn: HTMLButtonElement
  private readonly motionBtn: HTMLButtonElement
  private readonly homeBtn: HTMLButtonElement
  private readonly loading: HTMLDivElement
  private volume = 2
  private calm = false

  constructor(root: HTMLElement, private readonly handlers: OverlayHandlers) {
    this.loading = el('div', 'loading-wrap')
    this.loading.id = 'loading'
    this.loading.innerHTML = loadingArt()
    root.appendChild(this.loading)

    this.soundBtn = button('btn-sound', speakerIcon(2), 'おと')
    this.motionBtn = button('btn-motion', motionIcon(false), 'うごき')
    this.homeBtn = button('btn-home', homeIcon(), 'えらぶ')
    root.append(this.soundBtn, this.motionBtn, this.homeBtn)

    this.volPop = el('div', '')
    this.volPop.id = 'volpop'
    this.volPop.classList.add('hidden')
    for (let lvl = 0; lvl <= 2; lvl++) {
      const b = document.createElement('button')
      b.className = 'lvl'
      b.innerHTML = speakerIcon(lvl)
      b.setAttribute('aria-label', ['おとなし', 'ちいさいおと', 'おおきいおと'][lvl])
      b.addEventListener('pointerup', (e) => {
        e.stopPropagation()
        this.setVolume(lvl)
        this.handlers.onVolume(lvl)
        this.handlers.onAnyTap()
        this.volPop.classList.add('hidden')
      })
      this.volPop.appendChild(b)
    }
    root.appendChild(this.volPop)

    this.soundBtn.addEventListener('pointerup', (e) => {
      e.stopPropagation()
      this.volPop.classList.toggle('hidden')
      this.handlers.onAnyTap()
    })
    this.motionBtn.addEventListener('pointerup', (e) => {
      e.stopPropagation()
      this.setCalm(!this.calm)
      this.handlers.onMotion(this.calm)
      this.handlers.onAnyTap()
    })
    this.homeBtn.addEventListener('pointerup', (e) => {
      e.stopPropagation()
      this.handlers.onHome()
      this.handlers.onAnyTap()
    })

    this.menu = el('div', '')
    this.menu.id = 'menu'
    this.menu.classList.add('hidden')
    root.appendChild(this.menu)
  }

  hideLoading(): void {
    this.loading.classList.add('gone')
    window.setTimeout(() => this.loading.remove(), 700)
  }

  setVolume(level: number): void {
    this.volume = level
    this.soundBtn.innerHTML = speakerIcon(level)
    const kids = this.volPop.querySelectorAll('.lvl')
    kids.forEach((k, i) => k.classList.toggle('on', i === level))
  }

  setCalm(calm: boolean): void {
    this.calm = calm
    this.motionBtn.innerHTML = motionIcon(calm)
  }

  get volumeLevel(): number {
    return this.volume
  }

  showMenu(celebrate: boolean): void {
    this.menu.innerHTML = ''
    this.menu.classList.remove('hidden')
    if (celebrate) this.menu.insertAdjacentHTML('beforeend', finishedBanner())

    const cards = el('div', 'cards')
    const defs: Array<[MenuChoice, string, string, boolean]> = [
      ['same', cardSame(), 'もういちど', true],
      ['new', cardNew(), 'ちがうすなば', false],
      ['free', cardFree(), 'じゆうに', false],
    ]
    for (const [id, art, label, primary] of defs) {
      const b = document.createElement('button')
      b.className = 'card' + (primary ? ' primary' : '')
      b.setAttribute('aria-label', label)
      b.innerHTML = art + `<span class="lbl">${label}</span>`
      b.addEventListener('pointerup', (e) => {
        e.stopPropagation()
        this.hideMenu()
        this.handlers.onAnyTap()
        this.handlers.onChoice(id)
      })
      cards.appendChild(b)
    }
    this.menu.appendChild(cards)
    this.volPop.classList.add('hidden')
  }

  hideMenu(): void {
    this.menu.classList.add('hidden')
  }

  get menuVisible(): boolean {
    return !this.menu.classList.contains('hidden')
  }

  setControlsVisible(v: boolean): void {
    for (const b of [this.soundBtn, this.motionBtn, this.homeBtn]) {
      b.style.display = v ? '' : 'none'
    }
    if (!v) this.volPop.classList.add('hidden')
  }

  closePopups(): void {
    this.volPop.classList.add('hidden')
  }
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  return e
}

function button(id: string, svg: string, label: string): HTMLButtonElement {
  const b = document.createElement('button')
  b.id = id
  b.className = 'ui-btn'
  b.innerHTML = svg
  b.setAttribute('aria-label', label)
  return b
}
