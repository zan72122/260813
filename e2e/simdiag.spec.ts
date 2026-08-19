import { test } from '@playwright/test'

test('water sim diagnostic', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/?e2e=1')
  await page.waitForFunction(() => Boolean((window as any).__sand), null, { timeout: 30_000 })
  const out = await page.evaluate(() => {
    const g: any = (window as any).__sand.game
    const t = g.terrain
    const w = g.water
    w.reset()

    // Dig a straight channel down the centre line, three passes.
    for (let pass = 0; pass < 3; pass++) {
      for (let x = -4.8; x < 2.2; x += 0.22) {
        t.dig(x, 0, x + 0.22, 0, 0.44, 0.022 * 0.9)
      }
    }

    const profile = (arr: Float32Array) => {
      const vals: number[] = []
      for (let x = -6.5; x <= 6.5; x += 0.5) {
        const i = Math.round(t.gi(x))
        const j = Math.round(t.gj(0))
        vals.push(+arr[j * t.w + i].toFixed(3))
      }
      return vals
    }
    const heights = profile(t.height)

    const dt = 1 / 120
    const log: any[] = []
    let poured = 0
    for (let step = 0; step < 120 * 45; step++) {
      const time = step * dt
      if (time < 8 || (time > 12 && time < 20) || (time > 24 && time < 32)) {
        w.add(t, -5.2, 0, 0.34, 0.1 * dt)
        poured += 0.1 * dt
      }
      w.step(t, dt)
      if (step % (120 * 3) === 0) {
        log.push({
          t: +time.toFixed(1),
          vol: +w.totalVolume.toFixed(2),
          front: +w.frontX.toFixed(2),
          moat: +w.moatFill.toFixed(3),
        })
      }
    }
    return { heights, log, poured: +poured.toFixed(2), depths: profile(w.depth), moatCells: t.moatCellCount }
  })
  console.log('height profile x=-6.5..6.5:', JSON.stringify(out.heights))
  console.log('depth  profile:', JSON.stringify(out.depths))
  console.log('moatCells', out.moatCells, 'poured', out.poured)
  for (const l of out.log) console.log(JSON.stringify(l))
})
