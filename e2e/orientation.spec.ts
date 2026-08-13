import { expect, test } from '@playwright/test';

/**
 * D2: orientation change mid-phase preserves game state and re-lays-out the
 * camera + UI (FSM state lives outside the renderer per DECISIONS.md #3).
 */
test('orientation change mid PLAY_CLEANUP preserves phase and progress', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });

  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto('/?test=1&seed=2');
  await page.waitForFunction(() => Boolean((window as unknown as { __game?: unknown }).__game));
  await page.evaluate(() => (window as unknown as { __game: { startGame: () => void } }).__game.startGame());
  await page.waitForTimeout(500);

  // Store two of the seven toys so there is real, checkable mid-phase progress.
  const stored = await page.evaluate(() => {
    const g = (window as unknown as { __game: { getSnapshot: () => { toys: { id: string; symbol: string }[]; baskets: { id: string; symbol: string }[] }; simulateStoreToy: (id: string) => { success: boolean } } }).__game;
    const snap = g.getSnapshot();
    const results: string[] = [];
    for (const toy of snap.toys.slice(0, 2)) {
      const r = g.simulateStoreToy(toy.id);
      if (r.success) results.push(toy.id);
    }
    return results;
  });
  expect(stored.length).toBe(2);

  const phaseBefore = await page.evaluate(() => (window as unknown as { __game: { phase: string } }).__game.phase);
  expect(phaseBefore).toBe('PLAY_CLEANUP');

  // Rotate portrait -> landscape mid-phase.
  await page.setViewportSize({ width: 852, height: 393 });
  await page.waitForTimeout(400);

  const phaseAfter = await page.evaluate(() => (window as unknown as { __game: { phase: string } }).__game.phase);
  const progressAfter = await page.evaluate(() => (window as unknown as { __game: { getProgress: () => { playCleanup: { storedToyIds: string[] } } } }).__game.getProgress());
  expect(phaseAfter).toBe('PLAY_CLEANUP');
  expect(progressAfter.playCleanup.storedToyIds.sort()).toEqual(stored.sort());

  // The camera/UI should still be functional after the resize — a further
  // real interaction (storing a third toy via drag) must still work.
  const toyId = await page.evaluate(() => {
    const g = (window as unknown as { __game: { getSnapshot: () => { toys: { id: string; symbol: string }[]; baskets: { id: string; symbol: string }[] } } }).__game;
    const snap = g.getSnapshot();
    return snap.toys.find((t) => !(window as unknown as { __game: { getProgress: () => { playCleanup: { storedToyIds: string[] } } } }).__game.getProgress().playCleanup.storedToyIds.includes(t.id))!.id;
  });
  const toyPos = await page.evaluate((id) => (window as unknown as { __game: { screenPositionOfToy: (id: string) => { x: number; y: number } | null } }).__game.screenPositionOfToy(id), toyId);
  const symbol = await page.evaluate((id) => (window as unknown as { __game: { getSnapshot: () => { toys: { id: string; symbol: string }[] } } }).__game.getSnapshot().toys.find((t) => t.id === id)!.symbol, toyId);
  const basketId = await page.evaluate((sym) => (window as unknown as { __game: { getSnapshot: () => { baskets: { id: string; symbol: string }[] } } }).__game.getSnapshot().baskets.find((b) => b.symbol === sym)!.id, symbol);
  const basketPos = await page.evaluate((id) => (window as unknown as { __game: { screenPositionOfBasket: (id: string) => { x: number; y: number } | null } }).__game.screenPositionOfBasket(id), basketId);

  expect(toyPos).not.toBeNull();
  expect(basketPos).not.toBeNull();
  if (toyPos && basketPos) {
    await page.mouse.move(toyPos.x, toyPos.y);
    await page.mouse.down();
    const steps = 10;
    for (let i = 1; i <= steps; i++) {
      await page.mouse.move(toyPos.x + ((basketPos.x - toyPos.x) * i) / steps, toyPos.y + ((basketPos.y - toyPos.y) * i) / steps, { steps: 2 });
      await page.waitForTimeout(10);
    }
    await page.mouse.up();
  }
  await page.waitForTimeout(400);

  const progressFinal = await page.evaluate(() => (window as unknown as { __game: { getProgress: () => { playCleanup: { storedToyIds: string[] } } } }).__game.getProgress());
  expect(progressFinal.playCleanup.storedToyIds.length).toBe(3);

  expect(errors).toEqual([]);
});
