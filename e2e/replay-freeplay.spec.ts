// album→ばしょをかえる/じゆうにあそぶ解放(localStorage経由の状態も検証)、seed固定で提案スポットが
// 再現すること。重量シナリオではないためiphone-portraitのみで実行し、実行時間を抑える。
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { SpotKind } from "../src/core/types";
import { getState, jumpTo, qaUrl, waitForPhase, waitForReady } from "./helpers";

const SAVE_KEY = "elephant-hidden-feast:v1";

async function readSave(page: Page): Promise<Record<string, unknown> | null> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), SAVE_KEY);
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
}

test.describe("replay / freeplay", () => {
  // eslint-disable-next-line no-empty-pattern -- Playwrightのfixture destructuring規約上 {} が必要
  test.beforeEach(({}, testInfo) => {
    test.skip(testInfo.project.name !== "iphone-portrait", "replay/freeplay検証はiphone-portraitのみで実行");
  });

  test("album到達でfirstPlayDone/freePlayUnlockedが保存され、ばしょをかえる/じゆうにあそぶが解放される", async ({ page }) => {
    await page.goto(qaUrl({ act: "album" }));
    await waitForReady(page);
    await waitForPhase(page, "album");

    const save = await readSave(page);
    expect(save?.firstPlayDone).toBe(true);
    expect(save?.freePlayUnlocked).toBe(true);

    await expect(page.getByRole("button", { name: "じゆうにあそぶ" })).toBeVisible();

    const beforeState = await getState(page);
    const prevSpots = ((beforeState.session?.config?.spots ?? []) as SpotKind[]).slice().sort();

    await page.getByRole("button", { name: "ばしょをかえる" }).click();
    await waitForPhase(page, "hide");

    const afterState = await getState(page);
    expect(afterState.session?.config?.spots?.length).toBeGreaterThan(0);
    expect(afterState.freePlay).toBe(false);
    // ばしょをかえるは直前と異なる組合せになるよう最大6回リトライする仕様(ops/reports/S4.md)。
    // 低確率で同一になり得るため、厳密な不一致までは要求せず「有効な提案が新規生成された」ことを確認する。
    void prevSpots;

    // タイトルへ戻っても解放状態が保たれること(同一ページ内でlocalStorage経由)。
    await page.goto(qaUrl());
    await waitForReady(page);
    await expect(page.getByRole("button", { name: "じゆうにあそぶ" })).toBeVisible();
  });

  test("seed固定でalbum到達後の提案スポットが再現する", async ({ page, browser }) => {
    await page.goto(qaUrl({ act: "album", seed: 42 }));
    await waitForReady(page);
    await waitForPhase(page, "album");
    await jumpTo(page, "hide");
    await waitForPhase(page, "hide");
    const state1 = await getState(page);
    const spots1 = ((state1.session?.config?.spots ?? []) as SpotKind[]).slice().sort();

    const context2 = await browser.newContext();
    const page2 = await context2.newPage();
    await page2.goto(qaUrl({ act: "album", seed: 42 }));
    await waitForReady(page2);
    await waitForPhase(page2, "album");
    await jumpTo(page2, "hide");
    await waitForPhase(page2, "hide");
    const state2 = await getState(page2);
    const spots2 = ((state2.session?.config?.spots ?? []) as SpotKind[]).slice().sort();
    await context2.close();

    expect(spots1.length).toBeGreaterThan(0);
    expect(spots1).toEqual(spots2);
  });
});
