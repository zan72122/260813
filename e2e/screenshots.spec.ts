// qa:screenshots専用: 製品スクショ10枚をartifacts/screenshots/へ保存する。npm run qa:e2eからは除外
// (テストタイトルに@screenshotタグを含め、qa:e2eは--grep-invert @screenshotで除外する)。
// 単一project(iphone-portrait)でのみ実行し、他3projectでは重複生成しない。
import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BehaviorId } from "../src/core/types";
import { collectConsoleErrors, installCameraStabilityTracker, playBehaviorDirect, qaUrl, waitForCameraSettled, waitForPhase, waitForReady } from "./helpers";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(HERE, "..", "artifacts", "screenshots");

/** #ui-root(2D UIオーバーレイ、gate画面のレバーやtitle画面の大ボタン等)を撮影用に一時的に隠す。
 * playBehaviorDirect/openGate+elephantEnterはFSMのUI phaseを変えずに3D側だけを動かすQA用の直接
 * 呼び出しのため、隠さないと無関係なUI(タイトルの「あそぶ」ボタン等)が3Dの行動シーンに重なって
 * 写り込む(ops/reports/S3b.mdの撮影手順と同様、UIを隠して3D演出のみを撮る)。 */
async function hideUiOverlay(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.getElementById("ui-root");
    if (el) el.style.display = "none";
  });
}

// S3b.md「各行動の尺」(reducedMotion=false, timeScale=1の自然な尺)とS3c.mdで選定した山場%を使う。
// S3c.mdはreducedMotion短縮下の値のため、ここではtimeScale=1の自然な尺に対する同じ%で待つ。
const BEHAVIOR_SHOTS: { id: BehaviorId; file: string; naturalSeconds: number; pct: number }[] = [
  { id: "dig-sand", file: "04-dig-sand.png", naturalSeconds: 8.0, pct: 0.6 },
  { id: "reach-pipe", file: "05-reach-pipe.png", naturalSeconds: 6.9, pct: 0.6 },
  { id: "peel-banana", file: "06-peel-banana.png", naturalSeconds: 11.0, pct: 0.6 },
  { id: "break-branch", file: "07-break-branch.png", naturalSeconds: 8.2, pct: 0.2 },
  { id: "probe-gap", file: "08-probe-gap.png", naturalSeconds: 6.1, pct: 0.4 }
];

test("@screenshot 製品スクショ10枚を撮影する", async ({ page, browser }, testInfo) => {
  test.skip(testInfo.project.name !== "iphone-portrait", "スクショは単一projectのみで生成する(重複防止)");
  test.setTimeout(180_000);

  const errors = collectConsoleErrors(page);

  // 01: タイトル画面
  await page.goto(qaUrl());
  await waitForReady(page);
  await installCameraStabilityTracker(page);
  await waitForCameraSettled(page);
  await expect(page.locator(".title-logo")).toBeVisible();
  await page.screenshot({ path: path.join(OUT_DIR, "01-title.png") });

  // 02: hide画面、餌ドラッグのゴースト表示中
  await page.goto(qaUrl({ act: "hide" }));
  await waitForReady(page);
  await waitForPhase(page, "hide");
  await installCameraStabilityTracker(page);
  await waitForCameraSettled(page);
  const slot = page.locator(".food-tray__slot").first();
  const box = await slot.boundingBox();
  if (box) {
    const startX = box.x + box.width / 2;
    const startY = box.y + box.height / 2;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    await page.mouse.move(startX, startY - 60, { steps: 8 });
    await expect(page.locator(".food-tray__ghost")).toBeVisible();
    await page.screenshot({ path: path.join(OUT_DIR, "02-hide.png") });
    await page.mouse.up();
  }

  // 03: ゾウ登場直後。
  // 既知の不具合(ops/reports/S6.md「発見バグ」参照): act=seek(jumpTo("seek"))はprepareForPhaseが
  // elephantEnter()をawaitせずにseek画面をmountするため、seek画面のelephantSeekループがgaitの
  // 歩行中に競合して永久にstallする(src/ui/app.ts、S6編集範囲外)。ここではact=gateで止め、
  // openGate()→elephantEnter()を手動でawaitして安全に「ゾウ登場直後」を再現する。
  await page.goto(qaUrl({ act: "gate" }));
  await waitForReady(page);
  await waitForPhase(page, "gate");
  await installCameraStabilityTracker(page);
  await hideUiOverlay(page);
  await page.evaluate(async () => {
    const w = window as unknown as {
      __worldDebug: { openGate(): Promise<void>; elephantEnter(): Promise<void> };
      __cameraRigDebug?: { goTo(preset: string): Promise<void> };
    };
    await w.__worldDebug.openGate();
    await w.__cameraRigDebug?.goTo("overview");
    await w.__worldDebug.elephantEnter();
  });
  await waitForCameraSettled(page);
  await page.screenshot({ path: path.join(OUT_DIR, "03-gate-elephant.png") });

  // 04-08: 5固有行動の山場(playBehaviorDirectで歩行スキップ、timeScale=1の自然な尺の%で待つ)。
  // ここでの待機は固定sleepではなく、S3b/S3c.mdが実測した各行動の自然な尺に対する選定済みの
  // 山場%(dig-sand60%/reach-pipe60%/peel-banana60%/break-branch20%/probe-gap40%)にもとづく
  // 時間指定であり、各行動は毎回playBehaviorDirect呼び出し前にページを再読込して環境を初期状態へ戻す。
  for (const shot of BEHAVIOR_SHOTS) {
    await page.goto(qaUrl({ timeScale: 1 }));
    await waitForReady(page);
    await installCameraStabilityTracker(page);
    await hideUiOverlay(page);
    // 次のイテレーションでpage.gotoするとこのPromiseは「Execution context was destroyed」で
    // 後から reject される(演出の完了を待たずに次の行動へ進む設計のため)。catchしておかないと
    // 未処理rejectionとしてテストランナー側で後続テストを巻き込んで落ちる。
    playBehaviorDirect(page, shot.id).catch(() => {});
    await page.waitForTimeout(Math.round(shot.naturalSeconds * shot.pct * 1000));
    await page.screenshot({ path: path.join(OUT_DIR, shot.file) });
  }

  // 09: アルバム画面
  await page.goto(qaUrl({ act: "album" }));
  await waitForReady(page);
  await waitForPhase(page, "album");
  await installCameraStabilityTracker(page);
  await waitForCameraSettled(page);
  await expect(page.locator(".album-title")).toBeVisible();
  await page.screenshot({ path: path.join(OUT_DIR, "09-album.png") });

  // 10: 横向きhide画面(844x390)。他画面のviewportに影響しないよう別contextで撮る。
  const landscapeContext = await browser.newContext({ viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true });
  const landscapePage = await landscapeContext.newPage();
  await landscapePage.goto(qaUrl({ act: "hide" }));
  await waitForReady(landscapePage);
  await waitForPhase(landscapePage, "hide");
  await expect(landscapePage.locator(".food-tray")).toHaveClass(/food-tray--landscape/, { timeout: 10_000 });
  await landscapePage.screenshot({ path: path.join(OUT_DIR, "10-landscape-overview.png") });
  await landscapeContext.close();

  expect(errors, `console errors during screenshot run:\n${errors.join("\n")}`).toHaveLength(0);
});
