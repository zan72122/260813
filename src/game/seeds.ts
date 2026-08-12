import { SeededRng } from './rng.ts';
import {
  CHILD_BADGE_POOL,
  TOTAL_CHILDREN,
  TOTAL_MATS,
  TOTAL_TOYS,
  TOY_MATERIALS,
  TOY_SYMBOLS,
  SHELF_THEMES,
  WEATHER_KINDS,
  type BasketDef,
  type ChildDef,
  type MatDef,
  type SeedConfig,
  type ToyDef,
} from './types.ts';

/** Fixed basket floor slots (normalized room-local space); symbol assignment is seeded. */
const BASKET_SLOTS: { id: string; position: { x: number; z: number }; radius: number }[] = [
  { id: 'basket-left', position: { x: -0.62, z: 0.55 }, radius: 0.16 },
  { id: 'basket-center', position: { x: 0, z: 0.62 }, radius: 0.16 },
  { id: 'basket-right', position: { x: 0.62, z: 0.55 }, radius: 0.16 },
];

/** Floor markers where nap mats are laid, in a tidy row. */
const MAT_MARKER_COUNT = TOTAL_MATS;

function scatterToyPosition(rng: SeededRng, index: number, total: number): { x: number; z: number } {
  // Spread toys across a grid of cells then jitter within the cell, so they
  // never overlap heavily regardless of seed while still looking scattered.
  const cols = 4;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const cellW = 1.7 / cols;
  const baseX = -0.85 + cellW * (col + 0.5);
  const baseZ = -0.55 - row * 0.28;
  const jitterX = rng.float(-cellW * 0.32, cellW * 0.32);
  const jitterZ = rng.float(-0.08, 0.08);
  void total;
  return { x: baseX + jitterX, z: baseZ + jitterZ };
}

export function generateSeedConfig(seed: number): SeedConfig {
  const rng = new SeededRng(seed);

  // Shuffle which physical basket slot gets which symbol this run.
  const shuffledSymbols = rng.shuffle(TOY_SYMBOLS);
  const baskets: BasketDef[] = BASKET_SLOTS.map((slot, i) => ({
    id: slot.id,
    symbol: shuffledSymbols[i % shuffledSymbols.length]!,
    position: slot.position,
    radius: slot.radius,
  }));

  // Every symbol appears at least twice among the 7 toys; remainder assigned randomly.
  const symbolPool: (typeof TOY_SYMBOLS)[number][] = [];
  for (let i = 0; i < TOTAL_TOYS; i++) {
    symbolPool.push(shuffledSymbols[i % shuffledSymbols.length]!);
  }
  const shuffledPool = rng.shuffle(symbolPool);

  const toys: ToyDef[] = [];
  for (let i = 0; i < TOTAL_TOYS; i++) {
    const material = TOY_MATERIALS[rng.int(0, TOY_MATERIALS.length - 1)]!;
    const pos = scatterToyPosition(rng, i, TOTAL_TOYS);
    toys.push({
      id: `toy-${i}`,
      symbol: shuffledPool[i]!,
      material,
      start: pos,
      rotationY: rng.float(0, Math.PI * 2),
    });
  }

  const children: ChildDef[] = [];
  for (let i = 0; i < TOTAL_CHILDREN; i++) {
    children.push({
      id: `child-${i}`,
      skinTone: rng.int(0, 3),
      hairStyle: rng.int(0, 2),
      hairColor: rng.int(0, 3),
      clothesColor: rng.int(0, 4),
      badgeSymbol: CHILD_BADGE_POOL[i % CHILD_BADGE_POOL.length]!,
      seatIndex: i,
    });
  }

  const mats: MatDef[] = [];
  for (let i = 0; i < MAT_MARKER_COUNT; i++) {
    mats.push({
      id: `mat-${i}`,
      colorway: rng.int(0, 3),
      markerIndex: i,
    });
  }

  const morningLightAngle = rng.float(-0.35, 0.35);
  const weather = rng.pick(WEATHER_KINDS);
  const shelfTheme = rng.pick(SHELF_THEMES);

  return { seed, toys, baskets, children, mats, morningLightAngle, weather, shelfTheme };
}

/** The three curated seeds guaranteed to ship and be visibly distinct. */
export const CURATED_SEEDS = [1, 2, 3] as const;

export function pickNextShuffleSeed(current: number, rng: SeededRng): number {
  // Shuffle replay: pick any seed other than the current one, unbounded range
  // so repeated shuffles keep feeling fresh, but stay deterministic given an
  // RNG stream (used by tests to assert "new seed, not equal to current").
  let next = rng.int(1, 1_000_000);
  if (next === current) next += 1;
  return next;
}
