import { chromium } from 'playwright'
import fs from 'node:fs'

const OUT = process.env.OUT || new URL('../playtest-shots/', import.meta.url).pathname
fs.mkdirSync(OUT, { recursive: true })
const URLBASE = process.env.URLBASE || 'http://127.0.0.1:5173/'

// iPhone 14 Pro-ish portrait, and iPad-ish landscape
const DEVICES = {
  phone: { width: 393, height: 852, dpr: 3 },
  phoneLand: { width: 852, height: 393, dpr: 3 },
  pad: { width: 1024, height: 768, dpr: 2 },
  padPortrait: { width: 768, height: 1024, dpr: 2 },
}

export async function launch(deviceName = 'phone', query = '') {
  const d = DEVICES[deviceName]
  const browser = await chromium.launch({
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
    ],
  })
  const ctx = await browser.newContext({
    viewport: { width: d.width, height: d.height },
    deviceScaleFactor: 1,
    hasTouch: true,
    isMobile: true,
  })
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`)
  })
  page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`))
  await page.goto(URLBASE + query, { waitUntil: 'load' })
  await page.waitForTimeout(1200)
  return { browser, ctx, page, errors, d }
}

export const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` })

export async function drag(page, pts, holdMs = 0, steps = 14) {
  const { width, height } = page.viewportSize()
  const toPx = (p) => ({ x: p.x * width, y: p.y * height })
  const a = toPx(pts[0])
  await page.mouse.move(a.x, a.y)
  await page.mouse.down()
  if (holdMs) await page.waitForTimeout(holdMs)
  for (let i = 1; i < pts.length; i++) {
    const from = toPx(pts[i - 1])
    const to = toPx(pts[i])
    for (let s = 1; s <= steps; s++) {
      await page.mouse.move(
        from.x + ((to.x - from.x) * s) / steps,
        from.y + ((to.y - from.y) * s) / steps
      )
      await page.waitForTimeout(16)
    }
  }
  await page.mouse.up()
}

export const dbg = (page) => page.evaluate(() => window.__game.debug)
