// 実機相当の画面で一周あそんで、要所を絵に残す道具。
// 使い方: node tools/shots.mjs [出力フォルダ]
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const OUT = process.argv[2] || 'shots'
const CHROMIUM = process.env.PW_CHROMIUM_PATH || '/opt/pw-browsers/chromium'
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173'

const DEVICES = [
  { name: 'iphone-p', w: 390, h: 844 },
  { name: 'iphone-l', w: 844, h: 390 },
  { name: 'ipad-p', w: 768, h: 1024 },
  { name: 'ipad-l', w: 1024, h: 768 },
]

const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null

mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
})

for (const d of DEVICES.filter((x) => !ONLY || ONLY.includes(x.name))) {
  const ctx = await browser.newContext({
    viewport: { width: d.w, height: d.h },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => console.error(`[${d.name}] pageerror`, e))
  await page.goto(`${BASE}/?test=1&seed=7`)
  await page.waitForFunction(() => !!window.__nijinowa)

  const shot = (tag) => page.screenshot({ path: `${OUT}/${d.name}-${tag}.png` })
  const step = (s) => page.evaluate((n) => window.__nijinowa.step(n), s)

  await step(0.4)
  await shot('1-title')

  await page.evaluate(() => window.__nijinowa.begin())
  await step(0.5)
  await shot('2-place')

  // ガラスの真ん中へ置く
  const box = await page.locator('#scene').boundingBox()
  await page.mouse.move(box.width / 2, box.height / 2)
  await page.mouse.down()
  await step(0.25)
  await page.mouse.up()
  await step(1.4)
  await shot('3-lens-on-glass')

  await page.locator('#lamp').click()
  await step(0.35)
  await shot('4-light-reveal')
  await step(1.2)
  await shot('5-rings')

  // 押した瞬間
  await page.evaluate(() => window.__nijinowa.press(true))
  await step(0.09)
  await shot('6-press-instant')
  await step(0.14)
  await shot('7-press-overshoot')
  await step(0.9)
  await shot('8-press-held')
  await page.evaluate(() => window.__nijinowa.press(false))
  await step(0.12)
  await shot('9-release')
  await step(1.5)

  // じゆうモード: 大きさ
  for (let i = 0; i < 2; i++) await page.locator('.sizebtn[data-size="1"]').click()
  await step(0.4)
  await shot('10-lens-big')
  await page.evaluate(() => window.__nijinowa.press(true))
  await step(0.9)
  await shot('10b-lens-big-press')
  await page.evaluate(() => window.__nijinowa.press(false))
  await step(1.4)

  for (let i = 0; i < 4; i++) await page.locator('.sizebtn[data-size="-1"]').click()
  await step(0.4)
  await shot('11-lens-small')
  await page.evaluate(() => window.__nijinowa.press(true))
  await step(0.9)
  await shot('11b-lens-small-press')
  await page.evaluate(() => window.__nijinowa.press(false))
  await step(1.4)
  for (let i = 0; i < 2; i++) await page.locator('.sizebtn[data-size="1"]').click()
  await step(0.3)

  // チャレンジ
  await page.locator('.chip[data-mode="challenge"]').click()
  await step(0.4)
  await shot('12-challenge-target')
  await page.evaluate(() => window.__nijinowa.press(true))
  await step(0.35)
  await shot('13-challenge-reaching')
  await step(1.1)
  await shot('14-challenge-hit')
  await page.evaluate(() => window.__nijinowa.press(false))
  await step(1.6)
  await page.evaluate(() => window.__nijinowa.press(true))
  await step(1.5)
  await page.evaluate(() => window.__nijinowa.press(false))
  await step(1.6)
  await page.evaluate(() => window.__nijinowa.press(true))
  await step(1.5)
  await shot('15-challenge-done')

  console.log(`[${d.name}]`, JSON.stringify(await page.evaluate(() => window.__nijinowa.state())))
  await ctx.close()
}

await browser.close()
console.log('shots ->', OUT)
