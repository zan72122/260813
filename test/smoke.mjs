// Smoke E2E: play one full round of the game in headless Chromium at the
// four required viewports, using the game's own gesture hints as the input
// script. Run `npm run build` first.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import url from 'node:url'
import { chromium } from 'playwright-core'

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const shotDir = process.env.SHOT_DIR || path.join(root, 'test', 'shots')

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
}

function serve() {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    if (p === '/') p = '/index.html'
    const file = path.join(dist, p)
    if (!file.startsWith(dist) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404)
      res.end('nope')
      return
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server)))
}

function findChrome() {
  const base = '/opt/pw-browsers'
  const stack = [base]
  while (stack.length) {
    const dir = stack.pop()
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const e of entries) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) stack.push(full)
      else if (e.name === 'chrome' || e.name === 'chromium') return full
    }
  }
  throw new Error('chromium not found under /opt/pw-browsers')
}

async function performGesture(page, g) {
  const pts = g.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
  if (!pts.length) return
  if (g.type === 'tap') {
    await page.mouse.click(pts[0].x, pts[0].y)
    return
  }
  await page.mouse.move(pts[0].x, pts[0].y)
  await page.mouse.down()
  await page.waitForTimeout(Math.min(260, g.holdMs ?? 60))
  for (let i = 1; i < pts.length; i++) {
    await page.mouse.move(pts[i].x, pts[i].y, { steps: 14 })
    await page.waitForTimeout(40)
  }
  if (g.holdMs) await page.waitForTimeout(g.holdMs)
  await page.mouse.up()
}

async function runViewport(browser, baseUrl, vp, takeShots) {
  const page = await browser.newPage({ viewport: vp })
  page.on('pageerror', (e) => {
    throw new Error(`page error at ${vp.width}x${vp.height}: ${e.message}`)
  })
  await page.goto(`${baseUrl}/?fast=1`)
  await page.waitForFunction(() => window.__tiramisu, null, { timeout: 15000 })

  const seen = new Set()
  const t0 = Date.now()
  // generous: software rendering at tablet resolutions is CPU-bound
  const deadline = t0 + 420000
  let lastPhase = ''

  while (Date.now() < deadline) {
    const state = await page.evaluate(() => ({
      phase: window.__tiramisu.phase(),
      step: window.__tiramisu.step(),
      gesture: window.__tiramisu.gesture(),
    }))
    if (state.phase !== lastPhase) {
      lastPhase = state.phase
      console.log(`  [${vp.width}x${vp.height}] phase=${state.phase} t=${((Date.now() - t0) / 1000).toFixed(1)}s`)
      if (takeShots && !seen.has(state.phase)) {
        seen.add(state.phase)
        await page.waitForTimeout(450)
        fs.mkdirSync(shotDir, { recursive: true })
        await page.screenshot({ path: path.join(shotDir, `${vp.width}x${vp.height}-${state.phase}.png`) })
      }
    }
    if (state.phase === 'replay') break
    if (state.phase === 'title') {
      await page.click('#btn-play', { force: true })
      await page.waitForTimeout(300)
      continue
    }
    if (!state.gesture) {
      await page.waitForTimeout(250)
      continue
    }
    await performGesture(page, state.gesture)
    await page.waitForTimeout(180)
  }

  if (lastPhase !== 'replay') {
    throw new Error(`did not reach replay at ${vp.width}x${vp.height} (stuck at ${lastPhase})`)
  }
  if (takeShots) {
    await page.screenshot({ path: path.join(shotDir, `${vp.width}x${vp.height}-replay.png`) })
  }

  // replay loop: one tap must start the same game again
  await page.click('#btn-again', { force: true })
  await page.waitForFunction(() => window.__tiramisu.phase() === 'dip', null, { timeout: 15000 })
  console.log(`  [${vp.width}x${vp.height}] replay OK, total ${((Date.now() - t0) / 1000).toFixed(1)}s`)
  await page.close()
}

const server = await serve()
const port = server.address().port
const baseUrl = `http://127.0.0.1:${port}`
const browser = await chromium.launch({
  executablePath: findChrome(),
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
})

const viewports = [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 820, height: 1180 },
  { width: 1180, height: 820 },
]

const only = process.env.VIEWPORT // e.g. "390x844"
try {
  for (const [i, vp] of viewports.entries()) {
    if (only && `${vp.width}x${vp.height}` !== only) continue
    console.log(`viewport ${vp.width}x${vp.height}`)
    await runViewport(browser, baseUrl, vp, i < 2 || !!only)
  }
  console.log('SMOKE OK')
} finally {
  await browser.close()
  server.close()
}
