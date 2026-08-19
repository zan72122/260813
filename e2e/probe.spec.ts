import { test } from '@playwright/test'
const VIEWS = [
  { name: 'iphone-p', w: 390, h: 844 },
  { name: 'iphone-l', w: 844, h: 390 },
  { name: 'ipad-p', w: 820, h: 1180 },
  { name: 'ipad-l', w: 1180, h: 820 },
]
test('framing coverage', async ({ page }) => {
  for (const v of VIEWS) {
    await page.setViewportSize({ width: v.w, height: v.h })
    await page.goto('/?e2e=1')
    await page.waitForFunction(() => Boolean((window as any).__sand), null, { timeout: 30000 })
    await page.waitForTimeout(700)
    const r = await page.evaluate(() => {
      const g: any = (window as any).__sand.game
      const HX = 15.36 / 2, HZ = 6.4 / 2
      const pts = [
        [-HX, 0, -HZ], [-HX, 0, HZ], [HX, 0, -HZ], [HX, 0, HZ],
      ]
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9
      for (const p of pts) {
        const s = g.worldToScreen(p[0], p[2])
        x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x)
        y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y)
      }
      const st = g.debugState()
      const lift = Math.min(st.viewport.w, st.viewport.h) * 0.085
      return { x0, x1, y0: y0 - lift, y1: y1 - lift, vp: st.viewport,
        tray: g.tray.reserve({top:0,right:0,bottom:0,left:0}),
        rig: { offY: +g.rig.ndcOffY.toFixed(3), el: +g.rig.elevation.toFixed(3), d: +g.rig.baseDistance.toFixed(2) },
        dbg: (() => {
          const THREE_V = g.rig.camera.position.constructor
          const q = new THREE_V(7.68 + 0.08, 0.25, 3.2 + 0.08)
          q.project(g.rig.camera)
          const q2 = new THREE_V(-7.68 - 0.08, 0.25, 3.2 + 0.08)
          q2.project(g.rig.camera)
          return { far: +q.y.toFixed(3), near: +q2.y.toFixed(3), box: g.rig.debugBoxes.boxSand,
            zoom: g.rig.distance / g.rig.baseDistance }
        })() }
    })
    const freeX0 = r.tray.left * v.w, freeX1 = v.w * (1 - r.tray.right)
    const freeY0 = r.tray.top * v.h, freeY1 = v.h * (1 - r.tray.bottom)
    console.log(v.name, JSON.stringify({
      x: [Math.round(r.x0), Math.round(r.x1)],
      y: [Math.round(r.y0), Math.round(r.y1)],
      free: [Math.round(freeX0), Math.round(freeX1), Math.round(freeY0), Math.round(freeY1)],
      fillW: +(((r.x1 - r.x0) / (freeX1 - freeX0)) * 100).toFixed(0),
      fillH: +(((r.y1 - r.y0) / (freeY1 - freeY0)) * 100).toFixed(0),
      rig: r.rig, dbg: r.dbg,
    }))
  }
})
