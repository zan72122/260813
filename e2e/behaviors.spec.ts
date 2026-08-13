// jumpTo(gate相当の前提構築は不要)+playBehaviorDirectで5行動を順に再生し、それぞれbehavior:completeを
// 確認する。iphone-landscapeのみで実行(他projectはfull-loop/screenshotsで行動再生を別途担保)。
import { expect, test } from "@playwright/test";
import type { BehaviorId } from "../src/core/types";
import { collectConsoleErrors, installBehaviorCompleteLogger, playBehaviorDirect, qaUrl, waitForBehaviorCompleteCount, waitForReady } from "./helpers";

const BEHAVIOR_IDS: BehaviorId[] = ["probe-gap", "dig-sand", "reach-pipe", "peel-banana", "break-branch"];

test("5固有行動をplayBehaviorDirectで順に再生しbehavior:completeを確認", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-landscape", "5行動の再生検証はiphone-landscapeのみで実行");
  test.setTimeout(75_000);

  const errors = collectConsoleErrors(page);
  await page.goto(qaUrl());
  await waitForReady(page);
  await installBehaviorCompleteLogger(page);

  for (let i = 0; i < BEHAVIOR_IDS.length; i++) {
    const id = BEHAVIOR_IDS[i]!;
    await playBehaviorDirect(page, id);
    const log = await waitForBehaviorCompleteCount(page, i + 1, 30_000);
    expect(log[i]?.behaviorId).toBe(id);
  }

  // 注: album.sessionへの記録はUI層(src/ui/screens/seek.tsのbehavior:complete購読)が行うため、
  // seek画面を経由しないplayBehaviorDirect単体呼び出しでは更新されない(想定どおり、S3b.md参照)。
  // ここではworld.events経由のbehavior:complete発火(waitForBehaviorCompleteCountで確認済み)を
  // 正としてassertする。

  expect(errors, `console errors:\n${errors.join("\n")}`).toHaveLength(0);
});
