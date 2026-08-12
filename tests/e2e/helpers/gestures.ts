// tests/e2e/helpers/gestures.ts
// Synthesizes real pointer events against canvas#scene via page.mouse
// (Chromium dispatches PointerEvent with pointerType 'mouse' for these, which
// src/input/pointer.ts handles the same as touch — it does not filter by
// pointerType). Coordinates use normalized 0..1 canvas-relative inputs to
// match the ActionIntent 'tap' convention in docs/CONTRACTS.md.

import type { Page } from '@playwright/test';

async function canvasBox(page: Page): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await page.locator('canvas#scene').boundingBox();
  if (!box) throw new Error('canvas#scene has no bounding box (not visible?)');
  return box;
}

/** Single tap at normalized canvas coordinates (0..1, 0..1). */
export async function synthesizeTap(page: Page, xNorm: number, yNorm: number): Promise<void> {
  const box = await canvasBox(page);
  const x = box.x + box.width * xNorm;
  const y = box.y + box.height * yNorm;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(40);
  await page.mouse.up();
}

/** Holds a press at normalized canvas coordinates for durationMs (short long-press). */
export async function synthesizeLongPress(
  page: Page,
  xNorm: number,
  yNorm: number,
  durationMs = 500,
): Promise<void> {
  const box = await canvasBox(page);
  const x = box.x + box.width * xNorm;
  const y = box.y + box.height * yNorm;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.waitForTimeout(durationMs);
  await page.mouse.up();
}

export interface CircularDragOptions {
  /** Center of the circle, normalized canvas coordinates (0..1). */
  centerXNorm: number;
  centerYNorm: number;
  /** Circle radius in CSS px. Defaults to ~18% of the shorter canvas dimension. */
  radiusPx?: number;
  /** Number of full revolutions to sweep. */
  turns?: number;
  /** true = clockwise (matches valve-rotate's + convention), false = counter-clockwise. */
  clockwise?: boolean;
  /** Angular resolution: samples per full revolution. */
  stepsPerTurn?: number;
  /** Delay between successive pointer moves, ms. */
  stepDelayMs?: number;
  /** Releases the pointer at the end when true (default). Set false to keep holding. */
  release?: boolean;
}

/**
 * Drags a synthetic single pointer around a circle on the canvas, generating
 * a real sequence of pointermove events for src/input's circular-gesture
 * recognizer to consume (A2 clockwise recognition / A3 stop-and-freeze).
 */
export async function synthesizeCircularDrag(page: Page, opts: CircularDragOptions): Promise<void> {
  const box = await canvasBox(page);
  const cx = box.x + box.width * opts.centerXNorm;
  const cy = box.y + box.height * opts.centerYNorm;
  const radius = opts.radiusPx ?? Math.min(box.width, box.height) * 0.18;
  const turns = opts.turns ?? 1;
  const stepsPerTurn = opts.stepsPerTurn ?? 48;
  const steps = Math.max(1, Math.round(stepsPerTurn * turns));
  const dir = (opts.clockwise ?? true) ? 1 : -1;
  const stepDelayMs = opts.stepDelayMs ?? 12;

  await page.mouse.move(cx + radius, cy);
  await page.mouse.down();
  await page.waitForTimeout(stepDelayMs);

  for (let i = 1; i <= steps; i++) {
    const theta = dir * (i / stepsPerTurn) * Math.PI * 2;
    const x = cx + radius * Math.cos(theta);
    const y = cy + radius * Math.sin(theta);
    await page.mouse.move(x, y);
    await page.waitForTimeout(stepDelayMs);
  }

  if (opts.release ?? true) {
    await page.mouse.up();
  }
}

/** Releases a pointer previously left down by synthesizeCircularDrag({ release: false }). */
export async function releasePointer(page: Page): Promise<void> {
  await page.mouse.up();
}
