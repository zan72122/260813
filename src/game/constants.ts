// src/game/constants.ts — Gameplay owner. Tunable numbers, one place to change feel.
// Millisecond values are "scripted timing" and get run through ctx.scaleMs()
// (x0.25 under ?test=1) wherever used; physical-gesture constants (tap/swipe
// classification, hammer debounce) are NOT scaled — they model a real finger.

export const OPENING_DURATION_MS = 2500;

export const HOOK_DRAG_RANGE_PX = 260; // finger travel to fully lower the hook
export const HOOK_FINGER_OFFSET_Y = 80; // visual hook target sits above the finger
export const HOOK_SNAP_PADDING = 40;
export const HOOK_FALLBACK_DEPTH = 0.96; // used only if no 'beam' anchor is published yet
export const HOOK_ATTACH_BEAT_MS = 600;

export const HOIST_RATE = 0.35; // per spec: raise rate = upward input velocity * 0.35
export const HOIST_HEIGHT_RANGE_PX = 480; // upward px (at rate=1) to fill the gauge
export const HOIST_EASE_DOWN_PER_S = 0.02; // small allowed passive ease-down while idle

export const ALIGN_FALLBACK_TARGET = { x: 220, y: 160 };
export const ALIGN_SNAP_FALLBACK_R = 90;
export const ALIGN_SNAP_RATIO = 0.9; // snapR = 45% of ghost *width* = 0.9 * ghost.r
export const ALIGN_HOLD_MS = 1000;

export const BOLT_HIT_PADDING = 36;
export const HOLE_SNAP_R = 80; // >= 72px per spec

export const RIVET_HEAT_DURATION_MS = 1200;
export const RIVET_HEAT_TAP_PULSE_MS = 150;
export const RIVET_COOL_DURATION_MS = 1500;
export const RIVET_HAMMER_DEBOUNCE_MS = 250; // physical tap timing — not scaled
export const RIVET_FORGE_PAD = 36;
export const RIVET_INSERT_PAD = 36;
export const RIVET_HAMMER_PAD = 36;

export const SLING_SLACK_MS = 500;
export const SLING_CLASP_PAD = 36;

export const CLIMB_LEVER_RANGE_PX = 220; // finger travel to fully raise the lever
export const CLIMB_LEVER_ACTIVE_THRESHOLD = 0.15;
export const CLIMB_PROGRESS_RATE_PER_S = 0.5; // at lever=1, fills in ~2s
export const CLIMB_SETTLE_MS = 600;

export const REVEAL_DURATION_MS = 2500;

export const IDLE_BREATHE_MS = 3000;
export const IDLE_POINT_MS = 5000;
