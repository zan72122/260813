# PRODUCT_SPEC — へんしん！いちにち保育室

**Frozen.** Changes require a DECISIONS.md entry.

## One-line

One 3D nursery room transforms under the player's finger through a full day:
playroom → lunch room → nap room → back to playroom. Target player: a 4-year-old
who cannot read. Play time 3–5 minutes. iPhone + iPad Safari, portrait and landscape,
touch-first (mouse works for dev).

The player's takeaway: 「おもちゃを片付けて、ごはんのお部屋にして、お昼寝のお部屋にして、元に戻した」.

## Non-goals

No minigame collection, no cooking game, no scoring, no timers, no fail states,
no text-dependent UI, no free camera, no backend/login/analytics/ads/payments.

## The three signature moments (polish budget goes here)

### A. Toys fly home to their baskets
Toys scattered on the floor are dragged to baskets marked with big picture symbols
(star / rainbow / flower). Near the correct basket the toy is magnetically pulled in,
lands with one soft bounce, plays a per-toy-material sound (wood / fabric / plastic),
and the basket does a happy wiggle. Generous intent inference: a drop anywhere in the
basket's wide capture radius succeeds; a drop near the *wrong* basket gently floats the
toy back to the floor (no penalty, no buzzer).

### B. The whole room becomes a lunch room
After toys are stored: 2–4 large finger operations (not one auto button):
1. Drag the low table out from the wall alcove (it glides on a rail — the teacher NPC
   visually does the pushing; the finger directs, the adult does the heavy work).
2. Tap chair stack → chairs hop out one by one and line up rhythmically.
3. Drag the tray cart handle → trays/placemats slide onto the table one per seat.
Light shifts slightly warmer, ambience changes to lunch sounds. Small finger motion,
big room change — amplification is the feeling.

### C. Nap mats unroll under a long swipe
After furniture is returned: rolled mats are carried (dragged) to floor markers, then a
long swipe unrolls each one — unroll progress follows the finger (scripted bone/scale
animation, NOT cloth sim). Then pillows/blankets snap to big picture markers, curtain
closes with a drag, light dims to warm dusk, soundscape goes quiet, faint stars glow on
the ceiling. This is the hero shot.

## Scene flow (FSM phases)

1. **TITLE** — full diorama of the finished playroom slowly idling; one giant pulsing
   play button (▶ inside a sun). Tap anywhere on it starts. First meaningful interaction
   < 10 s from load. No logo animation.
2. **PLAY_CLEANUP** — 7 toys on the floor, 3 baskets with symbols. Each stored toy makes
   the room a bit tidier. When all stored → arrow-of-light + teacher NPC gestures toward
   the table alcove → auto-advance.
3. **LUNCH_SETUP** — signature moment B. Then 4 child NPCs walk in and sit (shared rig,
   varied clothes/hair/skin/badge symbol). Short eating vignette (~8 s, auto), spoon
   sounds, no player cooking/feeding.
4. **LUNCH_CLEANUP** — drag trays back onto the cart (magnetic like toys); ONE big
   wipe-the-table trace gesture with a cloth (sparkle trail, satisfying squeak); tap
   table → teacher slides it back; chairs hop back to their stack.
5. **NAP_SETUP** — signature moment C. NPCs lie down and sleep (breathing = gentle
   scale animation; teacher NPC quietly watches over them in the background — player
   never does safety checks).
6. **WAKE_RESTORE** — drag curtain open → light floods in; swipe each mat to roll it
   back up (reverse of C, faster); mats hop onto the shelf; toy shelf pops toys back
   out onto the floor; room is a bright playroom again. Camera pulls to the same
   framing as TITLE for a clear before/after echo.
7. **REPLAY** — three big picture cards, no text needed to understand:
   - 🔁 sun rising again = play the same day again (≤ 2 taps to restart)
   - 🎲 shuffled toys = new seed
   - 🏠 free play = sandbox: buttons to morph the room freely between the three setups
   Free play mode reuses the same transforms with no task ordering.

## Variation (seeded)

`seed` drives, per run: toy start positions; toy↔basket symbol assignment; mat
colors/patterns; morning light angle; window weather (sun / light rain / clouds);
small shelf decoration theme. At least 3 curated seeds ship (`?seed=1|2|3`); replay
"shuffle" picks a new one. All randomness goes through the seeded RNG for test replay.

## NPCs

4 children + 1 teacher. One shared low-poly rig; per-child color/hair/badge variation.
Rounded toy-figure look (see ART_DIRECTION). Children never move furniture; the teacher
handles anything heavy. Nap safety supervision is background-only teacher behavior.

## Audio

All synthesized (Web Audio API) — no external/copyrighted assets. Per-material toy
sounds, basket "gulp", chair line-up ticks, mat fabric whoosh, curtain slide, lunch
ambience, nap ambience (soft noise + slow pad), morning birds. AudioContext resumes on
first user gesture (iOS). Mute toggle persists in localStorage. Playable with sound off.

## Persistence

localStorage only: mute, reduced-motion preference, last seed. Nothing about the child.
