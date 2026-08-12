import { describe, expect, it } from 'vitest';

import { LeverDragController } from '../../../src/ui/leverController.ts';

describe('LeverDragController (drag mapping -> intent value round-trip)', () => {
  it('starts at the given initial value and is not dragging', () => {
    const lever = new LeverDragController(200, 0.4);
    expect(lever.getValue()).toBeCloseTo(0.4, 9);
    expect(lever.isDragging).toBe(false);
  });

  it('dragging up from the anchor increases the value proportionally to pixelRange', () => {
    const lever = new LeverDragController(200, 0);
    lever.begin(500);
    const value = lever.move(400); // dragged up 100px of a 200px range
    expect(value).toBeCloseTo(0.5, 9);
    expect(lever.getValue()).toBeCloseTo(0.5, 9);
    expect(lever.isDragging).toBe(true);
  });

  it('dragging down decreases the value and clamps at 0', () => {
    const lever = new LeverDragController(200, 0.2);
    lever.begin(300);
    const value = lever.move(1000); // dragged far down
    expect(value).toBe(0);
  });

  it('clamps at 1 when dragged far past the top of the range', () => {
    const lever = new LeverDragController(200, 0);
    lever.begin(500);
    const value = lever.move(-500);
    expect(value).toBe(1);
  });

  it('move() is a no-op (returns the held value) when not dragging', () => {
    const lever = new LeverDragController(200, 0.3);
    expect(lever.move(0)).toBeCloseTo(0.3, 9);
  });

  it('end() stops dragging but retains the last dragged value ("stays where the finger left it")', () => {
    const lever = new LeverDragController(200, 0);
    lever.begin(500);
    lever.move(450); // +0.25
    lever.end();
    expect(lever.isDragging).toBe(false);
    expect(lever.getValue()).toBeCloseTo(0.25, 9);
  });

  it('setValue mirrors an external (snapshot) value only while not dragging', () => {
    const lever = new LeverDragController(200, 0);
    lever.setValue(0.7);
    expect(lever.getValue()).toBeCloseTo(0.7, 9);

    lever.begin(500);
    lever.setValue(0.9); // ignored mid-drag
    expect(lever.getValue()).toBeCloseTo(0.7, 9);

    lever.move(400); // dragged up 100px -> +0.5 from the drag-start value (0.7)
    expect(lever.getValue()).toBe(1); // clamped
  });

  it('a full round trip (begin -> move -> end -> setValue) never produces NaN or out-of-range values', () => {
    const lever = new LeverDragController(150, 0.5);
    lever.begin(200);
    for (const y of [220, 260, 180, 900, -900, 200]) {
      const value = lever.move(y);
      expect(Number.isFinite(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
    lever.end();
    lever.setValue(0.42);
    expect(lever.getValue()).toBeCloseTo(0.42, 9);
  });
});
