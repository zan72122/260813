/**
 * Original animal faces, drawn with Canvas2D inside a 100x100 box.
 *
 * Rules that keep them readable on a 4.7" phone held by a 4 year old:
 *  - one silhouette idea per animal (ear shape does the work)
 *  - stroke width 7 of 100, i.e. 7% of the biscuit, never thinner
 *  - no detail smaller than 4 units
 *  - eyes are solid dots, never outlines
 */

export const ANIMAL_IDS = ['cat', 'dog', 'rabbit', 'elephant', 'giraffe', 'panda', 'bear', 'lion'];

const TAU = Math.PI * 2;

function ell(ctx, x, y, rx, ry, rot = 0) {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, rot, 0, TAU);
}

function dot(ctx, x, y, r) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}

function smile(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x - w, y);
  ctx.quadraticCurveTo(x - w * 0.5, y + h, x, y);
  ctx.quadraticCurveTo(x + w * 0.5, y + h, x + w, y);
  ctx.stroke();
}

function noseTri(ctx, x, y, w, h) {
  ctx.beginPath();
  ctx.moveTo(x - w, y - h * 0.5);
  ctx.lineTo(x + w, y - h * 0.5);
  ctx.lineTo(x, y + h * 0.7);
  ctx.closePath();
  ctx.fill();
}

const draw = {
  cat(ctx, c) {
    // ears first so the head outline sits on top
    ctx.beginPath();
    ctx.moveTo(29, 44);
    ctx.lineTo(24, 12);
    ctx.lineTo(51, 28);
    ctx.moveTo(71, 44);
    ctx.lineTo(76, 12);
    ctx.lineTo(49, 28);
    ctx.stroke();
    ell(ctx, 50, 56, 28, 26);
    ctx.stroke();
    dot(ctx, 39, 53, 4.6);
    dot(ctx, 61, 53, 4.6);
    ctx.fillStyle = c.line;
    noseTri(ctx, 50, 63, 5, 6);
    smile(ctx, 50, 68, 10, 9);
    // whiskers
    ctx.beginPath();
    ctx.moveTo(28, 60);
    ctx.lineTo(8, 55);
    ctx.moveTo(28, 68);
    ctx.lineTo(9, 72);
    ctx.moveTo(72, 60);
    ctx.lineTo(92, 55);
    ctx.moveTo(72, 68);
    ctx.lineTo(91, 72);
    ctx.stroke();
  },

  dog(ctx, c) {
    // long floppy ears — outlined, so the face does not turn into one dark blob
    ell(ctx, 21, 56, 11, 22, -0.18);
    ctx.fillStyle = c.bg;
    ctx.fill();
    ctx.stroke();
    ell(ctx, 79, 56, 11, 22, 0.18);
    ctx.fill();
    ctx.stroke();
    ell(ctx, 50, 54, 26, 25);
    ctx.fillStyle = c.bg;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.line;
    dot(ctx, 40, 50, 4.6);
    dot(ctx, 60, 50, 4.6);
    ell(ctx, 50, 62, 7, 5.5);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(50, 68);
    ctx.lineTo(50, 72);
    ctx.stroke();
    smile(ctx, 50, 72, 10, 9);
  },

  rabbit(ctx, c) {
    ell(ctx, 38, 24, 9, 23, -0.16);
    ctx.fillStyle = c.bg;
    ctx.fill();
    ctx.stroke();
    ell(ctx, 62, 24, 9, 23, 0.16);
    ctx.fill();
    ctx.stroke();
    ell(ctx, 50, 64, 26, 23);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.line;
    dot(ctx, 40, 62, 4.6);
    dot(ctx, 60, 62, 4.6);
    noseTri(ctx, 50, 70, 5, 6);
    // buck teeth
    ctx.beginPath();
    ctx.moveTo(50, 75);
    ctx.lineTo(50, 82);
    ctx.moveTo(44, 78);
    ctx.lineTo(56, 78);
    ctx.stroke();
  },

  elephant(ctx, c) {
    ell(ctx, 18, 46, 16, 18);
    ctx.fillStyle = c.bg;
    ctx.fill();
    ctx.stroke();
    ell(ctx, 82, 46, 16, 18);
    ctx.fill();
    ctx.stroke();
    ell(ctx, 50, 48, 23, 23);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.line;
    dot(ctx, 41, 43, 4.6);
    dot(ctx, 59, 43, 4.6);
    // trunk
    ctx.save();
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(50, 62);
    ctx.bezierCurveTo(50, 78, 62, 80, 62, 90);
    ctx.stroke();
    ctx.restore();
    // tusks
    ctx.beginPath();
    ctx.moveTo(38, 66);
    ctx.lineTo(32, 76);
    ctx.moveTo(64, 66);
    ctx.lineTo(70, 74);
    ctx.stroke();
  },

  giraffe(ctx, c) {
    // horns
    ctx.beginPath();
    ctx.moveTo(41, 40);
    ctx.lineTo(35, 20);
    ctx.moveTo(59, 40);
    ctx.lineTo(65, 20);
    ctx.stroke();
    ctx.fillStyle = c.line;
    dot(ctx, 34, 17, 6);
    dot(ctx, 66, 17, 6);
    // side ears
    ell(ctx, 26, 50, 10, 6, -0.25);
    ctx.fillStyle = c.bg;
    ctx.fill();
    ctx.stroke();
    ell(ctx, 74, 50, 10, 6, 0.25);
    ctx.fill();
    ctx.stroke();
    // long head + neck
    ctx.beginPath();
    ctx.moveTo(38, 46);
    ctx.lineTo(38, 74);
    ctx.quadraticCurveTo(38, 88, 50, 88);
    ctx.quadraticCurveTo(62, 88, 62, 74);
    ctx.lineTo(62, 46);
    ctx.quadraticCurveTo(62, 38, 50, 38);
    ctx.quadraticCurveTo(38, 38, 38, 46);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.line;
    dot(ctx, 44, 52, 4.4);
    dot(ctx, 56, 52, 4.4);
    dot(ctx, 46, 76, 3.2);
    dot(ctx, 54, 76, 3.2);
    // two big spots so the pattern reads at thumbnail size
    ell(ctx, 30, 66, 6.5, 6);
    ctx.fill();
    ell(ctx, 71, 68, 6.5, 6);
    ctx.fill();
  },

  panda(ctx, c) {
    ctx.fillStyle = c.line;
    dot(ctx, 26, 30, 12);
    dot(ctx, 74, 30, 12);
    ell(ctx, 50, 56, 28, 26);
    ctx.fillStyle = c.bg;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.line;
    ell(ctx, 37, 52, 10, 12, -0.35);
    ctx.fill();
    ell(ctx, 63, 52, 10, 12, 0.35);
    ctx.fill();
    ctx.fillStyle = c.bg;
    dot(ctx, 38, 51, 4);
    dot(ctx, 62, 51, 4);
    ctx.fillStyle = c.line;
    ell(ctx, 50, 66, 7, 5.5);
    ctx.fill();
    smile(ctx, 50, 74, 9, 8);
  },

  bear(ctx, c) {
    ell(ctx, 27, 28, 11, 11);
    ctx.fillStyle = c.bg;
    ctx.fill();
    ctx.stroke();
    ell(ctx, 73, 28, 11, 11);
    ctx.fill();
    ctx.stroke();
    ell(ctx, 50, 55, 27, 25);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.line;
    dot(ctx, 39, 49, 4.6);
    dot(ctx, 61, 49, 4.6);
    ell(ctx, 50, 66, 15, 11);
    ctx.fillStyle = c.bg;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.line;
    ell(ctx, 50, 61, 7, 5);
    ctx.fill();
    smile(ctx, 50, 68, 8, 8);
  },

  lion(ctx, c) {
    // mane: a ring of round bumps
    ctx.fillStyle = c.bg;
    ctx.beginPath();
    for (let i = 0; i < 11; i++) {
      const a = (i / 11) * TAU - Math.PI / 2;
      const x = 50 + Math.cos(a) * 30;
      const y = 53 + Math.sin(a) * 30;
      ctx.moveTo(x + 10, y);
      ctx.arc(x, y, 10, 0, TAU);
    }
    ctx.fill();
    ctx.stroke();
    ell(ctx, 50, 53, 22, 21);
    ctx.fillStyle = c.bg;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = c.line;
    dot(ctx, 42, 49, 4.4);
    dot(ctx, 58, 49, 4.4);
    noseTri(ctx, 50, 60, 5.5, 6);
    smile(ctx, 50, 65, 8, 8);
  },
};

/**
 * Draw one animal face centred in a `size` x `size` box whose top-left corner
 * is the current canvas origin.
 */
export function drawAnimal(ctx, id, { size = 256, line = '#4b2a12', bg = '#f2ddb2', width = 7 } = {}) {
  const fn = draw[id] || draw.cat;
  ctx.save();
  ctx.scale(size / 100, size / 100);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.lineWidth = width;
  ctx.strokeStyle = line;
  ctx.fillStyle = line;
  fn(ctx, { line, bg });
  ctx.restore();
}
