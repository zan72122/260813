# CAMERA_CONTRACT

One `CameraDirector` (`src/visual/cameraDirector.ts`) owns the camera. **No
free orbit anywhere.** Shots are named cues; the game requests cues via the
EventBus (`camera:cue` with a `CameraCueId`); the director tweens between them
(smoothed, quaternion slerp, never through geometry). `prefers-reduced-motion`
⇒ hard cuts with a 300ms fade instead of long dollies.

## Cue chain (ids frozen in `src/contracts/camera.ts`)

| id | Composition requirements |
|---|---|
| `establish` | Whole lower tower leg + ground; cutaway sliver reveals track, warm yellow cabin at station, underground room glowing below; Paris pale in background. Reads in 3 s. |
| `underground` | Machine room interior: BOTH pistons fully in frame from the side, master lever foreground-adjacent (but UI never occludes pistons), cable run exiting toward the pulley visible frame-edge. |
| `cableFollow` | One continuous move: start on piston head, travel along the moving cable, pass THROUGH the turning big pulley's plane (close, we see it spin), continue up inside the leg to the carrier. No cuts. Reduced motion: 3 quick cross-fades (piston → pulley → carrier). |
| `carrierSide` | Ride view, camera lateral (+Z offset) tracking the carrier; carrier + cabin + a stretch of track above and below in frame; girders sweep past for height sense; horizon visible. |
| `firstSlope` | Same rig as `carrierSide`, framed to make the 54° track angle obvious against the horizon (track diagonal across frame). |
| `transitionClose` | THE shot. Must simultaneously show: (1) the track curving steeper, (2) the carrier visibly re-tilting, (3) the cabin floor line, (4) the sky horizon. Camera z-offset reduced (closer), keeps world-horizontal framing (camera up = +Y ALWAYS — never rolls). Bottom 22% of frame reserved for the level wheel; cabin sits in upper 60%. |
| `interiorProof` | Inside/close-up of cabin: water tank surface, ball, hanging lamp, and window horizon in ONE frame. Triggered as leveling completes (and from replay menu). |
| `arrivalReveal` | Doors open; camera glides out onto second-floor platform; Paris panorama; then a gentle look BACK DOWN ALONG the inclined track just climbed (angled, never a straight-down vertigo shot); ends on cabin floor line vs horizon confirmation. |
| `descent` | `carrierSide` mirrored for downward travel. |
| `menu` | Pulled-back three-quarter view framing tower + underground for the replay tiles. |

## Global rules
- Camera up vector is ALWAYS world +Y (no roll) — the horizon must stay level
  in every shot so the cabin-floor comparison is honest.
- FOV: portrait 58°, landscape 46° (relayout on orientation change, no state loss).
- During `transitionClose` the four witnesses (track, carrier, cabin floor,
  horizon) must all be inside the safe area on ALL four test viewports.
- No shot ever looks straight down; downward glances are pitched ≤ 35° below
  horizontal (vertigo guard).
- Cue transitions are interruptible and idempotent: re-requesting the active
  cue is a no-op; a new cue smoothly retargets from the current pose.
- Camera never clips scene geometry: each cue defines a cleared corridor;
  near plane 0.1, far 2000, tight per-cue frustum hints for culling.
- Deterministic: tweens run on sim clock (fixed-step), not wall clock.

## Testability
`__eiffel.readouts().cameraCue` returns the active cue id and `cameraSettled`
boolean (tween done). E2e asserts cue sequence along the ride and screenshots
each cue for the visual acceptance set.
