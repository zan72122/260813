import { describe, expect, it } from 'vitest';
import { classifyGesture, detectWindowedSwipe } from '../gestures';
import type { GesturePoint } from '../gestures';

describe('classifyGesture', () => {
  it('classifies a short, small-movement touch as a tap', () => {
    expect(classifyGesture([{ x: 0, y: 0, t: 0 }, { x: 3, y: 4, t: 100 }])).toEqual({ kind: 'tap' });
    // Boundary values are inclusive per the age-4 tuned thresholds.
    expect(classifyGesture([{ x: 0, y: 0, t: 0 }, { x: 14, y: 0, t: 350 }])).toEqual({ kind: 'tap' });
  });

  it('classifies a fast flick as a swipe with the dominant axis direction', () => {
    expect(classifyGesture([{ x: 0, y: 0, t: 0 }, { x: 0, y: -100, t: 200 }])).toEqual({
      kind: 'swipe',
      dir: 'up',
    });
    expect(classifyGesture([{ x: 0, y: 0, t: 0 }, { x: 100, y: 0, t: 200 }])).toEqual({
      kind: 'swipe',
      dir: 'right',
    });
    expect(classifyGesture([{ x: 0, y: 0, t: 0 }, { x: -100, y: 10, t: 200 }])).toEqual({
      kind: 'swipe',
      dir: 'left',
    });
    expect(classifyGesture([{ x: 0, y: 0, t: 0 }, { x: 0, y: 100, t: 200 }])).toEqual({
      kind: 'swipe',
      dir: 'down',
    });
  });

  it('classifies a slow, long movement as a plain drag (neither tap nor swipe)', () => {
    // 90px over 3000ms (0.03px/ms): every 600ms window covers well under 40px.
    const history: GesturePoint[] = [];
    for (let t = 0; t <= 3000; t += 300) history.push({ x: (t / 3000) * 90, y: 0, t });
    expect(classifyGesture(history)).toEqual({ kind: 'drag' });
  });

  it('a long-duration-but-small-movement hold is not a tap and not a swipe', () => {
    expect(classifyGesture([{ x: 0, y: 0, t: 0 }, { x: 2, y: 0, t: 5000 }])).toEqual({ kind: 'drag' });
  });

  it('a real down+up pair with no intermediate samples still classifies correctly', () => {
    // index.ts always includes at least the down and up samples.
    expect(classifyGesture([{ x: 0, y: 0, t: 0 }, { x: 45, y: 0, t: 150 }])).toEqual({
      kind: 'swipe',
      dir: 'right',
    });
  });
});

describe('detectWindowedSwipe — hitchy frame timing (G1)', () => {
  it('registers a rightward swipe when a decisive burst is sandwiched between large dt gaps', () => {
    // Simulates a main-thread hitch: pointermove events are still timestamped
    // accurately by the browser (real PointerEvent.timeStamp), but arrive in
    // clumps because rendering/JS stalled for stretches of the gesture. The
    // first and last legs sit nearly still while a 45px/80ms burst happens in
    // the middle — a whole-gesture average-velocity classifier would dilute
    // this into well below any reasonable swipe threshold, but the decisive
    // window (45px within 600ms) must still register as swipe-right.
    const history: GesturePoint[] = [
      { x: 0, y: 0, t: 0 }, // down
      { x: 1, y: 0, t: 400 }, // long hitch/stall — barely moved
      { x: 46, y: 0, t: 480 }, // decisive 45px burst in 80ms
      { x: 47, y: 0, t: 900 }, // another long stall before pointerup
    ];
    expect(detectWindowedSwipe(history)).toBe('right');
    expect(classifyGesture(history)).toEqual({ kind: 'swipe', dir: 'right' });
  });

  it('registers swipe-right even when the qualifying window is the tail of a long, jank-spread gesture', () => {
    const history: GesturePoint[] = [
      { x: 0, y: 0, t: 0 },
      { x: 2, y: 0, t: 900 }, // huge hitch: 900ms with almost no movement
      { x: 4, y: 0, t: 1800 }, // another huge hitch
      { x: 44, y: 0, t: 2200 }, // 40px in 400ms — qualifies within the window
    ];
    // Whole-gesture average velocity here is 44px / 2200ms = 0.02px/ms — far
    // below any per-gesture threshold. The windowed scan still finds it.
    expect(detectWindowedSwipe(history)).toBe('right');
  });

  it('does not fabricate a swipe out of noise: small jitters under the threshold stay a drag/tap', () => {
    const history: GesturePoint[] = [
      { x: 0, y: 0, t: 0 },
      { x: 5, y: 0, t: 500 }, // big hitch gap, tiny movement
      { x: 10, y: 0, t: 5000 }, // net movement stays under 40px in any window
    ];
    expect(detectWindowedSwipe(history)).toBeNull();
  });
});
