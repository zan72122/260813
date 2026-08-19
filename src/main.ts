import './ui/style.css'
import { Game } from './game'

const canvas = document.getElementById('gl') as HTMLCanvasElement
const ui = document.getElementById('ui') as HTMLElement

function fail(msg: string) {
  ui.innerHTML = `<div class="panel"><div class="card"><h2>ごめんね</h2>
    <p class="note">${msg}</p></div></div>`
}

try {
  const test = document.createElement('canvas')
  const ok = !!(test.getContext('webgl2') || test.getContext('webgl'))
  if (!ok) throw new Error('no webgl')
  const game = new Game(canvas, ui)
  game.start()
  ;(window as unknown as { __game: Game }).__game = game
} catch (e) {
  console.error(e)
  fail('このブラウザでは 3D が つかえないみたい。Safari や Chrome の さいしんばん で ためしてね。')
}
