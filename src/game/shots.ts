import { biShot, Shot } from '../core/CameraDirector';
import { HOLES } from './config';
import { clamp01, lerp, smootherstep } from '../core/math';

/**
 * The camera story, authored twice - once for a tall phone and once for a wide
 * screen - and cross-faded by aspect ratio. Portrait leans into depth (the field
 * runs away from you); landscape leans into width (the field runs across you).
 *
 * Nothing here spins, whip-pans or changes FOV quickly. Small children get
 * motion sick fast, so every move is a slow dolly, crane or push.
 */

/** The flower the close-up watches: the far end of the row, away from the gate. */
const HERO = HOLES[HOLES.length - 1];

export const SHOTS: Record<string, Shot> = {

  /** Scene 1: an empty brown field. Deliberately unremarkable. */
  intro: biShot(
    { pos: [0.45, 1.85, 4.60], look: [0, 0.34, 0.55], fov: 60 },
    { pos: [0.85, 1.60, 4.10], look: [0, 0.28, 0.45], fov: 50 },
    (s, life) => {
      const t = smootherstep(0, 4.5, life);
      s.pos.z -= t * 1.10;
      s.pos.y -= t * 0.55;
      s.look.z -= t * 0.18;
    },
  ),

  /** Scene 2: hands-on. The bed fills the frame; the basket sits within reach. */
  plant: biShot(
    { pos: [0, 1.05, 2.30], look: [0, 0.12, 0.26], fov: 62 },
    { pos: [-0.16, 0.82, 1.86], look: [-0.14, 0.16, 0.22], fov: 52 },
    (s, life) => {
      // an almost imperceptible drift keeps the shot from feeling frozen
      s.pos.x += Math.sin(life * 0.22) * 0.03;
    },
  ),

  /** Scene 3 + 4: the cut-away. Bulbs below, channel and gate above. */
  section: biShot(
    { pos: [0, 0.74, 2.42], look: [0, -0.34, -0.06], fov: 62 },
    { pos: [0, 0.34, 2.62], look: [0, -0.28, -0.06], fov: 46 },
  ),

  /** Water reaching down through the soil - a small push in. */
  seep: biShot(
    { pos: [0, 0.62, 2.28], look: [0, -0.26, -0.06], fov: 60 },
    { pos: [0, 0.30, 2.42], look: [0, -0.22, -0.06], fov: 44 },
  ),

  /** Scene 5: roots down, shoot up. The look-at rides the growing tip. */
  grow: biShot(
    { pos: [0, 0.48, 2.20], look: [0, -0.30, -0.06], fov: 60 },
    { pos: [0, 0.26, 2.34], look: [0, -0.24, -0.06], fov: 44 },
    (s, life) => {
      const t = smootherstep(0.6, 3.4, life);
      s.look.y = lerp(-0.30, 0.02, t);
      s.pos.y = lerp(s.pos.y, s.pos.y + 0.22, t);
    },
  ),

  /** Scene 6: continuous climb out of the trench to ground level. */
  surface: biShot(
    { pos: [0, 0.50, 1.30], look: [0, 0.14, -0.02], fov: 60 },
    { pos: [0, 0.40, 1.10], look: [0, 0.12, -0.02], fov: 47 },
    (s, life) => {
      const t = smootherstep(0, 2.6, life);
      s.pos.y += t * 0.10;
      s.look.y += t * 0.05;
    },
  ),

  /** Scene 7a: one flower, at a child's eye height, filling the frame. */
  firstBloom: biShot(
    { pos: [HERO.x - 0.40, 0.34, 1.14], look: [HERO.x, 0.30, HERO.z], fov: 50 },
    { pos: [HERO.x - 0.56, 0.31, 0.82], look: [HERO.x, 0.29, HERO.z], fov: 36 },
    (s, life) => {
      const t = smootherstep(0, 5.0, life);
      // ease in towards the bud as it swells, then hold
      s.pos.z = lerp(s.pos.z, s.pos.z - 0.30, t);
      s.pos.y = lerp(s.pos.y, s.pos.y + 0.05, t);
    },
  ),

  /** Scene 7b: ride the bloom wave outwards, still low among the flowers. */
  wave: biShot(
    { pos: [0.1, 0.46, 1.35], look: [0, 0.30, -2.4], fov: 66 },
    { pos: [0.1, 0.40, 1.15], look: [0, 0.26, -2.2], fov: 56 },
    (s, life) => {
      const t = clamp01(life / 9);
      const e = smootherstep(0, 1, t);
      s.pos.y += e * 1.15;
      s.pos.z -= e * 1.4;
      s.look.z -= e * 7.0;
      s.look.y += e * 0.35;
    },
  ),

  /**
   * Scene 8: the reward. Skim the flower tops, then crane up and pull back so
   * the field opens all at once, then hold still and let them look.
   */
  reveal: biShot(
    { pos: [0.15, 0.42, 1.30], look: [0, 0.34, -3.0], fov: 62 },
    { pos: [0.15, 0.38, 1.10], look: [0, 0.30, -3.0], fov: 55 },
    (s, life, wide) => {
      // 0 - 1.6s  drift forward between the front flowers
      const glide = smootherstep(0, 1.8, life);
      s.pos.z -= glide * 1.1;
      s.pos.y += glide * 0.06;

      // 1.6 - 6.0s  crane up and pull back: the whole field arrives at once
      const crane = smootherstep(1.6, 6.4, life);
      s.pos.y += crane * lerp(12.6, 10.6, wide);
      s.pos.z += crane * lerp(11.0, 9.6, wide);
      s.look.z -= crane * lerp(34.0, 30.0, wide);
      s.look.y += crane * 2.2;
      s.fov += crane * lerp(6.0, 4.0, wide);

      // 6.4s+  hold, with the slowest possible drift so it still breathes
      const hold = Math.max(0, life - 6.4);
      s.pos.y += hold * 0.10;
      s.pos.z += hold * 0.16;
    },
  ),

  /** Afterwards: a slow, calm hover while the menu is up. */
  end: biShot(
    { pos: [0.15, 13.4, 12.6], look: [0, 2.9, -32.0], fov: 68 },
    { pos: [0.15, 11.4, 11.0], look: [0, 2.7, -29.0], fov: 59 },
    (s, life) => {
      s.pos.x += Math.sin(life * 0.10) * 1.6;
      s.pos.y += Math.sin(life * 0.07) * 0.5;
      s.look.x += Math.sin(life * 0.10 + 1.2) * 1.2;
    },
  ),
};
