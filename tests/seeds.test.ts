import { describe, expect, it } from 'vitest';
import { CURATED_SEEDS, generateSeedConfig } from '../src/game/seeds.ts';
import { TOTAL_CHILDREN, TOTAL_MATS, TOTAL_TOYS, TOY_SYMBOLS } from '../src/game/types.ts';

describe('generateSeedConfig', () => {
  it('is fully deterministic for the same seed', () => {
    const a = generateSeedConfig(1);
    const b = generateSeedConfig(1);
    expect(a).toEqual(b);
  });

  it('produces the required counts of entities', () => {
    for (const seed of CURATED_SEEDS) {
      const cfg = generateSeedConfig(seed);
      expect(cfg.toys).toHaveLength(TOTAL_TOYS);
      expect(cfg.baskets).toHaveLength(3);
      expect(cfg.children).toHaveLength(TOTAL_CHILDREN);
      expect(cfg.mats).toHaveLength(TOTAL_MATS);
    }
  });

  it('every basket symbol is one of the canonical symbols and baskets are distinct symbols', () => {
    const cfg = generateSeedConfig(1);
    const symbols = cfg.baskets.map((b) => b.symbol);
    expect(new Set(symbols).size).toBe(3);
    for (const s of symbols) expect(TOY_SYMBOLS).toContain(s);
  });

  it('every toy symbol matches an existing basket symbol (no orphan toys)', () => {
    for (const seed of CURATED_SEEDS) {
      const cfg = generateSeedConfig(seed);
      const basketSymbols = new Set(cfg.baskets.map((b) => b.symbol));
      for (const toy of cfg.toys) {
        expect(basketSymbols.has(toy.symbol)).toBe(true);
      }
    }
  });

  it('the 3 curated seeds produce visibly different layouts (toy positions, basket symbol assignment, or weather)', () => {
    const configs = CURATED_SEEDS.map((s) => generateSeedConfig(s));
    const signatures = configs.map((c) =>
      JSON.stringify({
        toyStarts: c.toys.map((t) => t.start),
        basketSymbols: c.baskets.map((b) => b.symbol),
        weather: c.weather,
        shelfTheme: c.shelfTheme,
        matColorways: c.mats.map((m) => m.colorway),
      }),
    );
    const uniq = new Set(signatures);
    expect(uniq.size).toBe(CURATED_SEEDS.length);
  });

  it('toy start positions stay within the floor bounds', () => {
    for (const seed of CURATED_SEEDS) {
      const cfg = generateSeedConfig(seed);
      for (const toy of cfg.toys) {
        expect(Math.abs(toy.start.x)).toBeLessThanOrEqual(1);
        expect(Math.abs(toy.start.z)).toBeLessThanOrEqual(1);
      }
    }
  });
});
