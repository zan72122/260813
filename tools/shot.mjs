import { chromium, devices } from 'playwright'
import fs from 'node:fs'

const EXEC = '/opt/pw-browsers/chromium'
const URL = process.env.URL || 'http://localhost:5173/'
const OUT = process.env.OUT || '/tmp/claude-0/-home-user-260813/018689c7-9516-504e-a023-c9f0f8a919c0/scratchpad/shots'
fs.mkdirSync(OUT, { recursive: true })

export const VIEWPORTS = {
  'iphone-p': { width: 390, height: 844 },
  'iphone-l': { width: 844, height: 390 },
  'ipad-p': { width: 820, height: 1180 },
  'ipad-l': { width: 1180, height: 820 }
}

export async function launch() {
  return chromium.launch({
    executablePath: EXEC,
    headless: false,
    args: ['--headless=new', '--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--hide-scrollbars', '--mute-audio']
  })
}

export async function newPage(browser, vp, opts = {}) {
  const ctx = await browser.newContext({
    viewport: VIEWPORTS[vp] || vp,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    userAgent: devices['iPhone 13'].userAgent,
    ...opts
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message))
  page.errors = errors
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  return page
}

export const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` })

export async function swipe(page, from, to, steps = 22, delay = 12) {
  await page.mouse.move(from[0], from[1])
  await page.mouse.down()
  for (let i = 1; i <= steps; i++) {
    const t = i / steps
    await page.mouse.move(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t)
    await page.waitForTimeout(delay)
  }
  await page.mouse.up()
}

export async function tap(page, x, y) {
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.waitForTimeout(60)
  await page.mouse.up()
  await page.waitForTimeout(120)
}

export const state = page => page.evaluate(() => {
  const g = window.__game
  return {
    stage: g.curId, notch: +g.u.notch.toFixed(3), progress: +g.u.progress.toFixed(2),
    open: g.u.openCount(), bow: +g.u.bow.toFixed(2), thread: +g.u.thread.toFixed(2),
    sym: +g.u.sym.toFixed(2), paper: +g.u.paperOn.toFixed(2), trim: +g.u.trim.toFixed(2),
    edge: +g.u.edge.toFixed(2), roller: +g.u.roller.toFixed(2),
    glue: +(g.u.glue.reduce((a,b)=>a+b,0)/g.u.glue.length).toFixed(2),
    wrinkle: +(g.u.wrinkle.reduce((a,b)=>a+b,0)/g.u.wrinkle.length).toFixed(2)
  }
})
