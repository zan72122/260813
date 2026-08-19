import { Page, expect, test } from '@playwright/test'

/**
 * The promises the whole game rests on, checked directly against the
 * simulation: water runs downhill into a groove, a bank stops it, and adding
 * sand changes where an already-running river goes.
 */
async function boot(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?e2e=1')
  await page.waitForFunction(() => Boolean((window as any).__sand), null, { timeout: 30_000 })
  await page.waitForTimeout(500)
}

test('water prefers a dug groove over flat sand', async ({ page }) => {
  await boot(page)
  const r = await page.evaluate(() => {
    const g: any = (window as any).__sand.game
    const t = g.terrain
    const w = g.water
    ;(window as any).__sand.setPattern('sandbox')
    w.reset()
    // one groove offset to +Z, nothing at -Z
    for (let x = -4.5; x < 1.5; x += 0.2) t.dig(x, 1.2, x + 0.2, 1.2, 0.44, 0.02)
    for (let s = 0; s < 120 * 10; s++) {
      if (s < 120 * 5) w.add(t, -4.6, 0.6, 0.34, 0.1 / 120)
      w.step(t, 1 / 120)
    }
    // Mean depth in equally sized bands at the same distance downstream.
    const band = (zc: number) => {
      let sum = 0
      let n = 0
      for (let j = 0; j < t.h; j++) {
        const z = t.wz(j)
        if (Math.abs(z - zc) > 0.45) continue
        for (let i = 0; i < t.w; i++) {
          const x = t.wx(i)
          if (x < -2 || x > 1.4) continue
          sum += w.depth[j * t.w + i]
          n++
        }
      }
      return n ? sum / n : 0
    }
    return { inGroove: band(1.2), offGroove: band(-1.2) }
  })
  console.log('groove vs flat', JSON.stringify(r))
  expect(r.inGroove).toBeGreaterThan(r.offGroove * 3)
})

test('a mound of sand blocks water and sends it the other way', async ({ page }) => {
  await boot(page)
  const r = await page.evaluate(() => {
    const g: any = (window as any).__sand.game
    const t = g.terrain
    const w = g.water
    ;(window as any).__sand.setPattern('sandbox')

    // Two parallel grooves from a shared start.
    const carve = () => {
      for (let x = -3.5; x < 2.0; x += 0.2) {
        t.dig(x, -1.1, x + 0.2, -1.1, 0.42, 0.02)
        t.dig(x, 1.1, x + 0.2, 1.1, 0.42, 0.02)
      }
      for (let z = -1.1; z < 1.1; z += 0.2) t.dig(-3.5, z, -3.5, z + 0.2, 0.42, 0.02)
    }
    carve()

    const run = () => {
      w.reset()
      // A previous run leaves the sand soaked, which would flatter the second
      // measurement; start both from equally dry sand.
      t.wetness.fill(0)
      for (let s = 0; s < 120 * 12; s++) {
        if (s < 120 * 6) w.add(t, -3.6, 0, 0.34, 0.1 / 120)
        w.step(t, 1 / 120)
      }
      let north = 0
      let south = 0
      for (let j = 0; j < t.h; j++) {
        for (let i = 0; i < t.w; i++) {
          const k = j * t.w + i
          const d = w.depth[k]
          if (d <= 0) continue
          const x = t.wx(i)
          if (x < 0.5) continue // only measure downstream of the dam site
          if (t.wz(j) > 0.4) north += d
          else if (t.wz(j) < -0.4) south += d
        }
      }
      return { north, south }
    }

    const before = run()
    // Dam the +Z groove.
    for (let i = 0; i < 14; i++) t.mound(0.2, 1.1, 0.6, 0.045)
    const after = run()
    return { before, after }
  })
  console.log('flow split', JSON.stringify(r))
  // Before the dam both routes carry water; after it, the dammed one loses out.
  expect(r.before.north).toBeGreaterThan(0)
  expect(r.after.north).toBeLessThan(r.before.north * 0.55)
  expect(r.after.south).toBeGreaterThan(r.before.south * 0.9)
})

test('water pools in a hole and stops at a bank', async ({ page }) => {
  await boot(page)
  const r = await page.evaluate(() => {
    const g: any = (window as any).__sand.game
    const t = g.terrain
    const w = g.water
    ;(window as any).__sand.setPattern('sandbox')
    w.reset()
    // Dig a pit, then wall it off downstream.
    for (let i = 0; i < 26; i++) t.dig(-1, 0, -1, 0, 0.6, 0.03)
    t.wetness.fill(0)
    for (let i = 0; i < 16; i++) t.mound(0.35, 0, 0.55, 0.05)
    for (let s = 0; s < 120 * 14; s++) {
      if (s < 120 * 2) w.add(t, -1, 0, 0.3, 0.09 / 120)
      w.step(t, 1 / 120)
    }
    let pit = 0
    let past = 0
    for (let j = 0; j < t.h; j++) {
      for (let i = 0; i < t.w; i++) {
        const k = j * t.w + i
        const d = w.depth[k]
        if (d <= 0) continue
        const x = t.wx(i)
        if (x < -0.4) pit += d
        else if (x > 0.8) past += d
      }
    }
    return { pit, past }
  })
  console.log('pit vs past bank', JSON.stringify(r))
  expect(r.pit).toBeGreaterThan(0.2)
  expect(r.past).toBeLessThan(r.pit * 0.3)
})

test('every terrain pattern can be solved by digging one channel', async ({ page }) => {
  await boot(page)
  for (const pattern of ['gentle', 'sidepath', 'ridge', 'sandbox']) {
    const r = await page.evaluate((p) => {
      const g: any = (window as any).__sand.game
      const cfg = (window as any).__sandCfg
      ;(window as any).__sand.setPattern(p)
      const t = g.terrain
      const w = g.water
      w.reset()

      // A plausible child's channel: three passes straight down the middle.
      for (let pass = 0; pass < 3; pass++) {
        for (let x = -4.7; x < cfg.CASTLE_X - 1.9; x += 0.25) {
          t.dig(x, 0, x + 0.25, 0, 0.5, 0.085 * 0.85)
        }
      }
      let ridgeCrest = -Infinity
      for (let x = -5; x < 3; x += 0.1) ridgeCrest = Math.max(ridgeCrest, t.heightAt(x, 0))

      for (let s = 0; s < 120 * 70; s++) {
        const time = s / 120
        const pouring = time < 8 || (time > 12 && time < 20) || (time > 26 && time < 34)
        if (pouring) w.add(t, -5.2, 0, 0.34, 0.46 / 120)
        w.step(t, 1 / 120)
      }
      return { pattern: p, moat: +w.moatFill.toFixed(3), crest: +ridgeCrest.toFixed(3) }
    }, pattern)
    console.log('solve', JSON.stringify(r))
    expect(r.moat, `${pattern} should fill the moat`).toBeGreaterThan(0.9)
  }
})
