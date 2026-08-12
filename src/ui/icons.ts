/** Inline SVG icons — the entire game is icon-only, no text required to play. */

export const ICONS = {
  play: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="48" fill="#F7D97B"/>
    <circle cx="50" cy="50" r="48" fill="none" stroke="#FAF3E7" stroke-width="3" opacity="0.6"/>
    <path d="M42 33 L70 50 L42 67 Z" fill="#FAF3E7"/>
  </svg>`,

  speakerOn: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 40 H34 L54 24 V76 L34 60 H20 Z" fill="currentColor"/>
    <path d="M64 36 Q74 50 64 64" stroke="currentColor" stroke-width="7" stroke-linecap="round" fill="none"/>
    <path d="M72 26 Q90 50 72 74" stroke="currentColor" stroke-width="7" stroke-linecap="round" fill="none" opacity="0.7"/>
  </svg>`,

  speakerOff: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 40 H34 L54 24 V76 L34 60 H20 Z" fill="currentColor"/>
    <path d="M66 38 L86 62 M86 38 L66 62" stroke="currentColor" stroke-width="7" stroke-linecap="round"/>
  </svg>`,

  sparkle: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 18 L58 42 L82 50 L58 58 L50 82 L42 58 L18 50 L42 42 Z" fill="currentColor"/>
  </svg>`,

  sparkleSlash: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 18 L58 42 L82 50 L58 58 L50 82 L42 58 L18 50 L42 42 Z" fill="currentColor"/>
    <path d="M22 22 L78 78" stroke="currentColor" stroke-width="8" stroke-linecap="round"/>
  </svg>`,

  sun: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="18" fill="#F7D97B"/>
    <g stroke="#F7D97B" stroke-width="6" stroke-linecap="round">
      <line x1="50" y1="10" x2="50" y2="22"/>
      <line x1="50" y1="78" x2="50" y2="90"/>
      <line x1="10" y1="50" x2="22" y2="50"/>
      <line x1="78" y1="50" x2="90" y2="50"/>
      <line x1="21" y1="21" x2="29" y2="29"/>
      <line x1="71" y1="71" x2="79" y2="79"/>
      <line x1="79" y1="21" x2="71" y2="29"/>
      <line x1="29" y1="71" x2="21" y2="79"/>
    </g>
  </svg>`,

  replaySameDay: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="52" r="30" fill="#F7D97B"/>
    <path d="M32 30 A30 30 0 1 1 30 60" stroke="#FAF3E7" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M22 20 L32 30 L20 34 Z" fill="#FAF3E7"/>
  </svg>`,

  shuffle: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="24" y="24" width="52" height="52" rx="12" fill="#8EC9EB"/>
    <circle cx="38" cy="38" r="5" fill="#FAF3E7"/>
    <circle cx="62" cy="38" r="5" fill="#FAF3E7"/>
    <circle cx="50" cy="50" r="5" fill="#FAF3E7"/>
    <circle cx="38" cy="62" r="5" fill="#FAF3E7"/>
    <circle cx="62" cy="62" r="5" fill="#FAF3E7"/>
  </svg>`,

  house: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 18 L86 48 V82 H14 V48 Z" fill="#8FD6C0"/>
    <rect x="42" y="58" width="16" height="24" fill="#FAF3E7"/>
  </svg>`,

  toybox: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="18" y="42" width="64" height="40" rx="8" fill="#F2857E"/>
    <path d="M18 42 L28 24 H72 L82 42 Z" fill="#F7D97B"/>
  </svg>`,

  bowl: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M20 46 H80 A30 26 0 0 1 20 46 Z" fill="#8EC9EB"/>
    <rect x="30" y="30" width="40" height="10" rx="5" fill="#C9A876"/>
  </svg>`,

  moon: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M64 20 A34 34 0 1 0 64 80 A26 26 0 0 1 64 20 Z" fill="#8FA8D6"/>
    <circle cx="72" cy="34" r="3" fill="#FAF3E7"/>
    <circle cx="78" cy="52" r="2" fill="#FAF3E7"/>
  </svg>`,

  back: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="46" fill="#F2857E"/>
    <path d="M58 30 L38 50 L58 70" stroke="#FAF3E7" stroke-width="8" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  </svg>`,
} as const;

export type IconName = keyof typeof ICONS;
