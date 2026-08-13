import { expect, test } from '@playwright/test';
import { CURATED_SEEDS } from '../src/game/seeds.ts';

/**
 * D3: reload lands back on a working title screen.
 * E2: mute toggle works and persists across reload.
 * A6/DECISIONS#4: seed determinism — same ?seed=N always yields the same
 * toy/basket/mat/weather snapshot; the 3 curated seeds are visibly distinct.
 */
test('reload returns to a working title screen', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.goto('/?test=1&seed=1');
  await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game));
  await page.evaluate(() => (window as unknown as { __game: { startGame: () => void } }).__game.startGame());
  await page.waitForTimeout(500);
  const phaseBefore = await page.evaluate(() => (window as unknown as { __game: { phase: string } }).__game.phase);
  expect(phaseBefore).toBe('PLAY_CLEANUP');

  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game));
  const phaseAfterReload = await page.evaluate(() => (window as unknown as { __game: { phase: string } }).__game.phase);
  expect(phaseAfterReload).toBe('TITLE');
  await expect(page.locator('.title-button')).toBeVisible();

  expect(errors).toEqual([]);
});

test('mute toggle persists across reload and game remains fully playable muted', async ({ page }) => {
  await page.goto('/?test=1&seed=1');
  await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game));

  const initiallyMuted = await page.evaluate(() => (window as unknown as { __game: { muted: boolean } }).__game.muted);
  expect(initiallyMuted).toBe(false);

  // Tap the real mute button (not the harness) so the Overlay's own visual state is exercised too.
  const muteButton = page.locator('.icon-btn[aria-label="mute"]');
  await muteButton.click();
  const mutedNow = await page.evaluate(() => (window as unknown as { __game: { muted: boolean } }).__game.muted);
  expect(mutedNow).toBe(true);
  await expect(muteButton).toHaveClass(/off/);

  await page.reload();
  await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game));
  const mutedAfterReload = await page.evaluate(() => (window as unknown as { __game: { muted: boolean } }).__game.muted);
  expect(mutedAfterReload).toBe(true);

  // Fully playable while muted: start + store one toy.
  await page.evaluate(() => (window as unknown as { __game: { startGame: () => void } }).__game.startGame());
  await page.waitForTimeout(400);
  const result = await page.evaluate(() => {
    const g = (window as unknown as { __game: { getSnapshot: () => { toys: { id: string; symbol: string }[]; baskets: { id: string; symbol: string }[] }; simulateStoreToy: (id: string) => { success: boolean } } }).__game;
    const toy = g.getSnapshot().toys[0]!;
    return g.simulateStoreToy(toy.id);
  });
  expect(result.success).toBe(true);
});

test('seed determinism: same seed produces the same layout snapshot every load', async ({ page }) => {
  for (const seed of CURATED_SEEDS) {
    await page.goto(`/?test=1&seed=${seed}`);
    await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game));
    const snapshotA = await page.evaluate(() => (window as unknown as { __game: { getSnapshot: () => unknown } }).__game.getSnapshot());

    await page.reload();
    await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game));
    const snapshotB = await page.evaluate(() => (window as unknown as { __game: { getSnapshot: () => unknown } }).__game.getSnapshot());

    expect(snapshotB).toEqual(snapshotA);
  }
});

test('the 3 curated seeds produce visibly different toy/basket/mat/weather layouts', async ({ page }) => {
  const signatures: string[] = [];
  for (const seed of CURATED_SEEDS) {
    await page.goto(`/?test=1&seed=${seed}`);
    await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game));
    const snapshot = await page.evaluate(
      () =>
        (window as unknown as {
          __game: { getSnapshot: () => { toys: { start: { x: number; z: number } }[]; baskets: { symbol: string }[]; weather: string; mats: { colorway: number }[] } };
        }).__game.getSnapshot(),
    );
    signatures.push(
      JSON.stringify({
        toyStarts: snapshot.toys.map((t) => t.start),
        basketSymbols: snapshot.baskets.map((b) => b.symbol),
        weather: snapshot.weather,
        matColorways: snapshot.mats.map((m) => m.colorway),
      }),
    );
  }
  expect(new Set(signatures).size).toBe(CURATED_SEEDS.length);
});
