// 12 の工程モジュール。
// 1 モジュール = 1 動詞 + 1 操作 + 1 つの視覚変化。
// 文字は一切出さない。誘導は「手のアイコン」と「破線の道すじ」だけ。
import { TAU, clamp, lerp, smooth, easeOut, easeIn, damp, mixHex } from './util.js';
import { CircleGesture, DragGesture, ArcGesture } from './input.js';
import * as A from './art.js';
import { MOLD, PLATE, PUD } from './art.js';
import { pourLoop, steamLoop, whiskLoop, coldLoop, sfx } from './audio.js';

// --- 粒子ヘルパ -------------------------------------------------------------
function emit(list, x, y, r, life, vx, vy) {
  if (list.length > 90) return;
  list.push({ x, y, r, life: 0, dur: life, vx, vy });
}
function stepParticles(list, dt) {
  for (let i = list.length - 1; i >= 0; i--) {
    const p = list[i];
    p.life += dt / p.dur;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.r += dt * 14;
    if (p.life >= 1) list.splice(i, 1);
  }
}

// 画面サイズに対する必要ドラッグ量。
// iPhone 縦 / iPad 横 のどちらでも「大きく 1〜1.5 回」で完了する量にする。
const vDist = (v, f = 0.8, cap = 520) => Math.max(140, Math.min(v.h * f, cap));
const hDist = (v, f = 0.8, cap = 520) => Math.max(140, Math.min(v.w * f, cap));

// 誘導の置き場所（指が Hero を隠さない安全地帯）
export function hintAnchor(v) {
  return v.portrait
    ? { x: v.w * 0.5, y: v.h * 0.84, span: Math.min(v.w * 0.34, 150) }
    : { x: v.w * 0.8, y: v.h * 0.62, span: Math.min(v.w * 0.13, 130) };
}

// 砂糖液の色: 透明 -> 淡い金 -> 琥珀
function sugarColor(t) {
  t = clamp(t);
  return t < 0.5
    ? mixHex('#f9f6ec', '#f0d17a', t * 2)
    : mixHex('#f0d17a', '#a85c14', (t - 0.5) * 2);
}

// --- 小物の描画 -------------------------------------------------------------
function stove(ctx, v, x) {
  const cx = v.X(x);
  const y = v.Y(0);
  const k = v.k;
  ctx.save();
  // 五徳
  ctx.beginPath();
  A.ellipse(ctx, cx, y, 78, 78 * k);
  ctx.fillStyle = '#4d5560';
  ctx.fill();
  ctx.beginPath();
  A.ellipse(ctx, cx, y - 2, 78, 78 * k);
  ctx.fillStyle = '#6b7480';
  ctx.fill();
  ctx.beginPath();
  A.ellipse(ctx, cx, y - 2, 48, 48 * k);
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#3c434d';
  ctx.stroke();
  ctx.restore();
}

// 炎は鍋の後ろ・手前の両方に出す（鍋に隠れないように鍋より後に描く）
function flames(ctx, v, x, base, flame, front) {
  if (!(flame > 0)) return;
  const cx = v.X(x);
  const y = v.Y(base);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 11; i++) {
    const a = (i / 11) * TAU;
    if (front === true && Math.sin(a) < 0) continue;
    if (front === false && Math.sin(a) >= 0) continue;
    const fx = cx + Math.cos(a) * 60;
    const fy = y + Math.sin(a) * 60 * v.k;
    const hgt = (26 + Math.sin(v.time * 12 + i * 2.1) * 9) * flame;
    ctx.beginPath();
    ctx.moveTo(fx - 13, fy);
    ctx.quadraticCurveTo(fx, fy - hgt * 2.1, fx + 13, fy);
    ctx.closePath();
    const g = ctx.createLinearGradient(fx, fy, fx, fy - hgt * 2.1);
    g.addColorStop(0, 'rgba(90,150,255,0.55)');
    g.addColorStop(0.28, 'rgba(255,140,30,0.85)');
    g.addColorStop(0.7, 'rgba(255,196,80,0.6)');
    g.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.restore();
}

function lever(ctx, v, x, angle, glow) {
  const cx = v.X(x);
  const yBase = v.Y(0);
  const yPiv = v.Y(58);
  ctx.save();
  // 支柱
  ctx.beginPath();
  A.ellipse(ctx, cx, yBase, 26, 26 * v.k);
  ctx.fillStyle = '#6b7480';
  ctx.fill();
  ctx.lineWidth = 15;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#8a95a2';
  ctx.beginPath();
  ctx.moveTo(cx, yBase);
  ctx.lineTo(cx, yPiv);
  ctx.stroke();
  ctx.lineWidth = 6;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.stroke();
  // アーム
  ctx.translate(cx, yPiv);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -52);
  ctx.lineWidth = 13;
  ctx.strokeStyle = '#d8dee6';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, -56, 19, 0, TAU);
  const g = ctx.createRadialGradient(-7, -63, 2, 0, -56, 22);
  g.addColorStop(0, '#ffb59c');
  g.addColorStop(0.5, '#ff7a59');
  g.addColorStop(1, '#d8492a');
  ctx.fillStyle = g;
  ctx.fill();
  if (glow > 0) {
    ctx.beginPath();
    ctx.arc(0, -56, 19 + glow * 7, 0, TAU);
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(255,255,255,${0.5 * (1 - glow)})`;
    ctx.stroke();
  }
  ctx.restore();
}

function tray(ctx, v, x) {
  const cx = v.X(x);
  const yb = v.Y(0);
  const yt = v.Y(11);
  ctx.save();
  ctx.beginPath();
  A.ellipse(ctx, cx, yt, 150, 150 * v.k, Math.PI, TAU);
  ctx.lineTo(cx + 140, yb);
  A.ellipse(ctx, cx, yb, 140, 140 * v.k, 0, Math.PI);
  ctx.closePath();
  const g = ctx.createLinearGradient(cx - 150, 0, cx + 150, 0);
  g.addColorStop(0, '#7c8794');
  g.addColorStop(0.3, '#e6ecf2');
  g.addColorStop(0.55, '#b9c4cf');
  g.addColorStop(1, '#6f7a87');
  ctx.fillStyle = g;
  ctx.fill();
  ctx.beginPath();
  A.ellipse(ctx, cx, yt, 150, 150 * v.k);
  ctx.fillStyle = '#c8d2dc';
  ctx.fill();
  ctx.beginPath();
  A.ellipse(ctx, cx, yt + 1, 142, 142 * v.k);
  const wg = ctx.createRadialGradient(cx, yt, 4, cx, yt, 142);
  wg.addColorStop(0, 'rgba(214,238,250,0.95)');
  wg.addColorStop(1, 'rgba(150,200,226,0.95)');
  ctx.fillStyle = wg;
  ctx.fill();
  ctx.restore();
}

function lid(ctx, v, x, base, alpha = 1, glow = 0) {
  const cx = v.X(x);
  const yb = v.Y(base);
  const yt = v.Y(base + 74);
  const R = 70;
  ctx.save();
  ctx.globalAlpha = alpha;
  // ドーム
  ctx.beginPath();
  ctx.moveTo(cx - R, yb);
  ctx.bezierCurveTo(cx - R, yt + 10, cx - R * 0.66, yt, cx, yt);
  ctx.bezierCurveTo(cx + R * 0.66, yt, cx + R, yt + 10, cx + R, yb);
  A.ellipse(ctx, cx, yb, R, R * v.k, 0, Math.PI);
  ctx.closePath();
  const g = ctx.createLinearGradient(cx - R, 0, cx + R, 0);
  g.addColorStop(0, '#69747f');
  g.addColorStop(0.18, '#c3ceda');
  g.addColorStop(0.32, '#ffffff');
  g.addColorStop(0.46, '#dde5ed');
  g.addColorStop(0.66, '#9fabb7');
  g.addColorStop(0.86, '#c8d3dd');
  g.addColorStop(1, '#5f6a77');
  ctx.fillStyle = g;
  ctx.fill();
  // ふちの厚み（手前半分だけ。奥側を描くと「開いたボウル」に見えてしまう）
  ctx.beginPath();
  A.ellipse(ctx, cx, yb, R, R * v.k, 0, Math.PI);
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#aeb9c5';
  ctx.stroke();
  ctx.beginPath();
  A.ellipse(ctx, cx, yb - 2.5, R, R * v.k, 0, Math.PI);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.stroke();
  // つまみ（大きく掴みやすい見た目）
  ctx.beginPath();
  ctx.moveTo(cx, yt + 4);
  ctx.lineTo(cx, yt - 10);
  ctx.lineWidth = 9;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#9aa6b2';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, yt - 20, 19, 0, TAU);
  const kg = ctx.createRadialGradient(cx - 7, yt - 28, 2, cx, yt - 20, 22);
  kg.addColorStop(0, '#ffc3ad');
  kg.addColorStop(0.5, '#ff7a59');
  kg.addColorStop(1, '#d8492a');
  ctx.fillStyle = kg;
  ctx.fill();
  if (glow > 0) {
    ctx.beginPath();
    ctx.arc(cx, yt - 20, 19 + glow * 8, 0, TAU);
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(255,255,255,${0.55 * (1 - glow)})`;
    ctx.stroke();
  }
  ctx.restore();
}

// 雪の結晶（冷却パネルの飾り）
function snowflake(c, x, y, r, alpha) {
  c.save();
  c.globalAlpha = alpha;
  c.translate(x, y);
  c.lineWidth = Math.max(1.4, r * 0.16);
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(255,255,255,0.95)';
  for (let i = 0; i < 3; i++) {
    c.rotate(Math.PI / 3);
    c.beginPath();
    c.moveTo(-r, 0);
    c.lineTo(r, 0);
    c.stroke();
    c.beginPath();
    c.moveTo(r * 0.5, 0);
    c.lineTo(r * 0.72, -r * 0.24);
    c.moveTo(r * 0.5, 0);
    c.lineTo(r * 0.72, r * 0.24);
    c.moveTo(-r * 0.5, 0);
    c.lineTo(-r * 0.72, -r * 0.24);
    c.moveTo(-r * 0.5, 0);
    c.lineTo(-r * 0.72, r * 0.24);
    c.stroke();
  }
  c.restore();
}

function coldPanel(ctx, v, cover, time) {
  // 右から入ってくる、氷のように曇った冷蔵の扉
  if (cover <= 0.001) return;
  const w = v.w;
  const h = v.h;
  const x = lerp(w * 1.04, -w * 0.04, cover);
  const c = v.begin();
  c.save();
  const g = c.createLinearGradient(x, 0, x + w * 1.1, 0);
  g.addColorStop(0, 'rgba(224,244,255,0.86)');
  g.addColorStop(0.12, 'rgba(206,236,252,0.7)');
  g.addColorStop(0.6, 'rgba(190,228,248,0.66)');
  g.addColorStop(1, 'rgba(178,220,244,0.7)');
  c.fillStyle = g;
  c.fillRect(x, 0, w * 1.2, h);

  // 扉のふち（厚み）
  const eg = c.createLinearGradient(x - 4, 0, x + 22, 0);
  eg.addColorStop(0, 'rgba(255,255,255,0)');
  eg.addColorStop(0.45, 'rgba(255,255,255,0.7)');
  eg.addColorStop(1, 'rgba(214,238,250,0.25)');
  c.fillStyle = eg;
  c.fillRect(x - 4, 0, 26, h);

  // 取っ手
  c.save();
  c.shadowColor = 'rgba(70,110,140,0.35)';
  c.shadowBlur = 10;
  c.fillStyle = '#ffffff';
  const hy = h * 0.42;
  const hh = Math.min(h * 0.18, 150);
  c.lineCap = 'round';
  c.lineWidth = 17;
  c.strokeStyle = '#ffffff';
  c.beginPath();
  c.moveTo(x + 52, hy + 10);
  c.lineTo(x + 52, hy + hh - 10);
  c.stroke();
  c.lineWidth = 6;
  c.strokeStyle = 'rgba(190,224,244,0.9)';
  c.stroke();
  c.restore();

  // 霜と雪の結晶
  for (let i = 0; i < 9; i++) {
    const fx = x + 90 + ((i * 137) % Math.max(1, w * 0.85));
    const fy = ((i * 211) % Math.max(1, h * 0.86)) + h * 0.06 + Math.sin(time * 0.7 + i) * 6;
    snowflake(c, fx, fy, 10 + (i % 3) * 6, 0.35 + (i % 2) * 0.2);
  }
  c.restore();
}

// --- ステージ定義 -----------------------------------------------------------
// 各 stage: { id, verb, cam(v), enter(g), update(g,dt,input,v)->0..1,
//             draw(ctx,v,g), hint(v,g), hold(秒) }

const S = [];

// 1. あたためる: 透明な砂糖液がゆっくり琥珀色になる
S.push({
  id: 'caramelize',
  cam: () => ({ x: 18, y: 62, w: 275, h: 130, k: 0.5, anchor: 0.5 }),
  enter(g, v) {
    g.gesture = new DragGesture('y', 1, vDist(v, 0.72));
    g.leverAngle = -0.42;
    g.amber = 0;
  },
  update(g, dt, input) {
    const p = g.gesture.update(input, dt);
    g.amber = damp(g.amber, p, 4, dt);
    g.leverAngle = damp(g.leverAngle, input.active ? 0.85 : -0.42 + p * 0.25, 9, dt);
    g.flame = damp(g.flame || 0, 0.35 + p * 0.65, 3, dt);
    if (p > 0.12) {
      steamLoop.set(0.25 + p * 0.4);
      if (Math.random() < dt * (2 + p * 8)) sfx.bubble();
      if (Math.random() < dt * 16)
        emit(g.puffs, -45 + (Math.random() - 0.5) * 60, 56, 13, 1.8, (Math.random() - 0.5) * 10, 30);
    }
    stepParticles(g.puffs, dt);
    return p;
  },
  draw(ctx, v, g) {
    stove(ctx, v, -45);
    A.ground(ctx, v, -45, 0, 74, 0.35);
    flames(ctx, v, -45, 12, g.flame || 0, false);
    A.pot(ctx, v, {
      x: -45,
      base: 14,
      liquid: 0.55,
      color: sugarColor(g.amber),
      bubbles: 0.25 + g.amber * 0.75,
      time: v.time,
    });
    flames(ctx, v, -45, 12, g.flame || 0, true);
    A.steamPuffs(ctx, v, g.puffs, 'rgba(255,252,244,');
    lever(ctx, v, 118, g.leverAngle, g.pulse);
  },
  hint(v) {
    const a = hintAnchor(v);
    return {
      pts: [
        [a.x, a.y - a.span * 0.6],
        [a.x, a.y + a.span * 0.45],
      ],
      handRot: 0,
    };
  },
  hold: 0.9,
});

// 2. そそぐ: とろみのあるカラメルを型の底へ
S.push({
  id: 'pour-caramel',
  cam: () => ({ x: -52, y: 62, w: 236, h: 132, k: 0.52, anchor: 0.5 }),
  enter(g, v) {
    g.gesture = new DragGesture('x', 1, hDist(v, 0.78));
    g.potTilt = 0;
  },
  update(g, dt, input) {
    const p = g.gesture.update(input, dt);
    g.potTilt = damp(g.potTilt, p * 1.02, 8, dt);
    const pouring = g.potTilt > 0.34 && p < 0.999;
    g.pouring = pouring;
    g.caramelInMold = clamp(smooth((p - 0.22) / 0.68));
    pourLoop.set(pouring ? 0.8 : 0);
    if (pouring && Math.random() < dt * 14) {
      emit(g.puffs, 4 + (Math.random() - 0.5) * 26, 30, 4, 0.7, (Math.random() - 0.5) * 18, -6);
    }
    stepParticles(g.puffs, dt);
    return p;
  },
  draw(ctx, v, g) {
    A.ground(ctx, v, 0, 0, 62, 0.4);
    A.mold(ctx, v, { x: 0, base: 0, open: true, caramel: g.caramelInMold });
    const potX = -104 + g.potTilt * 16;
    A.pot(ctx, v, {
      x: potX,
      base: 84,
      tilt: g.potTilt,
      liquid: 0.55 * (1 - g.caramelInMold * 0.75),
      color: '#c9761b',
      time: v.time,
    });
    if (g.pouring) {
      const sp = A.vesselSpout(v, potX, 84, g.potTilt, 58, 40);
      const tp = A.moldPoolPoint(v, 0, 0, g.caramelInMold, 0);
      A.stream(ctx, v, {
        x0: sp.x,
        y0: sp.y,
        x1: tp.x,
        y1: tp.y,
        width: 9.5,
        time: v.time,
        c1: '#d98d29',
        c2: '#9c5510',
        hi: '#ffd79a',
      });
      A.splash(ctx, v, {
        lx: tp.x,
        ly: tp.y,
        r: 15 + Math.sin(v.time * 15) * 2.5,
        color: 'rgba(200,120,30,0.5)',
      });
    }
  },
  hint(v) {
    const a = hintAnchor(v);
    return {
      pts: [
        [a.x - a.span * 0.7, a.y],
        [a.x + a.span * 0.7, a.y],
      ],
      handRot: 0,
    };
  },
  hold: 1.0,
});

// 3. まぜる: 別容器で黄色い液を混ぜる（円運動）
S.push({
  id: 'mix',
  cam: () => ({ x: 0, y: 52, w: 202, h: 122, k: 0.62, anchor: 0.5 }),
  enter(g, v) {
    g.gesture = new CircleGesture(2.0);
    g.swirl = 0;
    g.mixed = 0;
  },
  update(g, dt, input, v) {
    const c = v.toScreen(0, 46);
    const p = g.gesture.update(input, c.x, c.y, dt);
    g.mixed = p;
    g.swirl = g.gesture.spin;
    whiskLoop.set(clamp(g.gesture.speed * 0.6));
    return p;
  },
  draw(ctx, v, g) {
    A.ground(ctx, v, 0, 0, 78, 0.4);
    A.bowl(ctx, v, {
      x: 0,
      base: 0,
      liquid: 0.72,
      mixed: g.mixed,
      swirl: g.swirl,
      ripple: g.gesture.speed,
      time: v.time,
    });
    A.whisk(ctx, v, { x: 0, base: 24, rot: g.swirl, orbit: 30 });
  },
  hint(v) {
    const a = hintAnchor(v);
    const pts = [];
    const r = a.span * 0.62;
    for (let i = 0; i <= 26; i++) {
      const t = (i / 26) * TAU * 0.92 - Math.PI / 2;
      pts.push([a.x + Math.cos(t) * r, a.y + Math.sin(t) * r * 0.62]);
    }
    return { pts, circle: true, radius: r };
  },
  hold: 0.8,
});

// 4. そそぐ: 型へ黄色い液。底の茶色と上の黄色が二層になる
S.push({
  id: 'pour-custard',
  cam: () => ({ x: -66, y: 66, w: 262, h: 144, k: 0.58, anchor: 0.5 }),
  enter(g, v) {
    g.gesture = new DragGesture('x', 1, hDist(v, 0.82));
    g.bowlTilt = 0;
  },
  update(g, dt, input) {
    const p = g.gesture.update(input, dt);
    g.bowlTilt = damp(g.bowlTilt, p * 0.92, 8, dt);
    const pouring = g.bowlTilt > 0.3 && p < 0.999;
    g.pouring = pouring;
    g.custardInMold = clamp(smooth((p - 0.3) / 0.7));
    pourLoop.set(pouring ? 0.7 : 0);
    return p;
  },
  draw(ctx, v, g) {
    A.ground(ctx, v, 0, 0, 62, 0.4);
    A.mold(ctx, v, {
      x: 0,
      base: 0,
      open: true,
      caramel: g.caramelInMold,
      custard: g.custardInMold,
    });
    const bx = -116 + g.bowlTilt * 14;
    A.bowl(ctx, v, {
      x: bx,
      base: 88,
      tilt: g.bowlTilt,
      liquid: 0.72 * (1 - g.custardInMold * 0.8),
      mixed: 1,
      swirl: 0,
    });
    if (g.pouring) {
      const sp = A.vesselSpout(v, bx, 88, g.bowlTilt, 70, 46);
      const tp = A.moldPoolPoint(v, 0, 0, g.caramelInMold, g.custardInMold);
      A.stream(ctx, v, {
        x0: sp.x,
        y0: sp.y,
        x1: tp.x,
        y1: tp.y,
        width: 11,
        time: v.time,
        c1: '#ffd964',
        c2: '#e8ac33',
        hi: '#fff3c4',
      });
      A.splash(ctx, v, {
        lx: tp.x,
        ly: tp.y,
        r: 16 + Math.sin(v.time * 14) * 2.5,
        color: 'rgba(255,220,130,0.55)',
      });
    }
  },
  hint(v) {
    const a = hintAnchor(v);
    return {
      pts: [
        [a.x - a.span * 0.7, a.y],
        [a.x + a.span * 0.7, a.y],
      ],
    };
  },
  hold: 1.1,
});

// 5. あたためる（湯気）: 蓋を下ろす。液面が固まる
S.push({
  id: 'steam',
  cam: () => ({ x: 0, y: 78, w: 322, h: 186, k: 0.44, anchor: 0.5 }),
  enter(g, v) {
    g.gesture = new DragGesture('y', 1, vDist(v, 0.66));
    g.lidBase = 118;
    g.cooked = 0;
  },
  update(g, dt, input) {
    const p = g.gesture.update(input, dt);
    g.lidBase = damp(g.lidBase, lerp(118, 66, easeOut(p)), 7, dt);
    const covered = clamp((p - 0.45) / 0.5);
    g.cooked = Math.max(g.cooked, covered);
    steamLoop.set(0.3 + covered * 0.7);
    const rate = 8 + covered * 34;
    if (Math.random() < dt * rate) {
      const side = Math.random() < 0.5 ? -1 : 1;
      // 蓋のふちの隙間から、外へ・上へ逃げる
      emit(g.puffs, side * (66 + Math.random() * 18), g.lidBase + 2, 11, 2.0, side * (26 + Math.random() * 20), 40);
    }
    stepParticles(g.puffs, dt);
    return p;
  },
  draw(ctx, v, g) {
    tray(ctx, v, 0);
    A.ground(ctx, v, 0, 11, 58, 0.35);
    A.mold(ctx, v, {
      x: 0,
      base: 8,
      open: true,
      caramel: g.caramelInMold,
      custard: g.custardInMold,
      set: g.cooked > 0.5,
    });
    lid(ctx, v, 0, g.lidBase, 1, g.pulse || 0);
    A.steamPuffs(ctx, v, g.puffs, 'rgba(255,253,248,');
  },
  hint(v) {
    const a = hintAnchor(v);
    return {
      pts: [
        [a.x, a.y - a.span * 0.6],
        [a.x, a.y + a.span * 0.5],
      ],
    };
  },
  hold: 1.4,
  outro(g, u) {
    // 蓋がゆっくり上がって、固まった液面が見える
    g.lidBase = lerp(66, 200, easeIn(u));
    g.cooked = 1;
    steamLoop.set(0.6 * (1 - u));
  },
});

// 6. ひやす: 冷たい扉をかぶせる。青くなって霜がつく
S.push({
  id: 'chill',
  cam: () => ({ x: 0, y: 58, w: 236, h: 136, k: 0.44, anchor: 0.5 }),
  enter(g, v) {
    g.gesture = new DragGesture('x', -1, hDist(v, 0.75));
    g.cover = 0;
  },
  update(g, dt, input) {
    const p = g.gesture.update(input, dt);
    g.cover = damp(g.cover, Math.sin(clamp(p) * Math.PI) * 1.0, 6, dt);
    g.cold = Math.max(g.cold, clamp((p - 0.25) / 0.6));
    g.frost = g.cold;
    coldLoop.set(0.3 + g.cold * 0.5);
    steamLoop.set(0);
    if (Math.random() < dt * (4 + g.cold * 10)) {
      emit(g.puffs, (Math.random() - 0.5) * 120, 40 + Math.random() * 20, 9, 1.7, (Math.random() - 0.5) * 10, -26);
    }
    stepParticles(g.puffs, dt);
    return p;
  },
  draw(ctx, v, g) {
    A.ground(ctx, v, 0, 0, 58, 0.35);
    A.mold(ctx, v, {
      x: 0,
      base: 0,
      open: true,
      caramel: g.caramelInMold,
      custard: g.custardInMold,
      set: true,
      frost: g.frost,
    });
    A.steamPuffs(ctx, v, g.puffs, 'rgba(214,240,255,');
    coldPanel(ctx, v, g.cover, v.time);
  },
  hint(v) {
    const a = hintAnchor(v);
    return {
      pts: [
        [a.x + a.span * 0.75, a.y],
        [a.x - a.span * 0.75, a.y],
      ],
    };
  },
  hold: 0.9,
});

// 7. かぶせる: 白い皿を型の上へ（「なんで皿をかぶせるの？」）
S.push({
  id: 'plate-on',
  cam: () => ({ x: 0, y: 64, w: 264, h: 152, k: 0.36, anchor: 0.5 }),
  enter(g, v) {
    g.gesture = new DragGesture('y', 1, vDist(v, 0.6));
    g.plateBase = 120;
    g.clacked = false;
  },
  update(g, dt, input) {
    const p = g.gesture.update(input, dt);
    const target = lerp(120, MOLD.h, easeOut(p));
    g.plateBase = damp(g.plateBase, target, 9, dt);
    if (!g.clacked && p > 0.985) {
      g.clacked = true;
      sfx.clack();
      g.shake = 0.5;
    }
    return p;
  },
  draw(ctx, v, g) {
    A.ground(ctx, v, 0, 0, 58, 0.35);
    A.mold(ctx, v, {
      x: 0,
      base: 0,
      open: true,
      caramel: g.caramelInMold,
      custard: g.custardInMold,
      set: true,
      frost: g.frost * 0.5,
    });
    // 皿の落下影
    const t = clamp((120 - g.plateBase) / 56);
    A.ground(ctx, v, 0, MOLD.h + 1, lerp(70, PLATE.r * 0.8, t), 0.25 * t);
    A.plate(ctx, v, { x: 0, base: g.plateBase });
  },
  hint(v) {
    const a = hintAnchor(v);
    return {
      pts: [
        [a.x, a.y - a.span * 0.6],
        [a.x, a.y + a.span * 0.5],
      ],
    };
  },
  hold: 0.9,
});

// 8. ひっくりかえす: 大きな弧のスワイプで皿と型を一緒に 180 度
S.push({
  id: 'flip',
  cam: () => ({ x: 0, y: 46, w: 276, h: 180, k: 0.2, anchor: 0.5 }),
  enter(g, v) {
    g.gesture = new ArcGesture(hDist(v, 0.72, 480));
    g.flip = 0;
    g.flipDone = false;
    g.whooshed = false;
  },
  update(g, dt, input) {
    let p = g.gesture.update(input, dt);
    // 8 割まで回したら最後は自動で決まる（4 歳児への強い入力補正）
    if (p > 0.78) g.gesture.acc += g.gesture.dist * dt * 1.7;
    p = clamp(g.gesture.acc / g.gesture.dist);
    g.flip = damp(g.flip, p, 11, dt);
    if (!g.flipDone && p > 0.995) {
      g.flipDone = true;
      sfx.clack();
      g.shake = 0.7;
    }
    if (g.gesture.rate > 0.3 && !g.whooshed) {
      g.whooshed = true;
      sfx.whoosh();
    }
    return p;
  },
  draw(ctx, v, g) {
    const ang = g.flip * Math.PI;
    const hop = Math.sin(g.flip * Math.PI) * 30;
    const pivotY = (MOLD.h + PLATE.h) / 2;
    const px = v.X(0);
    const py = v.Y(pivotY + hop);
    A.ground(ctx, v, 0, 0, lerp(58, PLATE.r * 0.86, g.flip), 0.4 - Math.sin(g.flip * Math.PI) * 0.2);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.translate(-v.X(0), -v.Y(pivotY));
    A.mold(ctx, v, {
      x: 0,
      base: 0,
      open: false,
      caramel: g.caramelInMold,
      custard: g.custardInMold,
      set: true,
      frost: g.frost * 0.35,
    });
    A.plate(ctx, v, { x: 0, base: MOLD.h });
    ctx.restore();
  },
  hint(v) {
    const a = hintAnchor(v);
    const pts = [];
    const r = a.span * 0.95;
    for (let i = 0; i <= 20; i++) {
      const t = Math.PI + (i / 20) * Math.PI * 0.9;
      pts.push([a.x + Math.cos(t) * r, a.y + Math.sin(t) * r * 0.5 + r * 0.12]);
    }
    return { pts };
  },
  hold: 1.2,
});

// 9-11. かたをぬく → ぷるん → カラメルが流れる（最大のリプレイ磁石）
S.push({
  id: 'demold',
  cam: () => ({ x: 0, y: 58, w: 168, h: 152, k: 0.34, anchor: 0.52 }),
  enter(g, v) {
    g.gesture = new DragGesture('y', -1, vDist(v, 0.42, 340));
    g.lift = 0;
    g.moldRise = 0;
    g.released = false;
    g.relT = 0;
    g.caramelFlow = 0;
    g.wobble = 0;
    g.phase = 0;
    g.squash = 0;
    g.squashVel = 0;
    g.dropped = 0;
    g.dripSfx = 0;
  },
  camDynamic(t, g) {
    // 型を引き上げるあいだ、カメラがわずかに追う。外れた瞬間に少し引く。
    t.y += Math.min(g.moldRise || 0, 60) * 0.14;
    if (g.released) {
      const u = clamp((g.relT || 0) / 0.9);
      t.w *= 1 + 0.1 * u;
      t.h *= 1 + 0.1 * u;
    }
  },
  update(g, dt, input, v) {
    // 「もう一回」用: 型がプリンにかぶさりながら戻ってくる
    if (g.recap > 0) {
      g.recap -= dt;
      g.moldRise = damp(g.moldRise, 0, 5.5, dt);
      g.caramelFlow = damp(g.caramelFlow, 0, 6, dt);
      if (g.recap <= 0) {
        g.recap = 0;
        g.moldRise = 0;
        g.caramelFlow = 0;
        g.gesture.reset();
      }
      return 0;
    }
    if (!g.released) {
      const p = g.gesture.update(input, dt);
      g.lift = p;
      // 最後の数 mm は「くっついて」抵抗し、プリンがわずかに伸びる
      g.stick = smooth((p - 0.66) / 0.3);
      g.moldRise = damp(g.moldRise, (Math.min(p, 0.9) / 0.9) * 55, 14, dt);
      if (p >= 0.9) {
        g.released = true;
        g.relT = 0;
        sfx.purun();
        g.shake = 0.55;
        // 一度つぶれて、ぷるんと戻る（バネの初期変位 + 速度）
        g.squash = 0.17;
        g.squashVel = 0.7;
        g.wobble = 11.5;
        g.phase = 0;
      }
      return 0; // 抜けるまでは完了扱いにしない
    }
    // --- 解放後のシーケンス ---
    g.relT += dt;
    g.moldRise = damp(g.moldRise, 150, 6.5, dt);
    g.stick = 0;
    // バネ（squash）: ζ≈0.4 の減衰振動で 2〜3 回はずむ
    const k = 240,
      damping = 12;
    let left = dt;
    while (left > 0) {
      const h = Math.min(left, 1 / 240);
      g.squashVel += (0 - g.squash) * k * h - g.squashVel * damping * h;
      g.squash += g.squashVel * h;
      left -= h;
    }
    // 横揺れ（減衰振動）
    g.phase += dt * 17;
    g.wobble = Math.max(0, g.wobble - dt * g.wobble * 1.9);
    // カラメルが頂上から側面へ
    if (g.relT > 0.22) g.caramelFlow = clamp(g.caramelFlow + dt / 2.1);
    if (g.caramelFlow > 0.35 && g.dripSfx === 0) {
      g.dripSfx = 1;
      sfx.drip();
    }
    if (g.relT > 3.1) return 1;
    return 0;
  },
  draw(ctx, v, g) {
    A.plate(ctx, v, { x: 0, base: 0 });
    const hEffScale = 1 + (g.stick || 0) * 0.05;
    // まだ完全に型の中なら描かない（影が型の外へはみ出して正体を匂わせないように）
    if (g.released || g.moldRise > 0.6)
      A.pudding(ctx, v, {
      x: 0,
      base: PLATE.h,
      wobble: g.wobble,
      phase: g.phase,
      squash: g.squash + (g.stick ? -g.stick * 0.05 : 0),
      reveal: g.released ? 1 : clamp(g.moldRise / (PUD.h * hEffScale)),
      caramelFlow: g.caramelFlow,
    });
    A.mold(ctx, v, {
      x: 0,
      base: PLATE.h + g.moldRise,
      open: false,
      flipped: true,
    });
  },
  hint(v) {
    const a = hintAnchor(v);
    return {
      pts: [
        [a.x, a.y + a.span * 0.55],
        [a.x, a.y - a.span * 0.6],
      ],
      slow: true,
    };
  },
  hold: 0.4,
});

// 12. できあがり: カメラを少し引いて、初めて全体を見せる
S.push({
  id: 'reveal',
  // 少し引いて全体を見せる。横画面では右下のボタンを避けて被写体を左へ寄せる。
  cam: (v) => ({
    x: v.portrait ? 0 : 34,
    y: 42,
    w: 268,
    h: v.portrait ? 132 : 152,
    k: 0.42,
    anchor: v.portrait ? 0.46 : 0.42,
  }),
  auto: true,
  enter(g, v) {
    g.revealT = 0;
    g.sparks = [];
    sfx.sparkle();
  },
  update(g, dt, input, v) {
    g.revealT += dt;
    g.phase += dt * 6.2;
    g.wobble = Math.max(0, g.wobble * (1 - dt * 1.4)) + Math.sin(g.revealT * 1.6) * 0.02;
    g.caramelFlow = clamp(g.caramelFlow + dt * 0.25);
    if (g.revealT < 1.6 && Math.random() < dt * 16) {
      const c = v.toScreen(0, 40);
      const a = Math.random() * TAU;
      const rr = 90 + Math.random() * 90;
      g.sparks.push({
        x: c.x + Math.cos(a) * rr,
        y: c.y + Math.sin(a) * rr * 0.7,
        r: 7 + Math.random() * 9,
        rot: Math.random() * TAU,
        life: 1,
        color: 'rgba(255,246,205,0.95)',
      });
    }
    for (let i = g.sparks.length - 1; i >= 0; i--) {
      const s = g.sparks[i];
      s.life -= dt * 0.9;
      s.rot += dt * 1.4;
      s.y -= dt * 12;
      if (s.life <= 0) g.sparks.splice(i, 1);
    }
    return 0; // ここで待機（リプレイ待ち）
  },
  draw(ctx, v, g) {
    A.plate(ctx, v, { x: 0, base: 0 });
    A.pudding(ctx, v, {
      x: 0,
      base: PLATE.h,
      wobble: g.wobble,
      phase: g.phase,
      squash: 0,
      caramelFlow: g.caramelFlow,
    });
  },
  hold: 0,
});

export const STAGES = S;
export const STAGE_INDEX = Object.fromEntries(S.map((s, i) => [s.id, i]));
