import { describe, expect, it } from 'vitest';
import {
  FOIL_TARGET,
  PHASE_ORDER,
  PRESS_TARGET,
  Phase,
  embossFor,
  emptyBuild,
  foilDone,
  foilProgress,
  nextPhase,
  showsCard,
} from '../../src/game/flow';

describe('phase order', () => {
  it('walks title -> pickCard -> pickPattern -> press -> foil -> finish', () => {
    let p: Phase = 'title';
    const seen: Phase[] = [p];
    for (let i = 0; i < PHASE_ORDER.length - 1; i++) {
      p = nextPhase(p);
      seen.push(p);
    }
    expect(seen).toEqual(PHASE_ORDER);
  });

  it('loops from finish straight back into a new build, not the title', () => {
    expect(nextPhase('finish')).toBe('pickCard');
  });

  it('shows the 3D card everywhere except the picker screens', () => {
    expect(showsCard('title')).toBe(true);
    expect(showsCard('press')).toBe(true);
    expect(showsCard('foil')).toBe(true);
    expect(showsCard('finish')).toBe(true);
    expect(showsCard('pickCard')).toBe(false);
    expect(showsCard('pickPattern')).toBe(false);
  });
});

describe('emboss', () => {
  it('reaches full depth exactly at the press target', () => {
    expect(embossFor(0)).toBe(0);
    expect(embossFor(PRESS_TARGET)).toBe(1);
  });

  it('rises monotonically and clamps past the target', () => {
    let prev = -1;
    for (let i = 0; i <= PRESS_TARGET; i++) {
      const v = embossFor(i);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
    expect(embossFor(PRESS_TARGET + 5)).toBe(1);
    expect(embossFor(-3)).toBe(0);
  });
});

describe('foil', () => {
  it('reports progress against the target and clamps at 1', () => {
    expect(foilProgress(0)).toBe(0);
    expect(foilProgress(FOIL_TARGET)).toBe(1);
    expect(foilProgress(1)).toBe(1);
    expect(foilProgress(FOIL_TARGET / 2)).toBeCloseTo(0.5, 5);
  });

  it('is done only once the target is reached', () => {
    expect(foilDone(FOIL_TARGET - 0.01)).toBe(false);
    expect(foilDone(FOIL_TARGET)).toBe(true);
  });

  it('leaves enough of the card to still be worth rolling', () => {
    expect(FOIL_TARGET).toBeGreaterThan(0.5);
    expect(FOIL_TARGET).toBeLessThan(1);
  });
});

describe('emptyBuild', () => {
  it('starts from the first card, first pattern, nothing pressed', () => {
    expect(emptyBuild()).toEqual({ card: 0, pattern: 0, presses: 0 });
  });

  it('returns a fresh object each time', () => {
    const a = emptyBuild();
    a.presses = 3;
    expect(emptyBuild().presses).toBe(0);
  });
});
