// src/render/cameraCompose.ts
// Pure per-aspect camera composition data + the eased-blend math that turns
// "current op/target world points" into a camera position/lookAt/fov. Kept
// free of THREE.Camera/DOM so the composition table and easing curve are
// unit-testable; render/camera.ts applies the result to a real camera.
//
// Each shot orbits a `center` point (an op/target blend) using standard
// spherical coordinates (distance, elevation, azimuth measured from world
// +Z, which points away from the Paris backdrop at -Z) — deliberately not
// relative to the op->target axis, which degenerates unpredictably whenever
// op and target nearly coincide (e.g. early-game establish shots where the
// tower is still short).

import type { CameraCueName } from '../contracts/types';

export type AspectClass = 'portrait' | 'landscape';

export interface CameraShot {
  distance: number;
  /** Radians above the horizontal plane. Small/near-zero for the low climb shot. */
  elevation: number;
  /** Radians around world +Y from +Z (0 = camera directly on the +Z/away-from-Paris side). */
  azimuth: number;
  /** 0..1 blend between op (0) and target (1) for both the orbit center and lookAt point. */
  blend: number;
  /** Extra lookAt height offset (world units), e.g. "look slightly up". */
  lookAtHeightOffset: number;
  fov: number;
}

const PORTRAIT: Record<CameraCueName, CameraShot> = {
  // R1: pulled back + reframed so the FULL structure (splayed/curved base
  // through the bare "unfinished top" protrusion above the working
  // platform) fits in one shot instead of just the working platform —
  // blend lowered (weights the orbit center toward towerAxis, near the
  // base) and lookAtHeightOffset raised so the look-at point sits well
  // above craneTop, leaving headroom for the protrusion + sky.
  establish: { distance: 34, elevation: 0.27, azimuth: 0.55, blend: 0.35, lookAtHeightOffset: 4.5, fov: 58 },
  // R3: op is now `towerAxis` (see camera.ts's focusFor comment) — the
  // hook/beam ride the boom's reach, which sits almost exactly between the
  // operating leg's own radius at ground level and at platform height, so
  // ANY orbit collapsed near the load put that leg directly between camera
  // and load for nearly the whole hookDown/hoist drag (verified with a
  // real-gesture screenshot sequence AND an anchor-position sweep: the leg
  // filled the entire frame at every azimuth/elevation tried while
  // orbiting near the load). blend=0 anchors the shot fully on the safe,
  // always-clear axis point instead; distance/fov are sized (verified via
  // window.__game.anchors() across the full hookDown/hoist arc, both
  // extremes and mid-travel) so hook+beam+ghost all stay on-screen too.
  approach: { distance: 21, elevation: 0.32, azimuth: 0.5, blend: 0, lookAtHeightOffset: 0.6, fov: 74 },
  hoist: { distance: 21, elevation: 0.32, azimuth: 0.5, blend: 0, lookAtHeightOffset: 0.6, fov: 74 },
  // R3 (align-entry robustness): widened from the original 5.7/44° — with
  // the wider hoist shot above, the beam can land meaningfully far from the
  // ghost slot in world space by the time hoist finishes; align's own
  // close-up (which tracks the midpoint between beam and ghost) is a fixed
  // orbit, not a per-drag auto-frame, so if beam starts far enough from
  // ghost it can itself project OFF the canvas at the old tight distance —
  // confirmed via window.__game.anchors() (beam.y beyond the viewport
  // height) and the real full-loop E2E hanging on "align: never snapped"
  // because a drag gesture starting at an off-canvas anchor position never
  // registers. Widened distance/fov gives enough margin that both beam and
  // ghost stay on-screen through the whole drag in both aspects.
  align: { distance: 16, elevation: 0.16, azimuth: 0.45, blend: 0.5, lookAtHeightOffset: 0.1, fov: 78 },
  // Integrator (Wave 4) fix: the rivet relay's four interactive stations
  // (forge / tongs / rivetHole / hammerSpot) span ~2.3 world units, but this
  // single shot has to hold all of them in frame across rivetHeat/Carry/
  // Insert/Hammer/Cool (one continuous "macro" cue per camera.ts's
  // PHASE_CUE_MAP — not redesigned here). At the original distance:fov
  // (3.6:44) the portrait frustum was far too narrow: 'tongs'/'rivetHole'
  // projected off-screen during real play (verified via window.__game.
  // anchors()), making rivetCarry/rivetInsert undrivable by real touch.
  // Widened fov (kept distance < align's 5.2 so the "closest shot" unit
  // test still holds) until every station anchor stays on-screen with
  // margin across all 4 E2E viewport projects.
  rivetMacro: { distance: 5.6, elevation: 1.2, azimuth: 0.25, blend: 0.62, lookAtHeightOffset: 0.15, fov: 54 },
  // R4: op=target=craneBase now (see camera.ts's focusFor) — a real side-
  // elevation of the carriage, not a from-underneath crop. Elevation raised
  // off near-zero (was 0.06, i.e. dead level with the carriage, which is
  // what produced the "looking up from directly below" read) so the wheels
  // read as wheels-on-rails, and lookAtHeightOffset lifts the frame a touch
  // so the carriage sits mid-frame with headroom for the boiler/steam above.
  climb: { distance: 13, elevation: 0.2, azimuth: -0.75, blend: 0.5, lookAtHeightOffset: 0.7, fov: 50 },
  // R1/R4: same pull-back logic as establish — reveal is the "look, it's a
  // level taller now" beat, so the WHOLE tower (old top + new band + the
  // unfinished protrusion above that) must fit in frame for the before/
  // after height comparison to read.
  reveal: { distance: 34, elevation: 0.26, azimuth: 0.5, blend: 0.35, lookAtHeightOffset: 4.5, fov: 58 },
  complete: { distance: 32, elevation: 0.28, azimuth: 0.55, blend: 0.37, lookAtHeightOffset: 4, fov: 56 },
};

const LANDSCAPE: Record<CameraCueName, CameraShot> = {
  // See the portrait establish comment above — same pull-back/reframe.
  establish: { distance: 38, elevation: 0.24, azimuth: 0.5, blend: 0.35, lookAtHeightOffset: 4.5, fov: 50 },
  // See the portrait approach/hoist comment above — same towerAxis-anchored fix.
  approach: { distance: 26, elevation: 0.27, azimuth: 0.42, blend: 0, lookAtHeightOffset: 0.6, fov: 68 },
  hoist: { distance: 26, elevation: 0.27, azimuth: 0.42, blend: 0, lookAtHeightOffset: 0.6, fov: 68 },
  // See the portrait align comment above — same off-canvas-beam fix, landscape numbers.
  align: { distance: 21, elevation: 0.14, azimuth: 0.4, blend: 0.5, lookAtHeightOffset: 0.1, fov: 76 },
  // See the portrait rivetMacro comment above — same fix, landscape numbers.
  rivetMacro: { distance: 5.2, elevation: 1.1, azimuth: 0.25, blend: 0.62, lookAtHeightOffset: 0.15, fov: 50 },
  // See the portrait climb comment above — same carriage side-elevation fix.
  climb: { distance: 7.5, elevation: 0.22, azimuth: 1.05, blend: 0.5, lookAtHeightOffset: 0.9, fov: 50 },
  reveal: { distance: 38, elevation: 0.23, azimuth: 0.45, blend: 0.35, lookAtHeightOffset: 4.5, fov: 50 },
  complete: { distance: 36, elevation: 0.25, azimuth: 0.5, blend: 0.37, lookAtHeightOffset: 4, fov: 48 },
};

export const CAMERA_COMPOSITIONS: Record<AspectClass, Record<CameraCueName, CameraShot>> = {
  portrait: PORTRAIT,
  landscape: LANDSCAPE,
};

export function aspectClassFor(width: number, height: number): AspectClass {
  return width >= height ? 'landscape' : 'portrait';
}

export function shotFor(cue: CameraCueName, width: number, height: number): CameraShot {
  return CAMERA_COMPOSITIONS[aspectClassFor(width, height)][cue];
}

/** Smoothstep-eased blend factor, 0..1, from elapsed/duration. */
export function easeProgress(elapsedMs: number, durationMs: number): number {
  if (durationMs <= 0) return 1;
  const t = Math.min(Math.max(elapsedMs / durationMs, 0), 1);
  return t * t * (3 - 2 * t);
}

/** Base transition duration (ms) before ?test=1 (x0.25) / reducedMotion (near-cut) scaling. */
export const BASE_TRANSITION_MS = 1200;
export const TEST_TIME_SCALE = 0.25;
export const REDUCED_MOTION_TRANSITION_MS = 150;

export function transitionDurationMs(testMode: boolean, reducedMotion: boolean): number {
  if (reducedMotion) return REDUCED_MOTION_TRANSITION_MS;
  return testMode ? BASE_TRANSITION_MS * TEST_TIME_SCALE : BASE_TRANSITION_MS;
}
