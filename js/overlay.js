'use strict';
/* overlay.js — 2D canvas layer: sparkles, guide hand, craftsman, buttons.
   Particles with space 'w' live in world coordinates and are projected
   each frame, so they stay glued to the artwork while the camera moves. */
const FX = (() => {
  const parts = [];

  function spark(x, y, opts) {
    opts = opts || {};
    const n = opts.n || 1;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = (opts.speed || 0.5) * (0.4 + Math.random() * 0.9);
      parts.push({
        x, y,
        vx: Math.cos(a) * sp + (opts.vx || 0),
        vy: Math.sin(a) * sp + (opts.vy || 0),
        life: 0, maxLife: (opts.life || 0.9) * (0.7 + Math.random() * 0.6),
        size: (opts.size || 10) * (0.6 + Math.random() * 0.8),
        hue: opts.hue !== undefined ? opts.hue : Math.random() * 360,
        space: opts.space || 'w',
        drag: opts.drag !== undefined ? opts.drag : 2.2,
        grav: opts.grav || 0,
        white: opts.white || 0,
      });
    }
  }

  function update(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life += dt;
      if (p.life >= p.maxLife) { parts.splice(i, 1); continue; }
      const k = Math.exp(-dt * p.drag);
      p.vx *= k; p.vy *= k;
      p.vy += p.grav * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  function drawStar4(ctx, x, y, r, rot, fill) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot);
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = i / 8 * Math.PI * 2;
      const rad = i % 2 === 0 ? r : r * 0.28;
      const px = Math.cos(a) * rad, py = Math.sin(a) * rad;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.restore();
  }

  /* w2s: (wx,wy) -> [sx,sy]; wScale: world units -> px */
  function draw(ctx, w2s, wScale) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of parts) {
      const t = p.life / p.maxLife;
      const a = t < 0.2 ? t / 0.2 : 1 - (t - 0.2) / 0.8;
      let sx, sy, sz;
      if (p.space === 'w') {
        const s = w2s(p.x, p.y);
        sx = s[0]; sy = s[1]; sz = p.size * wScale * 0.01;
      } else { sx = p.x; sy = p.y; sz = p.size; }
      const col = p.white
        ? `rgba(255,250,240,${(a * 0.85).toFixed(3)})`
        : `hsla(${p.hue.toFixed(0)},70%,80%,${(a * 0.9).toFixed(3)})`;
      drawStar4(ctx, sx, sy, sz * (0.7 + 0.3 * Math.sin(p.life * 9)), p.life * 2.0, col);
    }
    ctx.restore();
  }

  /* soft translucent guide hand, pointing finger up-left */
  function hand(ctx, x, y, s, alpha) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(255,240,222,0.92)';
    ctx.strokeStyle = 'rgba(105,70,45,0.6)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();                      // fist / palm
    ctx.ellipse(10, 36, 16, 19, -0.30, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();                      // index finger pointing to (0,0)
    ctx.ellipse(2, 12, 6.5, 17, -0.10, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.beginPath();                      // fingertip
    ctx.arc(1, -1, 6.2, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  /* gentle elder craftsman, screen-space, drawn near a corner */
  function craftsman(ctx, x, y, s, t) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const bob = Math.sin(t * 1.1) * 2;
    ctx.translate(0, bob);
    ctx.fillStyle = '#3a4a63';            // indigo work kimono
    ctx.beginPath();
    ctx.moveTo(-46, 90); ctx.quadraticCurveTo(-52, 18, -20, 4);
    ctx.lineTo(20, 4); ctx.quadraticCurveTo(52, 18, 46, 90);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2d3a4f';            // apron
    ctx.beginPath();
    ctx.moveTo(-30, 92); ctx.quadraticCurveTo(0, 60, 30, 92);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#e8b98f';            // head
    ctx.beginPath(); ctx.arc(0, -18, 24, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#cfd2d6';            // grey hair
    ctx.beginPath(); ctx.arc(0, -30, 22, Math.PI, 0); ctx.fill();
    ctx.beginPath(); ctx.arc(0, -46, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#8a5a3a';            // headband
    ctx.fillRect(-23, -32, 46, 7);
    ctx.strokeStyle = '#7a4a2a';          // closed smiling eyes + mouth
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.arc(-9, -18, 4.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(9, -18, 4.5, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, -6, 6, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke();
    ctx.fillStyle = '#e8b98f';            // hand holding a brush
    ctx.beginPath(); ctx.arc(-38, 40, 10, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#6b4226';
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-38, 40); ctx.lineTo(-58, 8); ctx.stroke();
    ctx.fillStyle = '#222';
    ctx.beginPath(); ctx.ellipse(-61, 2, 7, 11, 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* the big coating brush sweeping across the piece */
  function coatBrush(ctx, x, yTop, yBot, t) {
    ctx.save();
    const wob = Math.sin(t * 14) * 4;
    ctx.translate(x + wob * 0.3, 0);
    ctx.fillStyle = 'rgba(34,27,22,0.94)';           // bristles
    ctx.beginPath();
    ctx.moveTo(-26, yTop - 12);
    ctx.lineTo(26, yTop - 12);
    ctx.lineTo(16, yBot + 12);
    ctx.lineTo(-16, yBot + 12);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(70,58,48,0.5)';           // bristle strands
    ctx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * 9, yTop);
      ctx.lineTo(i * 6.5, yBot);
      ctx.stroke();
    }
    ctx.fillStyle = '#8a5a35';                        // handle
    ctx.fillRect(-10, yTop - 86, 20, 78);
    ctx.fillStyle = '#e8b98f';                        // craftsman hand
    ctx.beginPath(); ctx.arc(0, yTop - 64 + wob, 21, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  function roundButton(ctx, x, y, r, pressed) {
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = pressed ? 'rgba(70,58,48,0.75)' : 'rgba(28,22,18,0.62)';
    ctx.fill();
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = 'rgba(230,215,190,0.65)';
    ctx.stroke();
    ctx.restore();
  }

  function iconHome(ctx, x, y, r, pressed) {
    roundButton(ctx, x, y, r, pressed);
    ctx.save();
    ctx.strokeStyle = 'rgba(240,228,205,0.95)';
    ctx.fillStyle = 'rgba(240,228,205,0.95)';
    ctx.lineWidth = r * 0.13;
    ctx.lineJoin = 'round';
    const s = r * 0.52;
    ctx.beginPath();
    ctx.moveTo(x - s, y);
    ctx.lineTo(x, y - s);
    ctx.lineTo(x + s, y);
    ctx.stroke();
    ctx.strokeRect(x - s * 0.62, y - s * 0.05, s * 1.24, s * 0.95);
    ctx.restore();
  }

  function iconAgain(ctx, x, y, r, pressed, t) {
    roundButton(ctx, x, y, r, pressed);
    ctx.save();
    ctx.strokeStyle = 'rgba(240,228,205,0.95)';
    ctx.lineWidth = r * 0.14;
    ctx.lineCap = 'round';
    const s = r * 0.52;
    ctx.beginPath(); ctx.arc(x, y, s, -0.4, Math.PI * 1.25); ctx.stroke();
    ctx.beginPath();                                   // arrowhead
    const ax = x + Math.cos(-0.4) * s, ay = y + Math.sin(-0.4) * s;
    ctx.moveTo(ax - s * 0.42, ay - s * 0.1);
    ctx.lineTo(ax + s * 0.12, ay - s * 0.42);
    ctx.lineTo(ax + s * 0.3, ay + s * 0.28);
    ctx.closePath();
    ctx.fillStyle = 'rgba(240,228,205,0.95)';
    ctx.fill();
    drawStar4(ctx, x + s * 0.9, y - s * 0.9, r * 0.2,
      (t || 0) * 2, 'rgba(255,240,200,0.9)');
    ctx.restore();
  }

  return { parts, spark, update, draw, drawStar4, hand, craftsman, coatBrush, iconHome, iconAgain };
})();
