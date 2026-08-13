// E2E共通ヘルパー。固定sleepではなくdebug API(ready/getState/screenshotReady)とイベント待ちで
// 進行させる方針(docs/INTERFACES.mdのDebugApi契約、ops/reports/S4.mdのjumpTo/hideFoodDirect、
// ops/reports/S3b.mdのplayBehaviorDirect/world.eventsの使い方を踏襲)。
import type { Page } from "@playwright/test";
import type { BehaviorId, FoodKind, GamePhase, SpotKind } from "../src/core/types";

/** docs/INTERFACES.md「スポット座標」節に記載の基準レイアウト(src/game/spots.tsと一致)。 */
export const SPOT_WORLD_POS: Record<SpotKind, { x: number; y: number; z: number }> = {
  "stone-gap": { x: -8, y: 0.9, z: -6 },
  sand: { x: 0, y: 0.05, z: 4 },
  pipe: { x: 7, y: 0.5, z: -1 },
  "banyan-root": { x: -6, y: 0.3, z: 3 },
  "high-branch": { x: 8, y: 3.6, z: -7 }
};

export interface QaState {
  ready?: boolean;
  qa?: boolean;
  quality?: string;
  timeScale?: number;
  seed?: number;
  elapsed?: number;
  phase?: GamePhase;
  freePlay?: boolean;
  session?: { hidden?: { spotId: SpotKind; food: FoodKind }[]; found?: SpotKind[]; config?: { spots?: SpotKind[] } } | null;
  album?: { session?: BehaviorId[]; observed?: BehaviorId[] };
  elephant?: unknown;
  render?: { drawCalls: number; triangles: number; calls: number } | null;
  [key: string]: unknown;
}

/** ?qa=1&quality=low&timeScale=8&seed=42&nosw=1 を基本にした起動URLを作る(overridesで上書き/追加可)。 */
export function qaUrl(overrides: Record<string, string | number | undefined> = {}): string {
  const params = new URLSearchParams({ qa: "1", quality: "low", timeScale: "8", seed: "42", nosw: "1" });
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) params.delete(k);
    else params.set(k, String(v));
  }
  return `/?${params.toString()}`;
}

/** consoleのerrorとpageerrorを収集する。各specの冒頭で呼び、末尾でlength===0をassertする。 */
export function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(`[console] ${msg.text()}`);
  });
  page.on("pageerror", (err) => {
    errors.push(`[pageerror] ${err.message}`);
  });
  return errors;
}

/** window.__ELEPHANT_GAME_DEBUG__.ready===true になるまで待つ(固定sleep禁止)。 */
export async function waitForReady(page: Page, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const api = (window as unknown as { __ELEPHANT_GAME_DEBUG__?: { ready?: boolean } }).__ELEPHANT_GAME_DEBUG__;
      return !!api && api.ready === true;
    },
    undefined,
    { timeout }
  );
}

export async function getState(page: Page): Promise<QaState> {
  return page.evaluate(() => {
    const api = (window as unknown as { __ELEPHANT_GAME_DEBUG__: { getState(): unknown } }).__ELEPHANT_GAME_DEBUG__;
    return api.getState() as QaState;
  });
}

export async function waitForPhase(page: Page, phase: GamePhase, timeout = 30_000): Promise<void> {
  await page.waitForFunction(
    (p) => {
      const api = (window as unknown as { __ELEPHANT_GAME_DEBUG__?: { getState(): { phase?: string } } }).__ELEPHANT_GAME_DEBUG__;
      const s = api?.getState();
      return !!s && s.phase === p;
    },
    phase,
    { timeout }
  );
}

export async function jumpTo(page: Page, phase: GamePhase): Promise<void> {
  await page.evaluate((p) => {
    const api = (window as unknown as { __ELEPHANT_GAME_DEBUG__: { jumpTo(phase: string): void } }).__ELEPHANT_GAME_DEBUG__;
    api.jumpTo(p);
  }, phase);
}

export async function hideFoodDirect(page: Page, spotId: SpotKind, food: FoodKind): Promise<void> {
  await page.evaluate(
    ([s, f]) => {
      const api = (window as unknown as { __ELEPHANT_GAME_DEBUG__: { hideFoodDirect(spotId: string, food: string): Promise<void> } })
        .__ELEPHANT_GAME_DEBUG__;
      return api.hideFoodDirect(s, f);
    },
    [spotId, food] as const
  );
}

export async function playBehaviorDirect(page: Page, id: BehaviorId): Promise<void> {
  await page.evaluate((behaviorId) => {
    const w = window as unknown as { __worldDebug: { playBehaviorDirect(id: string): Promise<void> } };
    return w.__worldDebug.playBehaviorDirect(behaviorId);
  }, id);
}

/** window.__worldDebug.events経由でbehavior:completeを記録するリスナーを1本だけ設置する。
 * ready後、実際にplayBehavior/elephantSeekを呼ぶ前に呼んでおくこと(取りこぼし防止)。 */
export async function installBehaviorCompleteLogger(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __worldDebug?: { events: { on(kind: string, cb: (p: { behaviorId: string; spotId: string }) => void): void } };
      __qaBehaviorLog?: { behaviorId: string; spotId: string }[];
    };
    if (!w.__worldDebug || w.__qaBehaviorLog) return;
    w.__qaBehaviorLog = [];
    w.__worldDebug.events.on("behavior:complete", (p) => {
      w.__qaBehaviorLog?.push(p);
    });
  });
}

export async function waitForBehaviorCompleteCount(page: Page, count: number, timeout = 45_000): Promise<{ behaviorId: string; spotId: string }[]> {
  await page.waitForFunction(
    (n) => (window as unknown as { __qaBehaviorLog?: unknown[] }).__qaBehaviorLog?.length !== undefined
      && (window as unknown as { __qaBehaviorLog: unknown[] }).__qaBehaviorLog.length >= n,
    count,
    { timeout }
  );
  return page.evaluate(() => (window as unknown as { __qaBehaviorLog: { behaviorId: string; spotId: string }[] }).__qaBehaviorLog);
}

/** debug API契約のscreenshotReady()。docs/INTERFACES.mdの契約どおり「カメラ遷移・tween静止でtrue」を
 * 期待しているが、実装調査の結果main.ts(S6編集禁止範囲)のハンドラ登録が`() => true`固定スタブに
 * なっており、契約どおりには機能していないことが判明した(ops/reports/S6.md「発見バグ」参照、
 * 修正はS6の担当範囲外のため記録のみ)。E2Eではこの関数に頼らず、代わりに下記
 * waitForCameraSettled()(window.__cameraRigDebug.camera.positionの連続フレーム比較)で
 * カメラ静止を待つ。 */
export async function waitForScreenshotReady(page: Page, timeout = 15_000): Promise<void> {
  await page.waitForFunction(
    () => {
      const api = (window as unknown as { __ELEPHANT_GAME_DEBUG__?: { screenshotReady(): boolean } }).__ELEPHANT_GAME_DEBUG__;
      return !!api && api.screenshotReady();
    },
    undefined,
    { timeout }
  );
}

/** window.__cameraRigDebug.camera.position/quaternionを毎フレーム比較し、連続して変化が無くなった
 * フレーム数を window.__qaCamStableFrames へ積む常駐トラッカーを1本だけ設置する(冪等)。
 * screenshotReady()が実質常にtrueを返す既知の不具合(上記コメント参照)を避けるため、固定sleepの
 * 代わりにこちらでカメラtweenの実静止を検出する。 */
export async function installCameraStabilityTracker(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __qaCamStableFrames?: number;
      __qaCamTrackerInstalled?: boolean;
      __qaCamLastKey?: string | null;
      __cameraRigDebug?: { camera?: { position: { x: number; y: number; z: number } } };
    };
    if (w.__qaCamTrackerInstalled) return;
    w.__qaCamTrackerInstalled = true;
    w.__qaCamStableFrames = 0;
    w.__qaCamLastKey = null;
    const tick = (): void => {
      const cam = w.__cameraRigDebug?.camera;
      if (cam) {
        const p = cam.position;
        const key = `${p.x.toFixed(4)},${p.y.toFixed(4)},${p.z.toFixed(4)}`;
        if (key === w.__qaCamLastKey) w.__qaCamStableFrames = (w.__qaCamStableFrames ?? 0) + 1;
        else w.__qaCamStableFrames = 0;
        w.__qaCamLastKey = key;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** installCameraStabilityTracker()設置後、カメラ位置がminStableFrames連続で変化しなくなるまで待つ。 */
export async function waitForCameraSettled(page: Page, minStableFrames = 8, timeout = 15_000): Promise<void> {
  await page.waitForFunction(
    (n) => (window as unknown as { __qaCamStableFrames?: number }).__qaCamStableFrames !== undefined
      && (window as unknown as { __qaCamStableFrames: number }).__qaCamStableFrames >= n,
    minStableFrames,
    { timeout }
  );
}

/** three.jsのcamera(?qa=1時にcameras.tsが公開するwindow.__cameraRigDebug)を使い、ワールド座標を
 * 画面ピクセル座標へ厳密に投影する(THREE.Vector3.projectと同じ行列計算をTHREE非依存で再現)。
 * 実ポインタドラッグでどの位置へ落とせばスポットへ吸着するかを正確に求めるために使う。 */
export async function projectToScreen(page: Page, world: { x: number; y: number; z: number }): Promise<{ x: number; y: number } | null> {
  return page.evaluate((w) => {
    interface CamLike {
      updateMatrixWorld(): void;
      projectionMatrix: { elements: number[] };
      matrixWorldInverse: { elements: number[] };
    }
    const rig = (window as unknown as { __cameraRigDebug?: { camera?: CamLike } }).__cameraRigDebug;
    const cam = rig?.camera;
    if (!cam) return null;
    cam.updateMatrixWorld();
    const mulVec4 = (m: number[], v: number[]): number[] => {
      const r = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) {
        r[i] = (m[i] ?? 0) * v[0]! + (m[i + 4] ?? 0) * v[1]! + (m[i + 8] ?? 0) * v[2]! + (m[i + 12] ?? 0) * v[3]!;
      }
      return r;
    };
    const viewed = mulVec4(cam.matrixWorldInverse.elements, [w.x, w.y, w.z, 1]);
    const clip = mulVec4(cam.projectionMatrix.elements, viewed);
    if (!clip[3]) return null;
    const ndcX = clip[0]! / clip[3]!;
    const ndcY = clip[1]! / clip[3]!;
    return { x: (ndcX * 0.5 + 0.5) * window.innerWidth, y: (1 - (ndcY * 0.5 + 0.5)) * window.innerHeight };
  }, world);
}

/** window.__worldDebugからscene全体を走査し、三角形数・メッシュ数を概算する(renderer.infoは
 * main.ts/renderer.ts(編集禁止)を配線しないと取得できないための代替計測。詳細はdocs/QA_REPORT.md)。 */
export async function approximateSceneStats(page: Page): Promise<{ meshCount: number; approxTriangles: number } | null> {
  return page.evaluate(() => {
    interface Obj3DLike {
      children: Obj3DLike[];
      isMesh?: boolean;
      geometry?: { index?: { count: number } | null; attributes?: { position?: { count: number } } };
    }
    const w = window as unknown as { __worldDebug?: { scene?: Obj3DLike } };
    const scene = w.__worldDebug?.scene;
    if (!scene) return null;
    let meshCount = 0;
    let approxTriangles = 0;
    const walk = (node: Obj3DLike): void => {
      if (node.isMesh && node.geometry) {
        meshCount += 1;
        const idx = node.geometry.index?.count;
        const pos = node.geometry.attributes?.position?.count;
        const count = idx ?? pos ?? 0;
        approxTriangles += Math.floor(count / 3);
      }
      for (const child of node.children) walk(child);
    };
    walk(scene);
    return { meshCount, approxTriangles };
  });
}

/** src/game/spots.tsのacceptedFoodTypes[0]と一致(hideFoodDirectへ渡す食材種の決定用)。 */
export const SPOT_FIRST_FOOD: Record<SpotKind, FoodKind> = {
  "stone-gap": "vegetable",
  sand: "hay-cube",
  pipe: "vegetable",
  "banyan-root": "banana-stem",
  "high-branch": "branch"
};

/** 実ポインタドラッグ(mouse down→複数stepのmove→up)。food-tray__slot等のPointer Eventsハンドラは
 * page.mouse.*が発行する実イベントで反応する(Chromiumではmouse系操作が実際のPointerEventも発火する)。 */
export async function realPointerDrag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }, steps = 14): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    await page.mouse.move(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, { steps: 2 });
  }
  await page.mouse.up();
}

/** 中心点から距離dx,dyだけ実スワイプ(gate-lever/finish-gesture等、距離しきい値のある操作向け)。 */
export async function realSwipe(page: Page, center: { x: number; y: number }, dx: number, dy: number, steps = 10): Promise<void> {
  await realPointerDrag(page, center, { x: center.x + dx, y: center.y + dy }, steps);
}
