import { describe, expect, it } from 'vitest';
import {
  FOIL_TARGET,
  MIN_FOIL_TO_FINISH,
  PHASE_ORDER,
  PRESS_TARGET,
  Phase,
  canFinishFoil,
  embossFor,
  foilProgress,
  nextPhase,
  showsCard,
} from '../../src/game/flow';

describe('phase order', () => {
  it('walks title -> pickCard -> pickStamp -> press -> foil -> finish', () => {
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

  it('keeps the album out of the making order', () => {
    expect(PHASE_ORDER).not.toContain('album');
    expect(nextPhase('album')).toBe('pickCard');
  });

  it('shows the 3D card everywhere except the picker and shelf screens', () => {
    expect(showsCard('title')).toBe(true);
    expect(showsCard('press')).toBe(true);
    expect(showsCard('foil')).toBe(true);
    expect(showsCard('finish')).toBe(true);
    expect(showsCard('pickCard')).toBe(false);
    expect(showsCard('pickStamp')).toBe(false);
    expect(showsCard('album')).toBe(false);
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
  it('reports pip progress against the target and clamps at 1', () => {
    expect(foilProgress(0)).toBe(0);
    expect(foilProgress(FOIL_TARGET)).toBe(1);
    expect(foilProgress(1)).toBe(1);
    expect(foilProgress(FOIL_TARGET / 2)).toBeCloseTo(0.5, 5);
  });

  it('lets the child finish long before the pips are full - stopping early is a style', () => {
    expect(canFinishFoil(0)).toBe(false);
    expect(canFinishFoil(MIN_FOIL_TO_FINISH)).toBe(true);
    expect(MIN_FOIL_TO_FINISH).toBeLessThan(FOIL_TARGET / 2);
  });

  it('never forces a finish: the threshold only gates the button', () => {
    expect(canFinishFoil(1)).toBe(true);
  });
});
