// hide画面で390x844→844x390へviewport変更→状態(隠した餌数)が維持され、UIが再配置される。
// setViewportSizeで動的に変更するテストのため、iphone-portraitプロジェクト上で1回だけ実行する。
import { expect, test } from "@playwright/test";
import type { SpotKind } from "../src/core/types";
import { collectConsoleErrors, getState, hideFoodDirect, qaUrl, waitForPhase, waitForReady } from "./helpers";

test("hide画面での縦→横回転で隠した餌数が維持されUIが再配置される", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-portrait", "viewport切替検証は1projectのみで実行");

  const errors = collectConsoleErrors(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(qaUrl({ act: "hide" }));
  await waitForReady(page);
  await waitForPhase(page, "hide");

  const state1 = await getState(page);
  const spots = (state1.session?.config?.spots ?? []) as SpotKind[];
  expect(spots.length).toBeGreaterThan(0);
  const firstSpot = spots[0]!;
  await hideFoodDirect(page, firstSpot, "vegetable");

  const beforeRotate = await getState(page);
  const hiddenCountBefore = beforeRotate.session?.hidden?.length ?? 0;
  expect(hiddenCountBefore).toBeGreaterThanOrEqual(1);
  await expect(page.locator(".food-tray")).toHaveClass(/food-tray--portrait/);

  await page.setViewportSize({ width: 844, height: 390 });
  // resizeイベント経由の再配置を待つ(固定sleepではなくクラス変化を待機)。
  await expect(page.locator(".food-tray")).toHaveClass(/food-tray--landscape/, { timeout: 10_000 });

  const afterRotate = await getState(page);
  expect(afterRotate.phase).toBe("hide");
  expect(afterRotate.session?.hidden?.length ?? 0).toBe(hiddenCountBefore);

  expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
});
