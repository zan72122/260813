/** 文字を減らすためのアイコン。すべてインライン SVG（絵文字フォントに依存しない）。 */

const wrap = (inner: string, extra = ''): string =>
  `<svg viewBox="0 0 64 64" aria-hidden="true" ${extra}>${inner}</svg>`;

export const iconBridge = (): string =>
  wrap(`
    <path d="M6 40 H58" stroke="#8fd3ff" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path d="M18 40 V56 M46 40 V56" stroke="#5c86c8" stroke-width="7" stroke-linecap="round"/>
    <path d="M10 40 Q32 24 54 40" stroke="#ffd24a" stroke-width="5" fill="none" stroke-linecap="round"/>
  `);

export const iconArch = (): string =>
  wrap(`
    <path d="M12 54 V36 A20 20 0 0 1 52 36 V54" stroke="#8fd3ff" stroke-width="8" fill="none" stroke-linecap="round"/>
    <path d="M22 54 V36 A10 10 0 0 1 42 36 V54" stroke="#ff8fb0" stroke-width="4" fill="none" opacity=".8"/>
  `);

export const iconFlower = (): string =>
  wrap(`
    <g fill="#ff8fb0">
      <ellipse cx="32" cy="14" rx="8" ry="11"/>
      <ellipse cx="47" cy="23" rx="8" ry="11" transform="rotate(60 47 23)"/>
      <ellipse cx="47" cy="41" rx="8" ry="11" transform="rotate(120 47 41)"/>
      <ellipse cx="32" cy="50" rx="8" ry="11"/>
      <ellipse cx="17" cy="41" rx="8" ry="11" transform="rotate(60 17 41)"/>
      <ellipse cx="17" cy="23" rx="8" ry="11" transform="rotate(120 17 23)"/>
    </g>
    <circle cx="32" cy="32" r="9" fill="#ffd24a"/>
  `);

export const iconBear = (): string =>
  wrap(`
    <circle cx="18" cy="18" r="8" fill="#c8874c"/>
    <circle cx="46" cy="18" r="8" fill="#c8874c"/>
    <circle cx="32" cy="34" r="20" fill="#c8874c"/>
    <ellipse cx="32" cy="41" rx="9" ry="7" fill="#f2d7b0"/>
    <circle cx="24" cy="30" r="3" fill="#2a1a08"/>
    <circle cx="40" cy="30" r="3" fill="#2a1a08"/>
    <circle cx="32" cy="38" r="2.6" fill="#5a3a18"/>
  `);

export const iconRainbow = (): string =>
  wrap(`
    <path d="M6 52 A26 26 0 0 1 58 52" stroke="#ff5a70" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M15 52 A17 17 0 0 1 49 52" stroke="#ffd24a" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M24 52 A8 8 0 0 1 40 52" stroke="#5ce1c0" stroke-width="7" fill="none" stroke-linecap="round"/>
  `);

export const iconHand = (): string =>
  wrap(`
    <rect x="26" y="6" width="14" height="30" rx="7" fill="#fff6e8" stroke="#3a2a18" stroke-width="3"/>
    <rect x="16" y="28" width="34" height="30" rx="14" fill="#fff6e8" stroke="#3a2a18" stroke-width="3"/>
  `);

export const iconWeight = (): string =>
  wrap(`
    <path d="M24 18 a8 8 0 0 1 16 0" stroke="#c3d3ea" stroke-width="5" fill="none"/>
    <path d="M12 20 H52 L46 52 H18 Z" fill="#c3d3ea" stroke="#eef5ff" stroke-width="3" stroke-linejoin="round"/>
  `);

export const iconReset = (): string =>
  wrap(`
    <path d="M50 32 A18 18 0 1 1 44 18" stroke="#ffffff" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M46 6 L46 20 L32 20" stroke="#ffffff" stroke-width="7" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  `);

export const iconBack = (): string =>
  wrap(`
    <path d="M40 12 L20 32 L40 52" stroke="#ffffff" stroke-width="8" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  `);

export const iconSoundOn = (): string =>
  wrap(`
    <path d="M14 26 H24 L36 14 V50 L24 38 H14 Z" fill="#ffffff"/>
    <path d="M44 22 a12 12 0 0 1 0 20" stroke="#ffffff" stroke-width="5" fill="none" stroke-linecap="round"/>
  `);

export const iconSoundOff = (): string =>
  wrap(`
    <path d="M14 26 H24 L36 14 V50 L24 38 H14 Z" fill="#ffffff"/>
    <path d="M44 24 L56 40 M56 24 L44 40" stroke="#ffffff" stroke-width="5" stroke-linecap="round"/>
  `);

export const iconStar = (fill = '#ffd24a'): string =>
  wrap(
    `<path d="M32 6 L40 24 L60 26 L45 39 L49 58 L32 48 L15 58 L19 39 L4 26 L24 24 Z" fill="${fill}"/>`,
  );

export const iconPlay = (): string =>
  wrap(`<path d="M20 12 L52 32 L20 52 Z" fill="#ffffff"/>`);
