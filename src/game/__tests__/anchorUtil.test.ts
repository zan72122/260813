import { describe, expect, it } from 'vitest';
import { createAnchorRegistry } from '../../contracts/anchors';
import { anchorAllows, withinAnchor } from '../anchorUtil';

describe('withinAnchor', () => {
  it('is true inside the padded radius and false outside it', () => {
    const a = { id: 'forge' as const, x: 100, y: 100, r: 10, active: true };
    expect(withinAnchor(105, 100, a, 0)).toBe(true);
    expect(withinAnchor(200, 100, a, 0)).toBe(false);
    expect(withinAnchor(140, 100, a, 36)).toBe(true);
  });
});

describe('anchorAllows', () => {
  it('allows the verb when the anchor was never published (soft-lock prevention)', () => {
    const anchors = createAnchorRegistry();
    expect(anchorAllows(anchors, 'forge', 9999, 9999)).toBe(true);
  });

  it('blocks when the anchor is published but explicitly inactive', () => {
    const anchors = createAnchorRegistry();
    anchors.set({ id: 'forge', x: 0, y: 0, r: 20, active: false });
    expect(anchorAllows(anchors, 'forge', 0, 0)).toBe(false);
  });

  it('respects the padded radius when the anchor is active', () => {
    const anchors = createAnchorRegistry();
    anchors.set({ id: 'forge', x: 0, y: 0, r: 10, active: true });
    expect(anchorAllows(anchors, 'forge', 0, 0, 36)).toBe(true);
    expect(anchorAllows(anchors, 'forge', 1000, 1000, 36)).toBe(false);
  });
});
