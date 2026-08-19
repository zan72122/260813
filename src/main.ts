import { Game } from './game/game'
import { fanScreen } from './game/fanmap'
import { titleStage } from './stages/title'
import { introStage } from './stages/intro'
import { splitStage } from './stages/split'
import { fluffStage, fluffFreeStage } from './stages/fluff'
import { bowStage } from './stages/bow'
import { threadStage } from './stages/thread'
import { symStage } from './stages/sym'
import { glueStage } from './stages/glue'
import { paperStage } from './stages/paper'
import { hammerStage } from './stages/hammer'
import { edgeStage } from './stages/edge'
import { finishStage } from './stages/finish'

function setSafeAreaVars() {
  const s = document.documentElement.style
  s.setProperty('--sat', 'env(safe-area-inset-top, 0px)')
  s.setProperty('--sab', 'env(safe-area-inset-bottom, 0px)')
  s.setProperty('--sal', 'env(safe-area-inset-left, 0px)')
  s.setProperty('--sar', 'env(safe-area-inset-right, 0px)')
}

function boot() {
  setSafeAreaVars()
  const canvas = document.getElementById('stage') as HTMLCanvasElement
  const game = new Game(canvas)
  ;[
    titleStage, introStage, splitStage, fluffStage, fluffFreeStage,
    bowStage, threadStage, symStage, glueStage, paperStage,
    hammerStage, edgeStage, finishStage
  ].forEach(s => game.register(s))
  game.goto('title')
  document.getElementById('boot')?.remove()
  ;(window as any).__game = game
  // test hook: screen position of a point on the fan surface
  ;(window as any).__fan = (f: number, u: number) => fanScreen(game, f, u)

  let last = performance.now()
  const loop = (now: number) => {
    const dt = Math.min(0.05, Math.max(0.0005, (now - last) / 1000))
    last = now
    game.frameStep(dt)
    game.render()
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot)
else boot()
