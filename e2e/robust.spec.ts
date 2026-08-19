import { Page, expect, test } from '@playwright/test'


const st = (page: Page) => page.evaluate(() => (window as any).__sand.state())
const px = (page: Page, x: number, z: number) =>
  page.evaluate(([a, b]) => (window as any).__sand.worldToScreen(a, b), [x, z] as [number, number])

function watchErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  page.on('pageerror', (e) => errors.push(String(e)))
  return errors
}

async function boot(page: Page, w: number, h: number) {
  await page.setViewportSize({ width: w, height: h })
  await page.goto('/?e2e=1')
  await page.waitForFunction(() => Boolean((window as any).__sand), null, { timeout: 30_000 })
  await page.waitForTimeout(700)
}

const VIEWS: Array<[string, number, number]> = [
  ['iphone-portrait', 390, 844],
  ['iphone-landscape', 844, 390],
  ['ipad-portrait', 820, 1180],
  ['ipad-landscape', 1180, 820],
]

test('layout: everything important is on screen at every size', async ({ page }) => {
  const errors = watchErrors(page)
  for (const [name, w, h] of VIEWS) {
    await boot(page, w, h)
    const r = await page.evaluate(() => {
      const g: any = (window as any).__sand.game
      const cfg = (window as any).__sandCfg
      const probe = (x: number, z: number) => g.worldToScreen(x, z)
      const lift = Math.min(g.debugState().viewport.w, g.debugState().viewport.h) * 0.085
      const src = probe(cfg.SOURCE_X, 0)
      const castle = probe(cfg.CASTLE_X, 0)
      const slots = ['dig', 'mound', 'pour'].map((t) => g.tray.slotPos(t))
      return {
        src: { x: src.x, y: src.y - lift },
        castle: { x: castle.x, y: castle.y - lift },
        slots,
        vp: g.debugState().viewport,
      }
    })
    // Water source and castle both comfortably inside the viewport.
    for (const [label, p] of [
      ['source', r.src],
      ['castle', r.castle],
    ] as const) {
      expect(p.x, `${name} ${label} x`).toBeGreaterThan(0)
      expect(p.x, `${name} ${label} x`).toBeLessThan(w)
      expect(p.y, `${name} ${label} y`).toBeGreaterThan(0)
      expect(p.y, `${name} ${label} y`).toBeLessThan(h)
    }
    // Tool targets are big and fully on screen.
    for (const s of r.slots) {
      expect(s.r * 2, `${name} tool diameter`).toBeGreaterThanOrEqual(66)
      expect(s.x - s.r, `${name} tool left`).toBeGreaterThan(-2)
      expect(s.x + s.r, `${name} tool right`).toBeLessThan(w + 2)
      expect(s.y + s.r, `${name} tool bottom`).toBeLessThan(h + 2)
    }
  }
  expect(errors, errors.join('\n')).toEqual([])
})

test('page never scrolls and has no overflow', async ({ page }) => {
  await boot(page, 390, 844)
  await page.mouse.move(200, 400)
  await page.mouse.down()
  for (let i = 0; i < 20; i++) await page.mouse.move(200 + i * 6, 400 + i * 18)
  await page.mouse.up()
  const m = await page.evaluate(() => ({
    sx: window.scrollX,
    sy: window.scrollY,
    bodyW: document.body.scrollWidth,
    bodyH: document.body.scrollHeight,
    winW: window.innerWidth,
    winH: window.innerHeight,
  }))
  expect(m.sx).toBe(0)
  expect(m.sy).toBe(0)
  expect(m.bodyW).toBeLessThanOrEqual(m.winW)
  expect(m.bodyH).toBeLessThanOrEqual(m.winH)
})

test('rapid taps, mid-drag release and reversed drags stay stable', async ({ page }) => {
  const errors = watchErrors(page)
  await boot(page, 390, 844)

  // hammer the tool tray
  const slots = await page.evaluate(() =>
    ['dig', 'mound', 'pour'].map((t) => (window as any).__sand.game.tray.slotPos(t)),
  )
  for (let i = 0; i < 30; i++) {
    const s = slots[i % 3]
    await page.mouse.click(s.x, s.y, { delay: 1 })
  }
  expect(['dig', 'mound', 'pour']).toContain((await st(page)).selectedTool)

  // press, drag off the canvas, and release outside
  await page.mouse.move(200, 500)
  await page.mouse.down()
  await page.mouse.move(200, 300)
  await page.mouse.move(-50, -50)
  await page.mouse.up()
  await page.waitForTimeout(200)

  // reversed / zig-zag drag across the whole board
  const a = await px(page, -6.5, -2.8)
  const b = await px(page, 6.5, 2.8)
  await page.mouse.move(b.x, b.y)
  await page.mouse.down()
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    await page.mouse.move(b.x + (a.x - b.x) * t, b.y + (a.y - b.y) * t)
  }
  for (let i = 0; i <= 10; i++) {
    const t = i / 10
    await page.mouse.move(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t)
  }
  await page.mouse.up()

  const s = await st(page)
  expect(Number.isFinite(s.totalDug)).toBe(true)
  expect(errors, errors.join('\n')).toEqual([])
})

test('digging the very edge of the sandbox does not break anything', async ({ page }) => {
  const errors = watchErrors(page)
  await boot(page, 844, 390)
  const corners: Array<[number, number]> = [
    [-7.6, -3.1],
    [7.6, -3.1],
    [7.6, 3.1],
    [-7.6, 3.1],
  ]
  for (const [x, z] of corners) {
    const p = await px(page, x, z)
    await page.mouse.move(p.x, p.y)
    await page.mouse.down()
    for (let i = 0; i < 6; i++) await page.mouse.move(p.x + i * 3, p.y + i * 3)
    await page.mouse.up()
  }
  const bad = await page.evaluate(() => {
    const t: any = (window as any).__sand.game.terrain
    let nan = 0
    let lo = Infinity
    let hi = -Infinity
    for (let i = 0; i < t.height.length; i++) {
      const v = t.height[i]
      if (!Number.isFinite(v)) nan++
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    return { nan, lo, hi }
  })
  expect(bad.nan).toBe(0)
  expect(bad.lo).toBeGreaterThanOrEqual(0)
  expect(bad.hi).toBeLessThan(6)
  expect(errors, errors.join('\n')).toEqual([])
})

test('a flood of water stays finite and drains', async ({ page }) => {
  const errors = watchErrors(page)
  await boot(page, 390, 844)
  const peak = await page.evaluate(async () => {
    const g: any = (window as any).__sand.game
    const w = g.water
    const t = g.terrain
    for (let s = 0; s < 900; s++) {
      w.add(t, -3 + (s % 7) * 1.2, ((s % 5) - 2) * 0.9, 0.5, 0.2)
      w.step(t, 1 / 120)
    }
    let maxDepth = 0
    let nan = 0
    for (let i = 0; i < w.depth.length; i++) {
      const v = w.depth[i]
      if (!Number.isFinite(v)) nan++
      if (v > maxDepth) maxDepth = v
    }
    return { vol: w.totalVolume, maxDepth, nan }
  })
  expect(peak.nan).toBe(0)
  expect(Number.isFinite(peak.vol)).toBe(true)
  expect(peak.maxDepth).toBeLessThan(8)

  await page.waitForTimeout(4000)
  const after = await st(page)
  expect(Number.isFinite(after.waterVolume)).toBe(true)
  expect(errors, errors.join('\n')).toEqual([])
})

test('rotating the device keeps the composition valid', async ({ page }) => {
  const errors = watchErrors(page)
  await boot(page, 390, 844)
  expect((await st(page)).orientation).toBe('portrait')
  for (const [w, h] of [
    [844, 390],
    [390, 844],
    [1180, 820],
    [820, 1180],
  ]) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(900)
    const s = await st(page)
    expect(s.orientation).toBe(h >= w ? 'portrait' : 'landscape')
    expect(s.viewport).toEqual({ w, h })
    const c = await px(page, 4.15, 0)
    expect(c.x).toBeGreaterThan(0)
    expect(c.x).toBeLessThan(w)
  }
  expect(errors, errors.join('\n')).toEqual([])
})

test('backgrounding and returning resumes cleanly', async ({ page }) => {
  const errors = watchErrors(page)
  await boot(page, 390, 844)
  const p = await px(page, -3, 0)
  await page.mouse.move(p.x, p.y)
  await page.mouse.down()
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.waitForTimeout(500)
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await page.mouse.up()
  await page.waitForTimeout(800)
  const s = await st(page)
  expect(Number.isFinite(s.totalDug)).toBe(true)
  expect(s.viewport.w).toBe(390)
  expect(errors, errors.join('\n')).toEqual([])
})
