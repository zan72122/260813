import { ctxOf, makeCanvas } from './draw';
import { SECRET_FRAMES, drawSecret } from './stamps';
import type { StampPlacement } from './relief';

/** One frame of the secret picture, as a fraction of the full card. */
const FRAME_W = 256;
const FRAME_H = 366;

/** Secret picture size relative to the frame width. */
const SECRET_SIZE = 0.13;

/**
 * A four-frame kinegram, packed 2x2.
 *
 * Real kinegrams show a different image at each viewing angle; tilting the card
 * left to right steps through these frames, so the secret picture plays like a
 * flip-book. It is drawn at the positions the child stamped, so the hidden
 * picture appears exactly where they pressed.
 */
export function renderKinegram(motif: number, stamps: StampPlacement[]): HTMLCanvasElement {
  const atlas = makeCanvas(FRAME_W * 2, FRAME_H * 2);
  const actx = ctxOf(atlas);
  actx.fillStyle = '#000';
  actx.fillRect(0, 0, atlas.width, atlas.height);

  // Frames are drawn on a transparent scratch canvas first: drawSecret carves
  // eyes with destination-out, which needs real transparency to cut through.
  const scratch = makeCanvas(FRAME_W, FRAME_H);
  const sctx = ctxOf(scratch);
  const s = SECRET_SIZE * FRAME_W;

  for (let f = 0; f < SECRET_FRAMES; f++) {
    sctx.clearRect(0, 0, FRAME_W, FRAME_H);
    sctx.fillStyle = '#fff';
    sctx.strokeStyle = '#fff';
    for (const st of stamps) {
      drawSecret(sctx, motif, st.u * FRAME_W, st.v * FRAME_H, s, f);
    }
    const qx = (f % 2) * FRAME_W;
    const qy = Math.floor(f / 2) * FRAME_H;
    actx.drawImage(scratch, qx, qy);
  }

  return atlas;
}
