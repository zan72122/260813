import { describe, expect, it } from 'vitest';
import { orientationClassName, selectOrientation } from '../layout';

describe('selectOrientation', () => {
  it('is landscape when width >= height', () => {
    expect(selectOrientation(844, 390)).toBe('landscape');
    expect(selectOrientation(500, 500)).toBe('landscape');
  });

  it('is portrait when height > width', () => {
    expect(selectOrientation(390, 844)).toBe('portrait');
  });
});

describe('orientationClassName', () => {
  it('produces a stable class name per orientation', () => {
    expect(orientationClassName('portrait')).toBe('orientation-portrait');
    expect(orientationClassName('landscape')).toBe('orientation-landscape');
  });
});
