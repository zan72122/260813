// manifest/SW登録確認(nosw無し)、2回目ロードでoffline起動できること(ops/reports/S5.mdのofflineスクリプトの
// spec化)。SW登録は実際のnetworkに触れる/永続化されるため他テストと干渉しないようiphone-portraitのみ、
// かつ直列(このファイル内はdescribe.serialでworkers=1と合わせて確実に直列化)で実行する。
import { expect, test } from "@playwright/test";
import { collectConsoleErrors, qaUrl, waitForReady } from "./helpers";

test.describe.serial("offline / pwa", () => {
  // eslint-disable-next-line no-empty-pattern -- Playwrightのfixture destructuring規約上 {} が必要
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "iphone-portrait", "SW/offline検証は1projectのみで直列実行");
  });

  test("manifestとservice workerが登録される", async ({ page, baseURL }) => {
    await page.goto(qaUrl({ nosw: undefined }));
    await waitForReady(page);

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(manifestHref).toBeTruthy();
    const manifestRes = await page.request.get(new URL(manifestHref ?? "manifest.webmanifest", baseURL!).toString());
    expect(manifestRes.ok()).toBe(true);
    const manifest = (await manifestRes.json()) as { name?: string; icons?: unknown[] };
    expect(manifest.name).toBeTruthy();
    expect(Array.isArray(manifest.icons) && manifest.icons.length).toBeTruthy();

    await page.waitForFunction(
      () => "serviceWorker" in navigator && navigator.serviceWorker.controller !== null,
      undefined,
      { timeout: 20_000 }
    );
    const registered = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return !!reg && reg.active !== null;
    });
    expect(registered).toBe(true);
  });

  test("オフラインでも2回目起動できる(コンソールエラー0)", async ({ page, context }) => {
    await page.goto(qaUrl({ nosw: undefined }));
    await waitForReady(page);
    await page.waitForFunction(
      () => "serviceWorker" in navigator && navigator.serviceWorker.controller !== null,
      undefined,
      { timeout: 20_000 }
    );

    await context.setOffline(true);
    const errors = collectConsoleErrors(page);
    await page.reload();
    await waitForReady(page, 20_000);
    await expect(page.locator(".title-logo")).toBeVisible();

    await context.setOffline(false);
    expect(errors, `console errors during offline reload:\n${errors.join("\n")}`).toHaveLength(0);
  });
});
