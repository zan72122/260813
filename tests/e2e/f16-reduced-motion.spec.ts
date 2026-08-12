import { expect, test } from '@playwright/test';
import { getState } from './helpers';

/**
 * F16 (docs/ACCEPTANCE.md): Reduce Motion support. App.ts reads
 * detectReducedMotion() (src/accessibility/index.ts) into GameState at
 * construction and re-subscribes via watchReducedMotion() for live changes
 * — both already wired today, so this is expected to pass now.
 */
test.describe('F16: prefers-reduced-motion is reflected in GameStateSnapshot', () => {
  test('emulateMedia reduce before load -> reducedMotion true from boot', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.waitForSelector('#app canvas');

    const state = await getState(page);
    expect(state.reducedMotion).toBe(true);
  });

  test('emulateMedia no-preference before load -> reducedMotion false from boot', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.waitForSelector('#app canvas');

    const state = await getState(page);
    expect(state.reducedMotion).toBe(false);
  });

  test('toggling the OS-level preference mid-session updates reducedMotion live', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await page.goto('/');
    await page.waitForSelector('#app canvas');
    expect((await getState(page)).reducedMotion).toBe(false);

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.waitForFunction(() => window.__stageDebug?.getState().reducedMotion === true, { timeout: 3000 });
    expect((await getState(page)).reducedMotion).toBe(true);
  });
});
