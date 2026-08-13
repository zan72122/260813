import './style.css'
import { Game } from './game'

const params = new URLSearchParams(location.search)
const fast = params.get('fast') === '1' || import.meta.env.VITE_E2E_FAST === '1'
const test = params.get('test') === '1'
const seed = Number(params.get('seed') ?? '12345') || 12345

const game = new Game({ fast, test, seed })

// iOS の 2本指ズーム / ダブルタップズームを止める
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener(
  'dblclick',
  (e) => {
    e.preventDefault()
  },
  { passive: false },
)

declare global {
  interface Window {
    __nijinowa: {
      game: Game
      state: () => Record<string, number | string | boolean>
      step: (seconds: number) => void
      press: (on: boolean, x?: number, y?: number) => void
      begin: () => void
      light: () => void
      mode: (m: 'free' | 'challenge') => void
      size: (dir: number) => void
      restart: () => void
    }
  }
}

window.__nijinowa = {
  game,
  state: () => game.snapshot(),
  step: (s) => game.step(s),
  press: (on, x, y) => game.setPressing(on, x, y),
  begin: () => game.begin(),
  light: () => game.toggleLight(),
  mode: (m) => game.setMode(m),
  size: (d) => game.nudgeSize(d),
  restart: () => game.restart(),
}
