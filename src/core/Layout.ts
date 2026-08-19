import { clamp01, smoothstep } from './math';

/**
 * Turns the viewport into the handful of numbers the rest of the game needs.
 *
 * `wide` is a 0..1 blend (0 = tall phone portrait, 1 = wide landscape) so every
 * camera shot can be authored twice and cross-faded rather than hard-switched.
 * That is what keeps a device rotation from ever snapping the picture.
 */
export class Layout {
  width = 1;
  height = 1;
  aspect = 1;
  /** 0 = portrait framing, 1 = landscape framing. */
  wide = 0;
  /** 0 = phone, 1 = tablet-sized viewport. */
  big = 0;
  portrait = true;

  update() {
    const w = window.innerWidth || document.documentElement.clientWidth || 1;
    const h = window.innerHeight || document.documentElement.clientHeight || 1;
    this.width = w;
    this.height = h;
    this.aspect = w / h;
    this.portrait = h >= w;
    this.wide = smoothstep(0.82, 1.22, this.aspect);
    this.big = clamp01((Math.min(w, h) - 380) / 340);
    return this;
  }
}
