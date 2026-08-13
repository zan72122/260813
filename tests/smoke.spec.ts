import { expect, test, type Page } from '@playwright/test'

type State = {
  phase: string
  mode: string
  light: number
  lightOn: boolean
  press: number
  pressing: boolean
  k: number
  contact: number
  ringR: number
  lensR: number
  sizeStep: number
  stars: number
  target: number
  fxCount: number
  glFailed: boolean
  pxCss: number
}

const URL = '/?test=1&fast=1&seed=7'

const state = (page: Page) => page.evaluate(() => window.__nijinowa.state() as unknown as State)
const step = (page: Page, s: number) => page.evaluate((n) => window.__nijinowa.step(n), s)

async function open(page: Page, url = URL) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto(url)
  await page.waitForFunction(() => !!window.__nijinowa)
  return errors
}

/** SwiftShader は遅いので、決め打ちの待ち時間ではなく 状態が変わるまで待つ */
function until(page: Page, fn: string, timeout = 20_000) {
  return page.waitForFunction(
    (src) => {
      const s = window.__nijinowa.state() as Record<string, number | string | boolean>
      return new Function('s', `return ${src}`)(s) as boolean
    },
    fn,
    { timeout, polling: 100 },
  )
}

/** タイトル → レンズを置く → ライト ON まで進める */
async function reachPlay(page: Page) {
  await page.locator('#start').click()
  await step(page, 0.1)
  expect((await state(page)).phase).toBe('place')

  const box = await page.locator('#scene').boundingBox()
  if (!box) throw new Error('no scene')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await step(page, 0.2)
  await page.mouse.up()
  await step(page, 1.2)
  expect((await state(page)).phase).toBe('light')

  await page.locator('#lamp').click()
  await step(page, 1.2)
  const s = await state(page)
  expect(s.phase).toBe('play')
  expect(s.lightOn).toBe(true)
  expect(s.light).toBeGreaterThan(0.9)
}

test('WebGL が動き、ページのエラーが出ない', async ({ page }) => {
  const errors = await open(page)
  const s = await state(page)
  expect(s.glFailed).toBe(false)
  expect(s.phase).toBe('title')
  await step(page, 0.5)
  expect(errors).toEqual([])
})

test('レンズを置く → ライト → 押す → リングが広がる → 離すと戻る', async ({ page }) => {
  const errors = await open(page)
  await reachPlay(page)

  const rest = await state(page)
  expect(rest.press).toBeCloseTo(0, 3)

  // 押した「瞬間」に、もう目に見えて変わっていること
  await page.evaluate(() => window.__nijinowa.press(true))
  await step(page, 0.1)
  const tap = await state(page)
  expect(tap.pressing).toBe(true)
  expect(tap.ringR).toBeGreaterThan(rest.ringR * 1.15)
  expect(tap.k).toBeLessThan(rest.k)
  expect(tap.contact).toBeGreaterThan(0)
  expect(tap.fxCount).toBeGreaterThan(0)

  // 押し続けると さらに広がる
  await step(page, 0.7)
  const held = await state(page)
  expect(held.ringR).toBeGreaterThan(tap.ringR)
  expect(held.press).toBeGreaterThan(0.85)

  // 離すと もどる
  await page.evaluate(() => window.__nijinowa.press(false))
  await step(page, 1.2)
  const back = await state(page)
  expect(back.pressing).toBe(false)
  expect(back.press).toBeCloseTo(0, 2)
  expect(back.ringR).toBeCloseTo(rest.ringR, 2)

  expect(errors).toEqual([])
})

test('ばねなので、押した瞬間にいちど行き過ぎてから落ち着く', async ({ page }) => {
  await open(page)
  await reachPlay(page)
  await page.evaluate(() => window.__nijinowa.press(true))

  let peak = 0
  for (let i = 0; i < 12; i++) {
    await step(page, 1 / 30)
    peak = Math.max(peak, (await state(page)).press)
  }
  await step(page, 0.6)
  const settled = (await state(page)).press
  // 最初の 0.4 秒で、落ち着き先の 3 割増しくらいまで跳ねる
  expect(peak).toBeGreaterThan(0.35)
  expect(peak).toBeLessThanOrEqual(1.25)
  expect(settled).toBeGreaterThan(0.85)
})

test('じゆうモード: レンズの大きさを変えられる', async ({ page }) => {
  const errors = await open(page)
  await reachPlay(page)
  const before = await state(page)
  expect(before.mode).toBe('free')
  await expect(page.locator('#sizeBar')).toHaveClass(/is-on/)

  await page.locator('.sizebtn[data-size="1"]').click()
  await page.locator('.sizebtn[data-size="1"]').click()
  await step(page, 0.2)
  const big = await state(page)
  expect(big.sizeStep).toBe(4)
  expect(big.lensR).toBeGreaterThan(before.lensR)
  expect(big.k).toBeGreaterThan(before.k) // 大きいレンズは しまが 多い

  for (let i = 0; i < 6; i++) await page.locator('.sizebtn[data-size="-1"]').click()
  await step(page, 0.2)
  const small = await state(page)
  expect(small.sizeStep).toBe(0) // 端で止まる。エラーにならない
  expect(small.lensR).toBeLessThan(before.lensR)
  expect(errors).toEqual([])
})

test('チャレンジモード: 押すだけで お星さまが 3 つ たまる', async ({ page }) => {
  const errors = await open(page)
  await reachPlay(page)

  await page.locator('.chip[data-mode="challenge"]').click()
  await step(page, 0.2)
  let s = await state(page)
  expect(s.mode).toBe('challenge')
  expect(s.stars).toBe(0)
  expect(s.ringR).toBeLessThan(s.target) // 置いただけでは 届かない
  await expect(page.locator('#stars')).toHaveClass(/is-on/)
  await expect(page.locator('#sizeBar')).not.toHaveClass(/is-on/)

  // 「押して、離す」を くりかえすだけで お星さまが たまる
  const seen: number[] = []
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__nijinowa.press(true))
    await step(page, 1.4)
    seen.push((await state(page)).stars)
    await page.evaluate(() => window.__nijinowa.press(false))
    await step(page, 1.4)
  }
  // 1 つ, 2 つ, そして 3 つめで お祝いして 0 に もどる (終わりのない設計)
  expect(seen).toEqual([1, 2, 0])
  expect(await page.locator('#stars i').count()).toBe(3)
  expect(errors).toEqual([])
})

test('もういちど ボタンで はじめから やりなおせる', async ({ page }) => {
  await open(page)
  await reachPlay(page)
  await page.locator('#again').click()
  await step(page, 0.3)
  const s = await state(page)
  expect(s.phase).toBe('place')
  expect(s.lightOn).toBe(false)
})

test('たて・よこ どちらでも 画面からはみ出さない', async ({ page }) => {
  await open(page)
  await reachPlay(page)
  await step(page, 0.3)

  const fit = await page.evaluate(() => {
    const g = window.__nijinowa.game as unknown as {
      snapshot: () => Record<string, number>
    }
    const s = g.snapshot()
    return {
      lensPx: (s.lensR as number) * (s.pxCss as number),
      w: window.innerWidth,
      h: window.innerHeight,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
    }
  })
  // 画面スクロールが 生まれていないこと
  expect(fit.scrollW).toBeLessThanOrEqual(fit.w + 1)
  expect(fit.scrollH).toBeLessThanOrEqual(fit.h + 1)
  // レンズが つぶれず、ちゃんと 大きく 出ていること
  expect(fit.lensPx * 2).toBeGreaterThan(Math.min(fit.w, fit.h) * 0.3)
})

test('実時間のループと ほんものの タッチでも 一周あそべる', async ({ page }) => {
  // test=1 を付けず、requestAnimationFrame で 動いている状態を そのまま触る
  const errors = await open(page, '/?fast=1&seed=7')

  await page.locator('#start').click({ force: true })
  await until(page, "s.phase === 'place'")

  const box = await page.locator('#scene').boundingBox()
  if (!box) throw new Error('no scene')
  const cx = box.x + box.width / 2
  const cy = box.y + box.height / 2

  await page.touchscreen.tap(cx, cy)
  await until(page, "s.phase === 'light'")

  await page.locator('#lamp').click({ force: true })
  await until(page, "s.phase === 'play' && s.light > 0.9")

  const rest = (await state(page)).ringR

  // 指を置いたまま、輪が ひろがるのを 待つ
  await page.mouse.move(cx, cy)
  await page.mouse.down()
  await until(page, `s.ringR > ${rest * 1.2}`)
  const held = (await state(page)).ringR
  expect(held).toBeGreaterThan(rest * 1.2)

  // 離すと もどる
  await page.mouse.up()
  await until(page, 's.press < 0.02')
  expect((await state(page)).ringR).toBeCloseTo(rest, 2)

  expect(errors).toEqual([])
})

test('あそんでいる途中で 画面を回しても 崩れない', async ({ page }) => {
  const errors = await open(page)
  await reachPlay(page)
  const before = await state(page)

  const sizes = [
    { width: 844, height: 390 },
    { width: 390, height: 844 },
    { width: 1024, height: 768 },
  ]
  for (const size of sizes) {
    await page.setViewportSize(size)
    // resize イベントは setViewportSize より あとに 届くので、
    // レイアウトが 実際に 組み直されるまで 待つ
    await page.waitForFunction(
      (expected) => window.__nijinowa.state().pxCss === expected,
      0.5 * Math.min(size.width, size.height),
    )
    await step(page, 0.3)
    const s = await state(page)
    const fit = await page.evaluate(() => ({
      w: window.innerWidth,
      h: window.innerHeight,
      scrollW: document.documentElement.scrollWidth,
      scrollH: document.documentElement.scrollHeight,
    }))
    expect(fit.scrollW, `${size.width}x${size.height} は 横スクロールしない`).toBeLessThanOrEqual(
      fit.w + 1,
    )
    expect(fit.scrollH).toBeLessThanOrEqual(fit.h + 1)
    // レンズは どの向きでも 画面の短辺の 3 割より 大きく 見えている
    expect(s.lensR * s.pxCss * 2).toBeGreaterThan(Math.min(fit.w, fit.h) * 0.3)
    // 遊びの状態は 保たれる
    expect(s.phase).toBe('play')
    expect(s.sizeStep).toBe(before.sizeStep)
  }
  expect(errors).toEqual([])
})
