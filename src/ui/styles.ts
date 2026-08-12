// src/ui/styles.ts
// Injects the overlay's CSS once (idempotent). Respects safe-area insets and
// stays usable across all four ACCEPTANCE viewports (390x844, 844x390,
// 820x1180, 1180x820) via relative sizing + flex-wrap, no fixed large blocks.

const STYLE_ELEMENT_ID = 'versailles-ui-styles';

const CSS = `
#versailles-ui {
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 20;
  font-family: system-ui, sans-serif; /* not used for visible text — icons only */
}

.vui-settings {
  position: absolute;
  top: calc(env(safe-area-inset-top, 0px) + 10px);
  right: calc(env(safe-area-inset-right, 0px) + 10px);
  display: flex;
  gap: 10px;
  pointer-events: none;
}

.vui-btn {
  pointer-events: auto;
  width: 46px;
  height: 46px;
  min-width: 44px;
  min-height: 44px;
  border-radius: 50%;
  border: none;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 2px 8px rgba(10, 26, 47, 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 9px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
}

.vui-btn:active {
  transform: scale(0.92);
}

.versailles-reduce-motion .vui-btn {
  transition: none;
}
.vui-btn {
  transition: transform 120ms ease-out;
}

.vui-replay {
  position: absolute;
  inset: 0;
  display: none;
  align-items: center;
  justify-content: center;
  padding: calc(env(safe-area-inset-top, 0px) + 16px) calc(env(safe-area-inset-right, 0px) + 16px)
    calc(env(safe-area-inset-bottom, 0px) + 16px) calc(env(safe-area-inset-left, 0px) + 16px);
  background: rgba(10, 26, 47, 0.35);
  pointer-events: none;
}

.vui-replay.vui-visible {
  display: flex;
  pointer-events: auto;
}

.vui-replay-row {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  align-items: center;
  justify-content: center;
  max-width: 100%;
  max-height: 100%;
  overflow: auto;
}

.vui-choice {
  pointer-events: auto;
  width: min(30vw, 120px);
  height: min(30vw, 120px);
  min-width: 88px;
  min-height: 88px;
  border-radius: 20px;
  border: none;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 4px 14px rgba(10, 26, 47, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 18px;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  cursor: pointer;
}

.vui-choice:active {
  transform: scale(0.94);
}
`;

/** Injects the overlay stylesheet once per document. Safe to call repeatedly. */
export function ensureUiStyles(): void {
  if (document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ELEMENT_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}
