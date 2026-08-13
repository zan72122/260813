import { TAU } from '../core/math';

const COLORS = ['#fff6a8', '#ff7fd0', '#8ad4ff', '#a6ffd8', '#ffffff', '#ffd85e'];

function reducedMotion(): boolean {
  return globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/** A puff of sparks flying out of a point. Purely decorative; cleans up after itself. */
export function burst(layer: HTMLElement, x: number, y: number, count = 14, spread = 150): void {
  if (reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'spark';
    const c = COLORS[i % COLORS.length];
    const size = 8 + Math.random() * 18;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    el.style.background = `radial-gradient(circle, #fff 0%, ${c} 45%, rgba(255,255,255,0) 72%)`;
    el.style.transform = `translate(${x}px, ${y}px)`;
    layer.appendChild(el);

    const a = (i / count) * TAU + Math.random() * 0.6;
    const dist = spread * (0.45 + Math.random() * 0.85);
    const dx = x + Math.cos(a) * dist;
    const dy = y + Math.sin(a) * dist - 30;
    const dur = 620 + Math.random() * 520;

    const anim = el.animate(
      [
        { transform: `translate(${x}px, ${y}px) scale(0.3)`, opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(1.15)`, opacity: 0 },
      ],
      { duration: dur, easing: 'cubic-bezier(0.15, 0.7, 0.3, 1)', fill: 'forwards' },
    );
    anim.onfinish = () => el.remove();
    anim.oncancel = () => el.remove();
  }
}

/** Expanding ring, used when the press lands. */
export function shockRing(layer: HTMLElement, x: number, y: number, size = 220): void {
  if (reducedMotion()) return;
  const el = document.createElement('div');
  el.className = 'spark';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
  el.style.border = '6px solid rgba(255,255,255,0.9)';
  el.style.background = 'transparent';
  el.style.transform = `translate(${x}px, ${y}px) scale(0.15)`;
  layer.appendChild(el);
  const anim = el.animate(
    [
      { transform: `translate(${x}px, ${y}px) scale(0.15)`, opacity: 0.95 },
      { transform: `translate(${x}px, ${y}px) scale(1.1)`, opacity: 0 },
    ],
    { duration: 520, easing: 'ease-out', fill: 'forwards' },
  );
  anim.onfinish = () => el.remove();
  anim.oncancel = () => el.remove();
}

/** Slow drifting glitter across the whole finish screen. */
export function confetti(layer: HTMLElement, w: number, h: number, count = 26): void {
  if (reducedMotion()) return;
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'spark';
    const size = 10 + Math.random() * 20;
    el.style.width = `${size}px`;
    el.style.height = `${size}px`;
    const c = COLORS[i % COLORS.length];
    el.style.background = `radial-gradient(circle, #fff 0%, ${c} 50%, rgba(255,255,255,0) 74%)`;
    const x = Math.random() * w;
    const y0 = -40 - Math.random() * h * 0.4;
    const y1 = h + 60;
    layer.appendChild(el);
    const anim = el.animate(
      [
        { transform: `translate(${x}px, ${y0}px) scale(0.6)`, opacity: 0 },
        { transform: `translate(${x + 30}px, ${y0 + 80}px) scale(1)`, opacity: 1, offset: 0.15 },
        { transform: `translate(${x - 20}px, ${y1}px) scale(0.8)`, opacity: 0 },
      ],
      {
        duration: 2600 + Math.random() * 1800,
        delay: Math.random() * 700,
        easing: 'ease-in',
        fill: 'forwards',
      },
    );
    anim.onfinish = () => el.remove();
    anim.oncancel = () => el.remove();
  }
}
