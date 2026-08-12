# INTERACTION_SPEC — input, hints, camera

**Frozen.**

## Input rules

- Pointer Events only (`pointerdown/move/up/cancel`), single active pointer; ignore
  extra touches while one is active.
- Gesture set: **tap, drag, long-swipe, trace, hold**. Never require pinch, two-finger
  rotate, or precision.
- Primary touch targets ≥ 72 CSS px (hit areas in 3D via generous raycast-sphere
  padding; HTML buttons via min-size).
- During any drag/trace the camera is LOCKED. Camera moves only between interactions.
- Never cut the camera at the moment cause→effect lands (toy entering basket, mat
  unrolling, curtain closing must stay on screen).
- Wrong action = soft, comedic, self-reversing (toy floats back, chair shakes head).
  No buzzers, no red X, no game over, no timer, no score, no stars.

## Intent inference (be generous)

- Basket capture radius ≈ 2.2× basket visual radius; while dragging, the matching
  basket glows softly and leans toward the toy.
- A drop in dead space: toy plops where dropped (stays draggable).
- Drop within capture radius of correct basket even with sloppy aim → success.
- Mat placement markers likewise oversized; near-enough snaps.

## Hint escalation (per pending objective, reset on interaction)

- 3 s idle → the current target object does a small wiggle + soft chime.
- 7 s idle → a ghost hand/finger trail animates the expected gesture (e.g. draws the
  drag path from toy to basket), loops every ~6 s until the player acts.
- Hints are visual+audio only, never text.

## Camera chain (fixed shots, tweened between; portrait & landscape each hand-tuned —
separate position/target/FOV/UI layout per orientation, not just aspect change)

1. **Overview** — elevated 3/4 dollhouse view, front wall cut away; whole room legible.
   Used for TITLE, phase transitions, REPLAY.
2. **Cleanup cam** — slightly top-down over the play area; toys, finger, and baskets
   all visible; toys never fully occluded by the finger (targets sit above finger
   contact point by offsetting drag proxy upward ~40 px).
3. **Transform cam** — slow lateral wide shot while furniture moves; no cuts mid-move.
4. **Mat cam** — low, near-floor angle; swipe direction on screen matches unroll
   direction in world; after unroll, pull back wide to show the row of mats.
5. **Nap reveal** — pull back + slight rise; darkened warm room vs. remembered bright
   room; stars visible.
6. Wake: reverse to Overview, matching TITLE framing for before/after.

## Orientation & resize

- Both orientations fully playable at any point; rotating mid-phase preserves all
  game state (FSM state lives outside renderer).
- `resize`/`orientationchange` → re-pick the orientation-specific camera preset for
  the current shot, resize renderer with DPR cap.
- safe-area-insets respected for all HTML UI (env(safe-area-inset-*)).

## HTML overlay UI (icons only, no text required)

- Top corner (safe-area aware): mute toggle (speaker icon), reduced-motion toggle
  (sparkle icon with slash). Both ≥ 72 px, high contrast, persist to localStorage.
- Phase progress: a small sun-arc day dial (morning→noon→nap→afternoon) purely
  decorative/orienting, non-interactive.
- REPLAY: three large picture cards (see PRODUCT_SPEC Scene 7).
- Title: single giant play button. Nothing else clickable.

## Accessibility & safety

- `prefers-reduced-motion` OR in-game toggle → shorten/simplify camera tweens,
  disable particles and wiggle hints (keep ghost-trail hints, slower), no parallax idle.
- No flashing above 3 Hz anywhere. Low-stimulation particle defaults.
- Children NPCs never carry furniture; teacher NPC does (or furniture glides on rails
  as a game abstraction directed by the finger).
