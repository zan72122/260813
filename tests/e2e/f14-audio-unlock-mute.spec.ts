import { expect, test } from '@playwright/test';
import { getState, tapCanvas } from './helpers';

/**
 * F14 (docs/ACCEPTANCE.md): audio unlock on first gesture + mute.
 *
 * This test wraps the global `AudioContext` constructor from the test side
 * (standard technique, no app changes) to observe whether/when the app
 * creates one. Wave 3 wired the real WebAudioEngine (src/audio/AudioEngine.ts)
 * in place of NullAudioEngine, which creates an AudioContext lazily on first
 * unlock(). window.__stageDebug.getAudioState() also exposes
 * { contextState, muted } directly, as an alternative to the constructor-wrap
 * trick, for tests that don't need to distinguish "no context yet" from "one
 * exists but is suspended".
 */
test.describe('F14: audio unlock on first gesture, and mute', () => {
  test('the title tap (first gesture) creates/resumes an AudioContext', async ({ page }) => {
    await page.addInitScript(() => {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const instances: AudioContext[] = [];
      (window as unknown as { __audioContextInstances: AudioContext[] }).__audioContextInstances = instances;
      const Wrapped = function (this: AudioContext, ...args: unknown[]) {
        const ctx = new (Ctor as unknown as new (...a: unknown[]) => AudioContext)(...args);
        instances.push(ctx);
        return ctx;
      } as unknown as typeof AudioContext;
      Wrapped.prototype = Ctor.prototype;
      window.AudioContext = Wrapped;
    });

    await page.goto('/');
    await page.waitForSelector('#app canvas');
    await tapCanvas(page); // documented as the audio-unlock gesture (title phase)
    await page.waitForTimeout(300);

    const contextStates = await page.evaluate(() =>
      (window as unknown as { __audioContextInstances?: AudioContext[] }).__audioContextInstances?.map((c) => c.state) ?? []
    );

    expect(contextStates.length).toBeGreaterThan(0);
    for (const state of contextStates) {
      expect(['running', 'suspended']).toContain(state);
    }
  });

  test('the mute icon button toggles GameStateSnapshot.muted', async ({ page }) => {
    await page.goto('/');
    const muteButton = page.locator('.sus-mute');
    await expect(muteButton, 'UiSystem mute button (needs real UiSystem wired in App.ts)').toBeVisible({ timeout: 3000 });

    const before = await getState(page);
    await muteButton.click();
    await page.waitForFunction((wasMuted) => window.__stageDebug?.getState().muted !== wasMuted, before.muted, {
      timeout: 3000
    });
    const after = await getState(page);
    expect(after.muted).toBe(!before.muted);
  });
});
