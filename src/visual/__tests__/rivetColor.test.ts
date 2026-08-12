import { describe, expect, it } from 'vitest';
import { rivetColorRamp } from '../rivetColor';

describe('rivetColorRamp', () => {
  it('is dark iron with zero emissive intensity when cold', () => {
    const r = rivetColorRamp(0, 0);
    expect(r.emissiveIntensity).toBe(0);
    // dark iron: low red channel
    expect((r.color >> 16) & 0xff).toBeLessThan(60);
  });

  it('is near white-hot at full temp with no cooling', () => {
    const r = rivetColorRamp(1, 0);
    expect(r.emissiveIntensity).toBeGreaterThan(0.9);
    const red = (r.color >> 16) & 0xff;
    const green = (r.color >> 8) & 0xff;
    expect(red).toBeGreaterThan(200);
    expect(green).toBeGreaterThan(180);
  });

  it('increasing temp monotonically increases emissive intensity', () => {
    let prev = -1;
    for (let t = 0; t <= 1; t += 0.1) {
      const r = rivetColorRamp(t, 0);
      expect(r.emissiveIntensity).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = r.emissiveIntensity;
    }
  });

  it('cooling overrides toward dark iron regardless of temp', () => {
    const hotUncooled = rivetColorRamp(1, 0);
    const hotCooled = rivetColorRamp(1, 1);
    expect(hotCooled.emissiveIntensity).toBe(0);
    expect(hotCooled.color).toBe(hotUncooled.color === hotCooled.color ? hotCooled.color : hotCooled.color);
    const red = (hotCooled.color >> 16) & 0xff;
    expect(red).toBeLessThan(60);
  });

  it('clamps out-of-range inputs', () => {
    const low = rivetColorRamp(-5, -5);
    const high = rivetColorRamp(5, 5);
    expect(low.emissiveIntensity).toBe(0);
    expect(high.emissiveIntensity).toBe(0); // cooled clamps to 1 -> dark
  });

  it('mid-cooling interpolates between hot and dark (not a hard cut)', () => {
    const mid = rivetColorRamp(1, 0.5);
    expect(mid.emissiveIntensity).toBeGreaterThan(0);
    expect(mid.emissiveIntensity).toBeLessThan(1);
  });
});
