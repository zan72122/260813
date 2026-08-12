import { describe, expect, it } from 'vitest';
import { createAnchorRegistry } from '../anchors';
import type { Anchor } from '../types';

function anchor(overrides: Partial<Anchor> & Pick<Anchor, 'id'>): Anchor {
  return { x: 0, y: 0, r: 10, active: true, ...overrides };
}

describe('createAnchorRegistry', () => {
  it('set()/get() round-trips an anchor', () => {
    const reg = createAnchorRegistry();
    reg.set(anchor({ id: 'hook', x: 100, y: 200, r: 20 }));
    expect(reg.get('hook')).toEqual({ id: 'hook', x: 100, y: 200, r: 20, active: true });
  });

  it('get() returns undefined for an unregistered id', () => {
    const reg = createAnchorRegistry();
    expect(reg.get('lever')).toBeUndefined();
  });

  it('all() lists every registered anchor', () => {
    const reg = createAnchorRegistry();
    reg.set(anchor({ id: 'hook', x: 0, y: 0 }));
    reg.set(anchor({ id: 'beam', x: 10, y: 10 }));
    expect(reg.all().map((a) => a.id).sort()).toEqual(['beam', 'hook']);
  });

  it('clear() removes all anchors', () => {
    const reg = createAnchorRegistry();
    reg.set(anchor({ id: 'hook' }));
    reg.clear();
    expect(reg.all()).toEqual([]);
    expect(reg.get('hook')).toBeUndefined();
  });

  it('hitTest() finds a point inside an anchor radius', () => {
    const reg = createAnchorRegistry();
    reg.set(anchor({ id: 'hook', x: 100, y: 100, r: 20 }));
    expect(reg.hitTest(105, 105)?.id).toBe('hook');
  });

  it('hitTest() returns undefined outside radius', () => {
    const reg = createAnchorRegistry();
    reg.set(anchor({ id: 'hook', x: 100, y: 100, r: 20 }));
    expect(reg.hitTest(500, 500)).toBeUndefined();
  });

  it('hitTest() respects an extra padding argument', () => {
    const reg = createAnchorRegistry();
    reg.set(anchor({ id: 'bolt0', x: 0, y: 0, r: 10 }));
    expect(reg.hitTest(30, 0)).toBeUndefined();
    expect(reg.hitTest(30, 0, 25)).toBeDefined();
  });

  it('hitTest() ignores inactive anchors', () => {
    const reg = createAnchorRegistry();
    reg.set(anchor({ id: 'hook', x: 0, y: 0, r: 50, active: false }));
    expect(reg.hitTest(0, 0)).toBeUndefined();
  });

  it('hitTest() returns the most-recently-registered anchor on overlap (topmost)', () => {
    const reg = createAnchorRegistry();
    reg.set(anchor({ id: 'hook', x: 0, y: 0, r: 50 }));
    reg.set(anchor({ id: 'beam', x: 0, y: 0, r: 50 }));
    expect(reg.hitTest(0, 0)?.id).toBe('beam');
  });
});
