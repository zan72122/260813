# PRODUCT_SPEC — ななめなのに水平！ エッフェル塔エレベーター

A production-quality mobile web game for a 4-year-old. The player operates the
underground hydraulic machinery of the Eiffel Tower's historic east/west-leg
elevators and rides the inclined leg to the second floor, while the passenger
cabin floor stays perfectly horizontal even as the track steepens from ~54° to ~74°.

## One sentence
Move the big underground hydraulic pistons and pulleys, climb the Eiffel Tower's
leg as its slope suddenly steepens, and keep only the cabin floor level the whole way.

## Signature moment
The carrier tilts with the steepening track while the passenger cabin on top of it
smoothly counter-rotates so its floor stays level with the Paris horizon — proven
simultaneously by: colored water in a glass tank, a large soft ball on the floor,
a hanging lamp, the Paris skyline, and the cabin floor line itself. No numbers, no text.

## Audience & constraints
- 4-year-old girl; iPhone & iPad; portrait AND landscape first-class.
- One finger only. No reading required (pictograms only). 3–5 minutes per loop.
- No failure, no falling, no being trapped, no timer, no score.
- No vertigo framing (camera never looks straight down a dizzying drop).
- Machinery is precise and powerful but friendly; a friendly maintenance robot
  ("Boulon") operates/checks the machines alongside the player.

## Game flow (states)

| State id       | Scene / verb (one verb per scene)                        |
|----------------|----------------------------------------------------------|
| `boot`         | Loading (animated pulley spinner, no text)               |
| `attract`      | Establish shot; tower leg + cutaway; light idle motion within 3s; if idle 5s, short auto-demo of the lever; tap anywhere to begin |
| `machineRoom`  | Camera moves underground; verb: slide the big master lever up → valve opens, pistons stir |
| `cableFollow`  | Automatic camera ride: piston → linkage → big pulley → cable → up the leg to the carrier (causality chain, one continuous move) |
| `ascendLower`  | Verb: hold the big up-throttle; cabin climbs the 54° run; girders slide past; release = gentle stop |
| `transition`   | THE moment: track steepens toward 74°; verb: turn the big level wheel to help the cabin stay level (wide snap + auto-assist; success guaranteed, credit felt) |
| `ascendUpper`  | Short steep run to the platform (hold throttle again)    |
| `arrival`      | Brake/lock sound, doors open, camera steps out: Paris reveal + look back down the inclined track; floor-was-level confirmation beat |
| `celebrate`    | Confetti-light sparkle, Boulon waves; leads to menu      |
| `replayMenu`   | 4 big pictogram tiles: ride again ▲, ride down ▼, machine-room free play, **slope-change replay** (jumps straight to `transition`) |
| `descend`      | Reverse ride (optional path), same guarantees            |
| `pause`        | Reachable anytime; resume restores exactly               |

Slope-change replay must be reachable within 2 taps from `celebrate`/`replayMenu`.

## Core verbs (world-integrated controls, no abstract UI)
1. **Master lever** (machine room): vertical slide, ≥120 CSS px tall. Opens the
   hydraulic valve proportionally. Finger off → valve eases shut, machinery
   glides to a stop. Cannot break anything.
2. **Up/Down throttle** (riding): big lever with ▲/▼ pictogram faces; hold to move,
   release to ease-stop. Speed clamped to a calm range; no jerk (accel-limited).
3. **Level wheel** (transition): large wheel at bottom of screen; rotate left/right
   to align the thick floor line with the sky horizon line. Wide magnetic snap;
   auto-assist completes leveling within 3s even with no input; player input makes
   it faster and triggers sparkle/чime feedback so the child feels she did it.

## Guarantees (product invariants)
- Any input released → motion eases to a stop; nothing ever falls or breaks.
- Button mashing / double taps never double-trigger state transitions.
- Wrong-direction input is always recoverable; no soft-lock in any state.
- Fingers never need to cover the cabin or the horizon (controls live in the
  bottom safe-area band; scene composition reserves that band).
- Cabin floor tilt never exceeds 8° world tilt at any time (water never spills).
- Complete loop playable with zero text comprehension.

## Feedback rules
- ≤3s from launch: something already moves (idle pulley sway, steam wisps).
- ≤5s idle on any verb screen: short ghost-hand demonstration of the gesture.
- Every causal link is animated in view: valve→pistons→linkage→pulley→cable→carrier.

## Modes & settings (pictogram buttons, top corner, ≥72px)
- Sound on/off toggle (persisted).
- Pause/resume.
- Reduced motion honored (`prefers-reduced-motion`): camera cuts instead of long
  moves, particle effects off, slosh minimized.
- Orientation change at ANY moment relayouts without losing state.

## Out of scope (forbidden)
- Scores, timers, fail states, lives; text tutorials; free orbit camera;
  blue sci-fi holograms, glassmorphism, neon gradients, dashboard UI;
  external network calls at runtime; heavy physics engine.
