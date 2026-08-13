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

async function open(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (e) => errors.push(String(e)))
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text())
  })
  await page.goto(URL)
  await page.waitForFunction(() => !!window.__nijinowa)
  return errors
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
  await expect(page.locator('#stars')).toHaveClass(/is-on/)
  await expect(page.locator('#sizeBar')).not.toHaveClass(/is-on/)

  // 「押して、離す」を くりかえすだけ
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__nijinowa.press(true))
    await step(page, 1.4)
    await page.evaluate(() => window.__nijinowa.press(false))
    await step(page, 1.4)
    s = await state(page)
    if (s.stars === 0 && i === 2) break // 3 つめで一周してリセットされる
  }
  // 3 つ そろうと お祝いして 0 に もどる (終わりのない設計)
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
