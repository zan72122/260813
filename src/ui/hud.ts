import { SAND_COLORS } from '../core/config'
import { settings, saveSettings } from '../core/settings'
import { ICON } from './icons'

type Handler = () => void

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  html?: string
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (html !== undefined) e.innerHTML = html
  return e
}

export class Hud {
  onStart: Handler = () => {}
  onNext: Handler = () => {}
  onPickColor: (i: number) => void = () => {}
  onPickTool: (t: 'sand' | 'vacuum') => void = () => {}
  onUndo: Handler = () => {}
  onReplaySame: Handler = () => {}
  onReplayNew: Handler = () => {}
  onFreeMode: Handler = () => {}
  onClearAll: Handler = () => {}
  onNewCastle: Handler = () => {}
  onSettingsChanged: Handler = () => {}
  onPanelToggle: (open: boolean) => void = () => {}

  private root: HTMLElement
  private titleEl: HTMLElement
  private pipsEl: HTMLElement
  private potsEl: HTMLElement
  private handEl: HTMLElement
  private toastEl: HTMLElement
  private nextEl: HTMLButtonElement
  private undoEl: HTMLButtonElement
  private settingsPanel: HTMLElement | null = null
  private finishPanel: HTMLElement | null = null
  private flashEl: HTMLElement
  private potButtons: HTMLButtonElement[] = []
  private vacuumBtn: HTMLButtonElement | null = null

  constructor(root: HTMLElement) {
    this.root = root

    // ---- title -------------------------------------------------------
    this.titleEl = el('div', 'panel bottom', '')
    const card = el('div', 'card')
    card.appendChild(el('div', 'title-logo', '水中砂城'))
    card.appendChild(el('p', 'title-sub', 'みずの なかで すなの おしろ'))
    const play = el('button', 'playbtn', ICON.play)
    play.setAttribute('aria-label', 'あそぶ')
    play.addEventListener('click', () => {
      this.onStart()
    })
    card.appendChild(play)
    const row = el('div')
    row.style.cssText = 'display:flex;justify-content:center;gap:12px;margin-top:14px'
    const gear = el('button', 'rbtn small', ICON.gear)
    gear.setAttribute('aria-label', 'せってい')
    gear.addEventListener('click', () => this.openSettings())
    row.appendChild(gear)
    card.appendChild(row)
    this.titleEl.appendChild(card)
    root.appendChild(this.titleEl)

    // ---- hud ---------------------------------------------------------
    this.pipsEl = el('div', 'pips')
    root.appendChild(this.pipsEl)

    const top = el('div', 'topbar')
    this.undoEl = el('button', 'rbtn small', ICON.undo)
    this.undoEl.setAttribute('aria-label', 'もどす')
    this.undoEl.addEventListener('click', () => this.onUndo())
    this.undoEl.classList.add('hidden')
    const gear2 = el('button', 'rbtn small', ICON.gear)
    gear2.setAttribute('aria-label', 'せってい')
    gear2.addEventListener('click', () => this.openSettings())
    top.appendChild(this.undoEl)
    top.appendChild(gear2)
    root.appendChild(top)

    this.potsEl = el('div', 'pots')
    root.appendChild(this.potsEl)

    this.nextEl = el('button', 'nextbtn hidden', ICON.check)
    this.nextEl.setAttribute('aria-label', 'つぎへ')
    this.nextEl.addEventListener('click', () => this.onNext())
    root.appendChild(this.nextEl)

    this.handEl = el(
      'div',
      'hand',
      `<div class="ring"></div><div class="ring"></div><div class="dot"></div>
       <div class="arrow"><svg viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="3.4"
         stroke-linecap="round" stroke-linejoin="round"><path d="M12 20V5"/><path d="M5.5 11.5L12 5l6.5 6.5"/></svg></div>`
    )
    root.appendChild(this.handEl)

    this.toastEl = el('div', 'toast')
    root.appendChild(this.toastEl)

    this.flashEl = el('div', 'flash')
    root.appendChild(this.flashEl)
  }

  // ------------------------------------------------------------- title
  showTitle() {
    this.titleEl.classList.remove('hidden')
    this.onPanelToggle(true)
  }
  hideTitle() {
    this.titleEl.classList.add('hidden')
    this.onPanelToggle(this.anyPanelOpen())
  }

  private anyPanelOpen(): boolean {
    return (
      !this.titleEl.classList.contains('hidden') ||
      this.settingsPanel !== null ||
      this.finishPanel !== null
    )
  }

  // -------------------------------------------------------------- pips
  setPips(total: number, done: number) {
    if (this.pipsEl.children.length !== total) {
      this.pipsEl.innerHTML = ''
      for (let i = 0; i < total; i++) this.pipsEl.appendChild(el('div', 'pip'))
    }
    for (let i = 0; i < total; i++) {
      this.pipsEl.children[i].classList.toggle('on', i < done)
    }
    this.pipsEl.style.display = total > 0 ? 'flex' : 'none'
  }

  // -------------------------------------------------------------- pots
  setPots(available: number[], withVacuum: boolean) {
    const want = available.join(',') + '|' + (withVacuum ? 'v' : '')
    if (this.potsEl.dataset.sig !== want) {
      this.potsEl.dataset.sig = want
      this.potsEl.innerHTML = ''
      this.potButtons = []
      this.vacuumBtn = null
      for (const idx of available) {
        const c = SAND_COLORS[idx]
        const b = el('button', 'pot')
        b.style.background = c.swatch
        b.setAttribute('aria-label', c.label)
        b.addEventListener('click', () => this.onPickColor(idx))
        b.dataset.idx = String(idx)
        this.potsEl.appendChild(b)
        this.potButtons.push(b)
      }
      if (withVacuum) {
        const v = el('button', 'pot tool', ICON.vacuum)
        v.setAttribute('aria-label', 'すいとる')
        v.addEventListener('click', () => this.onPickTool('vacuum'))
        this.potsEl.appendChild(v)
        this.vacuumBtn = v
      }
    }
    this.potsEl.style.display = available.length ? 'flex' : 'none'
  }

  setToolSelection(tool: 'sand' | 'vacuum', colorIdx: number) {
    for (const b of this.potButtons) {
      b.classList.toggle('sel', tool === 'sand' && Number(b.dataset.idx) === colorIdx)
    }
    if (this.vacuumBtn) this.vacuumBtn.classList.toggle('sel', tool === 'vacuum')
  }

  showUndo(v: boolean) {
    this.undoEl.classList.toggle('hidden', !v)
  }

  // -------------------------------------------------------------- hand
  showHand(x: number, y: number, dx = 0, dy = 0) {
    this.handEl.style.left = `${x}px`
    this.handEl.style.top = `${y}px`
    this.handEl.style.setProperty('--ax', `${dx}px`)
    this.handEl.style.setProperty('--ay', `${dy}px`)
    const deg = (Math.atan2(dx, -dy) * 180) / Math.PI
    this.handEl.style.setProperty('--arot', `${deg.toFixed(1)}deg`)
    this.handEl.classList.add('show')
  }
  hideHand() {
    this.handEl.classList.remove('show')
  }

  // ------------------------------------------------------------- toast
  toast(text: string) {
    this.toastEl.textContent = text
    this.toastEl.classList.remove('go')
    void this.toastEl.offsetWidth
    this.toastEl.classList.add('go')
  }

  flash() {
    this.flashEl.classList.remove('go')
    void this.flashEl.offsetWidth
    this.flashEl.classList.add('go')
  }

  showNext(v: boolean) {
    this.nextEl.classList.toggle('hidden', !v)
  }

  // ---------------------------------------------------------- settings
  openSettings() {
    if (this.settingsPanel) return
    const p = el('div', 'panel')
    const card = el('div', 'card')
    card.appendChild(el('h2', undefined, 'せってい'))

    const mk = (icon: string, label: string, min: number, max: number, step: number, val: number,
      onInput: (v: number) => void) => {
      const r = el('div', 'row')
      const ic = el('div')
      ic.style.cssText = 'width:30px;height:30px;flex:none'
      ic.innerHTML = icon
      const lab = el('div', 'lab', label)
      const input = el('input')
      input.type = 'range'
      input.min = String(min)
      input.max = String(max)
      input.step = String(step)
      input.value = String(val)
      const out = el('div', 'val', '')
      const render = () => {
        out.textContent = String(Math.round(((Number(input.value) - min) / (max - min)) * 100)) + '%'
      }
      render()
      input.addEventListener('input', () => {
        onInput(Number(input.value))
        render()
        saveSettings()
        this.onSettingsChanged()
      })
      r.appendChild(ic)
      r.appendChild(lab)
      r.appendChild(input)
      r.appendChild(out)
      return r
    }

    card.appendChild(mk(ICON.sound, 'おと', 0, 1, 0.05, settings.volume, (v) => (settings.volume = v)))
    card.appendChild(mk(ICON.sun, 'あかるさ', 0.6, 1.4, 0.05, settings.brightness, (v) => (settings.brightness = v)))
    card.appendChild(mk(ICON.wave, 'うごき', 0, 1, 0.05, settings.motion, (v) => (settings.motion = v)))

    const note = el(
      'p',
      'note',
      'おと: すな・あわ・かんせいの おと。<br>あかるさ: がめんの まぶしさ。<br>うごき: カメラや なみの ゆれ（よわくすると おだやかになります）。'
    )
    card.appendChild(note)

    const close = el('button', 'bigbtn', `${ICON.check}<span>とじる</span>`)
    close.addEventListener('click', () => this.closeSettings())
    card.appendChild(close)

    p.appendChild(card)
    p.addEventListener('pointerdown', (e) => {
      if (e.target === p) this.closeSettings()
    })
    this.root.appendChild(p)
    this.settingsPanel = p
    this.onPanelToggle(true)
  }

  closeSettings() {
    if (!this.settingsPanel) return
    this.settingsPanel.remove()
    this.settingsPanel = null
    this.onPanelToggle(this.anyPanelOpen())
  }

  // ------------------------------------------------------------ finish
  showFinish() {
    if (this.finishPanel) return
    const p = el('div', 'panel bottom see-through')
    const card = el('div', 'card')
    card.appendChild(el('h2', undefined, 'できた！'))

    const b1 = el('button', 'bigbtn gold', `${ICON.brush}<span>じゆうに つくる</span>`)
    b1.addEventListener('click', () => {
      this.closeFinish()
      this.onFreeMode()
    })
    const b2 = el('button', 'bigbtn', `${ICON.again}<span>おなじ おしろを もういちど</span>`)
    b2.addEventListener('click', () => {
      this.closeFinish()
      this.onReplaySame()
    })
    const b3 = el('button', 'bigbtn pink', `${ICON.castle}<span>べつの おしろを つくる</span>`)
    b3.addEventListener('click', () => {
      this.closeFinish()
      this.onReplayNew()
    })
    card.appendChild(b1)
    card.appendChild(b2)
    card.appendChild(b3)
    p.appendChild(card)
    this.root.appendChild(p)
    this.finishPanel = p
    this.onPanelToggle(true)
  }

  closeFinish() {
    if (!this.finishPanel) return
    this.finishPanel.remove()
    this.finishPanel = null
    this.onPanelToggle(this.anyPanelOpen())
  }

  /** Free-mode extras: a "clear everything" button lives in the settings card. */
  addClearButton() {
    // shown as a small round button next to undo
    if (document.getElementById('clearbtn')) return
    const top = this.root.querySelector('.topbar')
    if (!top) return
    const b = el('button', 'rbtn small', ICON.trash)
    b.id = 'clearbtn'
    b.setAttribute('aria-label', 'ぜんぶ けす')
    b.addEventListener('click', () => this.onClearAll())
    top.insertBefore(b, top.firstChild)
  }

  removeClearButton() {
    document.getElementById('clearbtn')?.remove()
    document.getElementById('newcastlebtn')?.remove()
  }

  /** Free mode also offers a jump straight back into a guided build. */
  addNewCastleButton() {
    if (document.getElementById('newcastlebtn')) return
    const top = this.root.querySelector('.topbar')
    if (!top) return
    const b = el('button', 'rbtn small', ICON.castle)
    b.id = 'newcastlebtn'
    b.setAttribute('aria-label', 'べつの おしろ')
    b.addEventListener('click', () => this.onNewCastle())
    top.insertBefore(b, top.firstChild)
  }
}
