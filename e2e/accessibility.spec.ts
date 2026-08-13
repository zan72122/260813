// 主要タッチ対象のboundingBoxが64px以上(title/hide/gate/album各画面)、reduced-motion起動、aria-label存在。
// iphone-portraitのみで実行(タッチサイズはCSSの絶対px指定のため、viewportサイズに左右されない)。
import { expect, test } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { collectConsoleErrors, qaUrl, waitForPhase, waitForReady } from "./helpers";

const MIN_SIZE = 64;

async function assertAllAtLeast(locator: Locator, min: number, label: string): Promise<void> {
  const count = await locator.count();
  expect(count, `expected at least 1 element for ${label}`).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const box = await locator.nth(i).boundingBox();
    expect(box, `${label}[${i}] should have a bounding box`).not.toBeNull();
    if (box) {
      expect(box.width, `${label}[${i}] width`).toBeGreaterThanOrEqual(min);
      expect(box.height, `${label}[${i}] height`).toBeGreaterThanOrEqual(min);
    }
  }
}

test.describe("accessibility", () => {
  // eslint-disable-next-line no-empty-pattern -- Playwrightのfixture destructuring規約上 {} が必要
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "iphone-portrait", "タッチサイズはpx絶対指定のため1projectのみで検証");
  });

  test("title画面: 主要ボタンが64px以上でaria-labelを持つ", async ({ page }) => {
    await page.goto(qaUrl());
    await waitForReady(page);
    await assertAllAtLeast(page.locator(".title-buttons .big-btn"), MIN_SIZE, "title big-btn");
    const playBtn = page.getByRole("button", { name: "あそぶ" });
    await expect(playBtn).toHaveAttribute("aria-label", "あそぶ");
  });

  test("hide画面: 食材トレイのスロットが64px以上でaria-labelを持つ", async ({ page }) => {
    await page.goto(qaUrl({ act: "hide" }));
    await waitForReady(page);
    await waitForPhase(page, "hide");
    await assertAllAtLeast(page.locator(".food-tray__slot"), MIN_SIZE, "food-tray__slot");
    const firstSlot = page.locator(".food-tray__slot").first();
    const ariaLabel = await firstSlot.getAttribute("aria-label");
    expect(ariaLabel).toBeTruthy();
  });

  test("gate画面: レバーが64px以上でaria-labelを持つ", async ({ page }) => {
    await page.goto(qaUrl({ act: "gate" }));
    await waitForReady(page);
    await waitForPhase(page, "gate");
    await assertAllAtLeast(page.locator(".gate-lever-handle"), MIN_SIZE, "gate-lever-handle");
    await expect(page.locator(".gate-lever-handle")).toHaveAttribute("aria-label", "ゲートを あける");
  });

  test("album画面: 主要ボタンが64px以上でaria-labelを持つ", async ({ page }) => {
    await page.goto(qaUrl({ act: "album" }));
    await waitForReady(page);
    await waitForPhase(page, "album");
    await assertAllAtLeast(page.locator(".album-buttons .big-btn"), MIN_SIZE, "album big-btn");
  });

  test("prefers-reduced-motionを尊重して起動できる", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors = collectConsoleErrors(page);
    await page.goto(qaUrl());
    await waitForReady(page);
    await expect(page.locator(".title-logo")).toBeVisible();
    expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
  });
});
