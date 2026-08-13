import { TAU } from '../core/math';
import { Ctx2D, heartPath, starPath } from './draw';

/**
 * The three press heads. A stamp does three jobs at once: it cuts the micro
 * relief, it brightens the foil where it sits, and its secret picture is what
 * swims into view when the finished card is tilted.
 */
export interface StampMotif {
  id: string;
  name: string;
  emoji: string;
}

export const STAMP_MOTIFS: StampMotif[] = [
  { id: 'kira', name: 'きらきら', emoji: '⭐️' },
  { id: 'nami', name: 'なみなみ', emoji: '🌊' },
  { id: 'heart', name: 'はーと', emoji: '💖' },
];

export const SECRET_FRAMES = 4;

/** Outline of the motif. Caller sets fillStyle. */
export function drawMotifShape(ctx: Ctx2D, motif: number, cx: number, cy: number, s: number): void {
  if (motif === 0) {
    starPath(ctx, cx, cy, s, s * 0.42, 5, -Math.PI / 2);
    ctx.fill();
  } else if (motif === 1) {
    ctx.beginPath();
    for (let k = -1; k <= 1; k++) {
      const y0 = cy + k * s * 0.5;
      ctx.moveTo(cx - s, y0);
      for (let x = -s; x <= s; x += 4) {
        ctx.lineTo(cx + x, y0 + Math.sin((x / s) * Math.PI * 1.5) * s * 0.18);
      }
    }
    ctx.lineWidth = s * 0.22;
    ctx.lineCap = 'round';
    ctx.strokeStyle = ctx.fillStyle as string;
    ctx.stroke();
  } else {
    heartPath(ctx, cx, cy, s * 0.9);
    ctx.fill();
  }
}

/**
 * The engraved micro-relief the press leaves behind. Drawn additively into the
 * height channel, so overlapping stamps deepen each other.
 */
export function drawMotifRelief(
  ctx: Ctx2D,
  motif: number,
  cx: number,
  cy: number,
  s: number,
): void {
  ctx.save();
  ctx.lineCap = 'round';

  if (motif === 0) {
    // radiating burst
    const spokes = 40;
    ctx.lineWidth = 3;
    for (let i = 0; i < spokes; i++) {
      const a = (i / spokes) * TAU;
      ctx.globalAlpha = 0.28 + 0.24 * Math.abs(Math.sin(a * 5));
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * s * 0.18, cy + Math.sin(a) * s * 0.18);
      ctx.lineTo(cx + Math.cos(a) * s * 1.55, cy + Math.sin(a) * s * 1.55);
      ctx.stroke();
    }
  } else if (motif === 1) {
    // concentric wavy rings
    ctx.lineWidth = 3.5;
    for (let r = s * 0.2; r < s * 1.6; r += 9) {
      ctx.globalAlpha = 0.24 + 0.22 * Math.sin(r * 0.09);
      ctx.beginPath();
      for (let t = 0; t <= TAU + 0.06; t += 0.06) {
        const rr = r + Math.sin(t * 5 + r * 0.05) * 4;
        const x = cx + Math.cos(t) * rr;
        const y = cy + Math.sin(t) * rr;
        if (t === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  } else {
    // nested hearts
    ctx.lineWidth = 3.5;
    for (let k = 1; k <= 9; k++) {
      ctx.globalAlpha = 0.3 - k * 0.015;
      heartPath(ctx, cx, cy, s * 0.22 * k);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * The secret picture, posed for one frame of the kinegram. Tilting the card
 * left to right steps through the frames, so it plays like a flip-book.
 * Caller sets fillStyle/strokeStyle (a mask, so colour is just white).
 */
export function drawSecret(
  ctx: Ctx2D,
  motif: number,
  cx: number,
  cy: number,
  s: number,
  frame: number,
): void {
  const f = frame % SECRET_FRAMES;
  ctx.save();
  ctx.translate(cx, cy);

  if (motif === 0) {
    // a little star that spins and winks
    ctx.rotate((f * Math.PI) / 10);
    const pulse = 1 + 0.1 * Math.sin((f / SECRET_FRAMES) * TAU);
    starPath(ctx, 0, 0, s * pulse, s * 0.42 * pulse, 5, -Math.PI / 2);
    ctx.fill();

    ctx.globalCompositeOperation = 'destination-out';
    const eyeY = -s * 0.04;
    const winking = f === 1 || f === 2;
    ctx.beginPath();
    ctx.ellipse(-s * 0.24, eyeY, s * 0.09, winking ? s * 0.03 : s * 0.12, 0, 0, TAU);
    ctx.ellipse(s * 0.24, eyeY, s * 0.09, s * 0.12, 0, 0, TAU);
    ctx.fill();
    ctx.lineWidth = s * 0.07;
    ctx.strokeStyle = '#000';
    ctx.beginPath();
    ctx.arc(0, s * 0.16, s * 0.2, Math.PI * 0.15, Math.PI * 0.85);
    ctx.stroke();
  } else if (motif === 1) {
    // a fish wiggling through
    const swim = Math.sin((f / SECRET_FRAMES) * TAU);
    ctx.translate(swim * s * 0.16, 0);
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.78, s * 0.46, 0, 0, TAU);
    ctx.fill();
    // tail flicks the other way
    ctx.beginPath();
    ctx.moveTo(-s * 0.6, 0);
    ctx.lineTo(-s * 1.25, -s * 0.42 - swim * s * 0.18);
    ctx.lineTo(-s * 1.25, s * 0.42 - swim * s * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.arc(s * 0.36, -s * 0.1, s * 0.11, 0, TAU);
    ctx.fill();
  } else {
    // a heart with a heartbeat
    const beat = [1, 1.18, 1.02, 0.92][f];
    heartPath(ctx, 0, 0, s * 0.95 * beat);
    ctx.fill();
    if (f === 1 || f === 2) {
      for (const [dx, dy] of [
        [-1.25, -0.7],
        [1.25, -0.7],
        [0, -1.25],
      ] as [number, number][]) {
        starPath(ctx, dx * s, dy * s, s * 0.2, s * 0.08, 4, 0);
        ctx.fill();
      }
    }
  }

  ctx.restore();
}
