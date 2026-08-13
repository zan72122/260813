// 設定変更→リロード→維持。localStorage無効(page.addInitScriptでthrowするProxyに差し替え)でも
// 起動しエラー0であること。iphone-portraitのみで実行。
import { expect, test } from "@playwright/test";
import { collectConsoleErrors, qaUrl, waitForReady } from "./helpers";

test.describe("persistence", () => {
  // eslint-disable-next-line no-empty-pattern -- Playwrightのfixture destructuring規約上 {} が必要
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "iphone-portrait", "保存系検証はiphone-portraitのみで実行");
  });

  test("せっていの変更がリロード後も維持される", async ({ page }) => {
    await page.goto(qaUrl());
    await waitForReady(page);

    await page.locator(".info-fab").click();
    await page.getByRole("button", { name: "せっていをひらく" }).click();

    const motionToggle = page.getByRole("switch", { name: "うごきをへらす" });
    await expect(motionToggle).toBeVisible();
    const before = await motionToggle.getAttribute("aria-checked");
    await motionToggle.click();
    const after = await motionToggle.getAttribute("aria-checked");
    expect(after).not.toBe(before);

    await page.reload();
    await waitForReady(page);

    await page.locator(".info-fab").click();
    await page.getByRole("button", { name: "せっていをひらく" }).click();
    const reopened = page.getByRole("switch", { name: "うごきをへらす" });
    await expect(reopened).toHaveAttribute("aria-checked", after ?? "");
  });

  test("localStorage無効環境でも起動しコンソールエラー0", async ({ page }) => {
    await page.addInitScript(() => {
      const throwingStorage = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "getItem" || prop === "setItem" || prop === "removeItem" || prop === "clear") {
              return () => {
                throw new DOMException("blocked", "SecurityError");
              };
            }
            return undefined;
          }
        }
      );
      Object.defineProperty(window, "localStorage", { value: throwingStorage, configurable: true });
    });

    const errors = collectConsoleErrors(page);
    await page.goto(qaUrl());
    await waitForReady(page);
    await expect(page.locator(".title-logo")).toBeVisible();

    expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
  });
});
