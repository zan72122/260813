import { expect, test } from '@playwright/test';

/**
 * F2: peak draw calls stay within budget (~120 target, 130 hard cap),
 * measured via renderer.info exposed on the test harness. Sampled across
 * every phase since different phases show different subsets of the scene.
 */
test('draw calls stay within the hard cap across every phase', async ({ page }) => {
  await page.goto('/?test=1&seed=1');
  await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game));

  const HARD_CAP = 130;
  const samples: { phase: string; drawCalls: number }[] = [];

  const sample = async (): Promise<void> => {
    await page.waitForTimeout(250);
    const s = await page.evaluate(() => {
      const g = (window as unknown as { __game: { phase: string; drawCalls: number } }).__game;
      return { phase: g.phase, drawCalls: g.drawCalls };
    });
    samples.push(s);
  };

  await sample(); // TITLE
  await page.evaluate(() => (window as unknown as { __game: { startGame: () => void } }).__game.startGame());
  await sample(); // PLAY_CLEANUP (all toys/baskets out)

  for (let i = 0; i < 5; i++) {
    await page.evaluate(() => (window as unknown as { __game: { completeCurrentObjective: () => void } }).__game.completeCurrentObjective());
    await sample();
    await page.evaluate(() => (window as unknown as { __game: { advancePhase: () => void } }).__game.advancePhase());
    await sample();
  }

  expect(samples.length).toBeGreaterThan(5);
  for (const s of samples) {
    expect(s.drawCalls, `phase ${s.phase} draw calls`).toBeLessThanOrEqual(HARD_CAP);
  }
  const peak = Math.max(...samples.map((s) => s.drawCalls));
  expect(peak).toBeGreaterThan(0);
  // eslint-disable-next-line no-console
  console.log('draw call samples:', JSON.stringify(samples), 'peak:', peak);
});
