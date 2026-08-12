import { expect, test } from '@playwright/test';

import { GAME_STATE_IDS } from '../../src/contracts/states.ts';

import { readEiffel, waitForSceneReady, waitForState } from './helpers.ts';

test.describe('boot smoke test', () => {
  test('boots to attract with a rendered scene and zero console errors', async ({ page }) => {
    const pageErrors: string[] = [];
    page.on('pageerror', (err) => {
      pageErrors.push(err.message);
    });
    const consoleErrors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('/');

    await waitForSceneReady(page);

    const initialState = await page.evaluate(() => window.__eiffel.state);
    expect(initialState).toBe('attract');

    const readouts = await readEiffel(page);
    expect(readouts.state).toBe('attract');
    expect(readouts.cameraCue).toBe('establish');
    expect(readouts.paused).toBe(false);
    expect(readouts.soundOn).toBe(true);
    expect(Number.isFinite(readouts.t)).toBe(true);
    expect(Number.isFinite(readouts.drawCalls)).toBe(true);
    expect(readouts.drawCalls).toBeGreaterThan(0);

    const apiErrors = await page.evaluate(() => window.__eiffel.errors);
    expect(apiErrors).toEqual([]);
    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);

    await expect(page.getByTestId('stage-root')).toBeVisible();
  });

  test('every declared state is reachable directly via gotoState', async ({ page }) => {
    await page.goto('/');
    await waitForSceneReady(page);

    for (const target of GAME_STATE_IDS) {
      await page.evaluate((state) => {
        window.__eiffel.gotoState(state);
      }, target);
      await waitForState(page, target);
      const readouts = await readEiffel(page);
      expect(readouts.state).toBe(target);
    }
  });

  test('re-requesting the current state is a no-op (no double-fire)', async ({ page }) => {
    await page.goto('/');
    await waitForSceneReady(page);

    await page.evaluate(() => {
      window.__eiffel.gotoState('machineRoom');
    });
    await waitForState(page, 'machineRoom');

    // Firing the same state again must not throw and must leave state unchanged.
    await page.evaluate(() => {
      window.__eiffel.gotoState('machineRoom');
    });
    const state = await page.evaluate(() => window.__eiffel.state);
    expect(state).toBe('machineRoom');
  });

  test('setT and step(n) drive the deterministic-mode test API without errors', async ({ page }) => {
    await page.goto('/?det=1&seed=42');
    await waitForSceneReady(page);

    const seed = await page.evaluate(() => window.__eiffel.seed);
    expect(seed).toBe(42);

    await page.evaluate(() => {
      window.__eiffel.setT(0.5);
    });
    const afterSetT = await readEiffel(page);
    expect(afterSetT.t).toBeCloseTo(0.5, 6);

    await page.evaluate(() => {
      window.__eiffel.step(10);
    });

    const apiErrors = await page.evaluate(() => window.__eiffel.errors);
    expect(apiErrors).toEqual([]);
  });

  test('captures a boot screenshot into the QA artifact tree', async ({ page }, testInfo) => {
    await page.goto('/');
    await waitForSceneReady(page);
    await page.evaluate(() => window.__eiffel.settled());

    await page.screenshot({ path: `artifacts/qa/${testInfo.project.name}/00-boot.png` });

    const apiErrors = await page.evaluate(() => window.__eiffel.errors);
    expect(apiErrors).toEqual([]);
  });
});
