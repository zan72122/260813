import { describe, expect, it } from 'vitest';
import type { HintGesture } from '../hints';
import {
  backArrowIcon,
  buildHintPictogram,
  buildSteamGaugeSvg,
  climbingCraneIcon,
  differentBeamIcon,
  glowingRivetIcon,
  leverIcon,
  pauseIcon,
  playIcon,
  sameBeamIcon,
  speakerIcon,
} from '../pictograms';

const ALL_GESTURES: HintGesture[] = ['drag-down', 'drag-up', 'drag-to', 'tap', 'tap-hold', 'swipe-right'];

function hasNonEmptyPathD(svg: string): boolean {
  return /d="[^"]+"/u.test(svg);
}

describe('buildHintPictogram', () => {
  it('returns a valid svg with a hand shape for every gesture', () => {
    for (const gesture of ALL_GESTURES) {
      const svg = buildHintPictogram(gesture);
      expect(svg).toContain('<svg');
      expect(svg).toContain('hint-hand');
      expect(hasNonEmptyPathD(svg)).toBe(true);
    }
  });

  it('includes a directional arrow group for drag/swipe gestures', () => {
    for (const gesture of ['drag-down', 'drag-up', 'drag-to', 'swipe-right'] as const) {
      expect(buildHintPictogram(gesture)).toContain('hint-arrow-group');
    }
  });

  it('includes a pulse ring (no arrow) for tap gestures', () => {
    for (const gesture of ['tap', 'tap-hold'] as const) {
      const svg = buildHintPictogram(gesture);
      expect(svg).toContain('hint-pulse-ring');
      expect(svg).not.toContain('hint-arrow-group');
    }
  });

  it('rotates the arrow differently per drag direction', () => {
    const down = buildHintPictogram('drag-down');
    const up = buildHintPictogram('drag-up');
    const right = buildHintPictogram('swipe-right');
    expect(down).not.toBe(up);
    expect(down).not.toBe(right);
    expect(down).toContain('rotate(90');
    expect(up).toContain('rotate(-90');
    expect(right).toContain('rotate(0');
  });
});

describe('complete-menu pictograms', () => {
  it('each returns distinct, non-empty svg markup', () => {
    const icons = [sameBeamIcon(), differentBeamIcon(), glowingRivetIcon(), climbingCraneIcon()];
    for (const icon of icons) {
      expect(icon).toContain('<svg');
      expect(icon.length).toBeGreaterThan(20);
    }
    expect(new Set(icons).size).toBe(icons.length);
  });
});

describe('small control icons', () => {
  it('speakerIcon differs when muted vs unmuted', () => {
    const on = speakerIcon(false);
    const off = speakerIcon(true);
    expect(on).not.toBe(off);
    expect(on).toContain('<svg');
    expect(off).toContain('<svg');
  });

  it('pause/play/back/lever icons all produce valid non-empty svg', () => {
    for (const svg of [pauseIcon(), playIcon(), backArrowIcon(), leverIcon()]) {
      expect(svg).toContain('<svg');
      expect(svg.length).toBeGreaterThan(10);
    }
  });

  it('the steam gauge has a face, ticks, and a needle', () => {
    const svg = buildSteamGaugeSvg();
    expect(svg).toContain('gauge-face');
    expect(svg).toContain('gauge-needle');
    expect(svg).toContain('gauge-tick');
  });
});
