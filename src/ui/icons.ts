/** Hand-drawn SVG artwork. No emoji, no placeholder glyphs. */

export const speakerIcon = (level: number): string => `
<svg viewBox="0 0 40 40" aria-hidden="true">
  <path d="M8 15h6l7-6v22l-7-6H8z" fill="#f0a63c" stroke="#8a5a12" stroke-width="2.2" stroke-linejoin="round"/>
  ${
    level >= 1
      ? '<path d="M25 15.5c2.2 2.4 2.2 6.6 0 9" fill="none" stroke="#8a5a12" stroke-width="2.6" stroke-linecap="round"/>'
      : ''
  }
  ${
    level >= 2
      ? '<path d="M29.5 11.5c4.2 4.4 4.2 12.6 0 17" fill="none" stroke="#8a5a12" stroke-width="2.6" stroke-linecap="round"/>'
      : ''
  }
  ${
    level <= 0
      ? '<path d="M26 15l9 10M35 15l-9 10" stroke="#c94b4b" stroke-width="3" stroke-linecap="round"/>'
      : ''
  }
</svg>`

export const motionIcon = (calm: boolean): string =>
  calm
    ? `<svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M6 24h28" stroke="#4a90c2" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M6 30h28" stroke="#9dc9e2" stroke-width="3.4" stroke-linecap="round"/>
        <circle cx="20" cy="14" r="6" fill="#ffd166" stroke="#8a5a12" stroke-width="2.2"/>
      </svg>`
    : `<svg viewBox="0 0 40 40" aria-hidden="true">
        <path d="M6 26c4-7 8 7 12 0s8 7 12 0" fill="none" stroke="#4a90c2" stroke-width="3.4" stroke-linecap="round"/>
        <circle cx="20" cy="13" r="6" fill="#ffd166" stroke="#8a5a12" stroke-width="2.2"/>
        <path d="M30 7l1.6 3.4L35 12l-3.4 1.6L30 17l-1.6-3.4L25 12l3.4-1.6z" fill="#ff9ec4"/>
      </svg>`

export const homeIcon = (): string => `
<svg viewBox="0 0 40 40" aria-hidden="true">
  <rect x="6" y="17" width="28" height="15" rx="3" fill="#e8cf9a" stroke="#8a5a12" stroke-width="2.2"/>
  <path d="M6 22c5 3 9-3 14 0s9-3 14 0" fill="none" stroke="#4aa8d8" stroke-width="2.6" stroke-linecap="round"/>
  <path d="M13 17V9h5v3h4V9h5v8" fill="#cfc3ad" stroke="#8a5a12" stroke-width="2.2" stroke-linejoin="round"/>
</svg>`

const sandboxFrame = (): string => `
  <rect x="2" y="10" width="156" height="106" rx="12" fill="#c98d55"/>
  <rect x="10" y="18" width="140" height="90" rx="7" fill="#ecd7a6"/>
`

const castleArt = (x: number, y: number, s: number, lively: boolean): string => `
  <g transform="translate(${x} ${y}) scale(${s})">
    <ellipse cx="0" cy="15" rx="30" ry="10" fill="#4aa8d8" opacity="${lively ? 0.95 : 0.25}"/>
    <ellipse cx="0" cy="14" rx="21" ry="7" fill="#e0cba0"/>
    <rect x="-13" y="-14" width="26" height="26" fill="#cfc3ad" stroke="#9c8f78" stroke-width="1.6"/>
    <rect x="-17" y="-18" width="34" height="6" fill="#b8ab93"/>
    <polygon points="0,-34 15,-16 -15,-16" fill="#f48fb1"/>
    <rect x="-22" y="-8" width="9" height="20" fill="#cfc3ad" stroke="#9c8f78" stroke-width="1.4"/>
    <polygon points="-17.5,-20 -10,-8 -25,-8" fill="#7fc8e8"/>
    <rect x="13" y="-8" width="9" height="20" fill="#cfc3ad" stroke="#9c8f78" stroke-width="1.4"/>
    <polygon points="17.5,-20 25,-8 10,-8" fill="#ffd166"/>
    <line x1="0" y1="-34" x2="0" y2="-44" stroke="#8a5c37" stroke-width="2"/>
    <path d="M0 -44 l10 3 -10 3z" fill="${lively ? '#ff7fb0' : '#c9bda6'}"/>
  </g>
`

/** Card 1 — play the same sandbox again. */
export const cardSame = (): string => `
<svg viewBox="0 0 160 126" aria-hidden="true">
  ${sandboxFrame()}
  <path d="M18 84 C 48 84, 62 56, 96 52" stroke="#4aa8d8" stroke-width="11" fill="none" stroke-linecap="round"/>
  <path d="M18 84 C 48 84, 62 56, 96 52" stroke="#8fd8f0" stroke-width="5" fill="none" stroke-linecap="round"/>
  <circle cx="20" cy="86" r="8" fill="#b9b2a4" stroke="#8f887a" stroke-width="2"/>
  ${castleArt(112, 52, 0.82, true)}
  <g transform="translate(80 108)">
    <path d="M-16 0 a16 16 0 1 1 6 12" fill="none" stroke="#5aa64a" stroke-width="6" stroke-linecap="round"/>
    <path d="M-14 -10 l-3 12 12 -2z" fill="#5aa64a"/>
  </g>
</svg>`

/** Card 2 — a different sandbox. */
export const cardNew = (): string => `
<svg viewBox="0 0 160 126" aria-hidden="true">
  ${sandboxFrame()}
  <ellipse cx="52" cy="80" rx="26" ry="13" fill="#dcc08a"/>
  <ellipse cx="86" cy="46" rx="20" ry="10" fill="#dcc08a"/>
  <circle cx="22" cy="88" r="8" fill="#b9b2a4" stroke="#8f887a" stroke-width="2"/>
  ${castleArt(112, 54, 0.8, false)}
  <g transform="translate(46 34)">
    <path d="M0 -14 l4 9 9 4 -9 4 -4 9 -4 -9 -9 -4 9 -4z" fill="#ffd166" stroke="#e8a83a" stroke-width="1.6"/>
  </g>
  <g transform="translate(120 96)">
    <path d="M0 -9 l2.6 6 6 2.6 -6 2.6 -2.6 6 -2.6 -6 -6 -2.6 6 -2.6z" fill="#ff9ec4"/>
  </g>
</svg>`

/** Card 3 — free play. */
export const cardFree = (): string => `
<svg viewBox="0 0 160 126" aria-hidden="true">
  ${sandboxFrame()}
  <ellipse cx="80" cy="74" rx="58" ry="24" fill="#e3caa0"/>
  ${castleArt(116, 56, 0.66, false)}
  <g transform="translate(40 66) rotate(-18)">
    <rect x="-3.4" y="-30" width="6.8" height="30" rx="3" fill="#ff8ab5"/>
    <rect x="-9" y="-34" width="18" height="6" rx="3" fill="#e05f92"/>
    <path d="M-11 0 h22 l-4 16 h-14z" fill="#dff0fa" stroke="#9fc6dd" stroke-width="2"/>
  </g>
  <g transform="translate(72 78) rotate(12)">
    <rect x="-16" y="-12" width="26" height="20" rx="7" fill="#6fc7ea" stroke="#3f9fca" stroke-width="2"/>
    <rect x="-16" y="-5" width="26" height="4" fill="#ff9ec4"/>
    <path d="M10 -8 l12 -8 3 4 -11 9z" fill="#3f9fca"/>
    <path d="M-16 -12 a10 10 0 0 1 -10 10" fill="none" stroke="#3f9fca" stroke-width="3"/>
  </g>
</svg>`

/** The banner at the top of the picture menu. */
export const finishedBanner = (): string => `
<svg viewBox="0 0 240 96" aria-hidden="true" class="crown">
  <path d="M8 78 C 60 78, 84 44, 150 40" stroke="#3f9fca" stroke-width="14" fill="none" stroke-linecap="round"/>
  <path d="M8 78 C 60 78, 84 44, 150 40" stroke="#8fd8f0" stroke-width="7" fill="none" stroke-linecap="round"/>
  ${castleArt(186, 46, 1.05, true)}
  <g transform="translate(40 26)">
    <path d="M0 -12 l3.4 7.6 7.6 3.4 -7.6 3.4 -3.4 7.6 -3.4 -7.6 -7.6 -3.4 7.6 -3.4z" fill="#ffd166"/>
  </g>
  <g transform="translate(96 16)">
    <path d="M0 -9 l2.6 6 6 2.6 -6 2.6 -2.6 6 -2.6 -6 -6 -2.6 6 -2.6z" fill="#ff9ec4"/>
  </g>
</svg>`

export const loadingArt = (): string => `
<svg viewBox="0 0 100 100" class="spin" aria-hidden="true">
  <circle cx="50" cy="50" r="34" fill="none" stroke="#d8b881" stroke-width="10"/>
  <path d="M50 16 a34 34 0 0 1 34 34" fill="none" stroke="#4aa8d8" stroke-width="10" stroke-linecap="round"/>
</svg>`
