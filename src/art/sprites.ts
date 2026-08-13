/** Inline SVG for the two tools. Kept tiny so they scale crisply on any screen. */

export const ROLLER_SVG = `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
  <defs>
    <linearGradient id="rg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fff6a8"/>
      <stop offset="35%" stop-color="#ff7fd0"/>
      <stop offset="65%" stop-color="#8ad4ff"/>
      <stop offset="100%" stop-color="#a6ffd8"/>
    </linearGradient>
  </defs>
  <path d="M74 30 L96 12 A6 6 0 0 1 104 20 L86 42" stroke="#ffe08a" stroke-width="11"
        stroke-linecap="round" fill="none"/>
  <rect x="10" y="34" width="78" height="46" rx="23" fill="url(#rg)"
        stroke="#fff" stroke-width="5"/>
  <ellipse cx="26" cy="57" rx="9" ry="18" fill="rgba(255,255,255,0.55)"/>
  <circle cx="60" cy="47" r="4.5" fill="rgba(255,255,255,0.85)"/>
  <circle cx="72" cy="66" r="3.5" fill="rgba(255,255,255,0.7)"/>
</svg>`;

export const PRESS_SVG = `
<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
  <defs>
    <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#fff3b0"/>
      <stop offset="100%" stop-color="#ff9f43"/>
    </linearGradient>
  </defs>
  <rect x="44" y="6" width="32" height="30" rx="14" fill="url(#pg)" stroke="#fff" stroke-width="4"/>
  <rect x="52" y="30" width="16" height="26" fill="#ffd85e" stroke="#fff" stroke-width="3"/>
  <rect x="16" y="54" width="88" height="30" rx="12" fill="url(#pg)" stroke="#fff" stroke-width="5"/>
  <path d="M60 62 L64.5 72 L75 72 L66.5 78.5 L70 89 L60 82.5 L50 89 L53.5 78.5 L45 72 L55.5 72 Z"
        fill="#fff" opacity="0.92"/>
</svg>`;
