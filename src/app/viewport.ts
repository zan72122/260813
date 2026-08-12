import type { QualityTier, ViewportProfile } from '../core';

/** DPR cap per QualityTier. Mobile-first: never exceed 2x even on high. */
const DPR_CAP: Record<QualityTier, number> = {
  low: 1,
  medium: 1.5,
  high: 2
};

export function capDprForTier(tier: QualityTier, rawDpr: number): number {
  const cap = DPR_CAP[tier];
  return Math.min(rawDpr, cap);
}

/**
 * Reads CSS env(safe-area-inset-*) via a zero-size probe element, since
 * those values are only available through computed style, not JS APIs.
 */
function readSafeArea(): ViewportProfile['safeArea'] {
  if (typeof document === 'undefined') {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }
  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.inset = '0';
  probe.style.pointerEvents = 'none';
  probe.style.visibility = 'hidden';
  probe.style.paddingTop = 'env(safe-area-inset-top, 0px)';
  probe.style.paddingBottom = 'env(safe-area-inset-bottom, 0px)';
  probe.style.paddingLeft = 'env(safe-area-inset-left, 0px)';
  probe.style.paddingRight = 'env(safe-area-inset-right, 0px)';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const safeArea = {
    top: parseFloat(style.paddingTop) || 0,
    bottom: parseFloat(style.paddingBottom) || 0,
    left: parseFloat(style.paddingLeft) || 0,
    right: parseFloat(style.paddingRight) || 0
  };
  probe.remove();
  return safeArea;
}

/** Computes the current ViewportProfile from window/document state, DPR-capped by tier. */
export function computeViewportProfile(tier: QualityTier): ViewportProfile {
  const width = window.innerWidth;
  const height = window.innerHeight;
  return {
    width,
    height,
    dpr: capDprForTier(tier, window.devicePixelRatio || 1),
    orientation: width >= height ? 'landscape' : 'portrait',
    safeArea: readSafeArea()
  };
}
