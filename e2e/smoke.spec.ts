// 起動→ready→タイトル表示→コンソールエラー0。4サイズ全プロジェクトで実行される(playwright.config.tsの
// projects4種、この specファイルはproject指定なしなので全て対象)。
import { expect, test } from "@playwright/test";
import { collectConsoleErrors, getState, qaUrl, waitForReady } from "./helpers";

test("起動→ready→タイトル表示→コンソールエラー0", async ({ page }) => {
  const errors = collectConsoleErrors(page);
  await page.goto(qaUrl());
  await waitForReady(page);

  await expect(page.locator(".title-logo")).toBeVisible();
  await expect(page.getByRole("button", { name: "あそぶ" })).toBeVisible();

  // ready はDebugApiのトップレベルpropertyであり、main.tsが登録するgetState()ハンドラは
  // 独自の{qa,quality,...}を返すためgetState().readyには含まれない(waitForReadyで既に別途確認済み)。
  const isReady = await page.evaluate(
    () => (window as unknown as { __ELEPHANT_GAME_DEBUG__?: { ready?: boolean } }).__ELEPHANT_GAME_DEBUG__?.ready === true
  );
  expect(isReady).toBe(true);
  const state = await getState(page);
  expect(state.phase).toBe("title");
  expect(state.qa).toBe(true);

  expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
});
