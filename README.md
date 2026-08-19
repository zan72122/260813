# ちゅーりっぷ ばたけ — Tulip Field

A 3D web game for a 4-year-old, made to be played with one finger on an
iPhone or iPad in Safari, in portrait **or** landscape.

The whole game is one sentence a small child can say afterwards:

> まるい球根を土に入れて、お水をあげたら、お花がいっぱい咲いた。
> *(I put the round bulbs in the soil, I gave them water, and lots of flowers came out.)*

There is no text to read, no score, no timer, no way to lose.

## The two-and-a-half minutes

1. **An empty field.** Brown soil to the horizon, a wooden bed with four
   holes, a basket of bulbs. Deliberately dull — this is the "before".
2. **Planting.** Drag a bulb towards a hole. Get anywhere near and it is
   pulled in, drops with a *ぽとん*, and the soil folds back over it with a
   *ふわっ*. Four bulbs, no more.
3. **Underground.** The camera sinks and the soil between you and the row
   is cut away. The four bulbs you just dropped are down there, in a row,
   where you left them — with the ground surface and the water channel
   still visible above the cut.
4. **Water.** Pull the lever. The sluice lifts, water runs down the
   channel, the earth darkens, and the damp front works its way down the
   cut face to the bulbs.
5. **Roots and shoots.** White roots reach down, a green shoot climbs up.
6. **Back to the surface.** The camera rises as the trench fills in and
   four shoots pop out of the bed.
7. **The first flower.** Down at a child's eye height, one bud swells and
   opens, right in front of you.
8. **The bloom wave.** Opening spreads outward from *your* row — near,
   then further, then to the horizon — while the camera lifts, pulls back,
   and the whole world turns into a tulip field. Wind runs across it. The
   interface disappears and you just look.
9. **Again?** Three picture buttons: same again, different colours, a
   different field.

## Running it

```
npm install
npm run dev        # vite dev server, open the printed URL on your phone
npm run build      # type-check and produce a static ./dist
npm run preview    # serve the built output
```

`dist/` is plain static files — drop it on any host.

## How it is built

TypeScript + [Three.js](https://threejs.org), WebGL2-class features only.
There are **no downloaded assets at all**: every texture is drawn on a
2D canvas at startup and every sound is synthesised in the Web Audio
graph, so the game starts almost instantly on a phone connection and the
whole build is a few hundred KB.

A few things worth knowing if you are reading the source:

**The field is three draw calls.** `src/world/FlowerField.ts` holds three
instanced tiers: a few dozen detailed tulips nearby, a few thousand
low-poly ones in the middle distance, and several thousand alpha-tested
billboards beyond that. Instances are spaced *logarithmically* in radius,
which makes density fall off as 1/r² — exactly what a perspective camera
undoes — so the field looks equally full at your feet and at the skyline
for a fixed instance count.

**Nothing in the field is animated on the CPU.** There is one uniform,
`uWaveRadius`, the radius of the bloom front in metres. Each plant works
out how far the front has passed it and derives its own growth, its
bud→open morph and its wind sway from that. `src/gfx/tulipGeometry.ts`
builds each tulip in two poses at once — `position` is the open flower,
`aBud` is the same vertex closed — and the vertex shader lerps between
them, so "the flower opens" costs one float per instance.

**The horizon is the ground, not geometry.** `src/world/Ground.ts` carries
a second "carpet" colour that the same bloom front reveals, generated from
the same colour-band function the instances use. The distant field is
literally coloured like tulips, so the billboards only have to add
texture on top of it. That is why the skyline reads as solid flowers
without the instance count it would otherwise imply.

**The cut-away is the same world, not a diagram.** `uCutAmount` makes the
ground and bed shaders discard the soil between the camera and the
planting row, and `src/world/CrossSection.ts` supplies the pit that is
revealed underneath. The child keeps looking at their own bulbs, in the
place they put them.

**Every shot is authored twice.** `src/game/shots.ts` gives each camera
move a portrait variant and a landscape variant, and
`src/core/CameraDirector.ts` cross-fades them by aspect ratio. Rotating
the device re-frames the picture instead of cropping it, and never
interrupts what is happening. Shots can animate themselves, so the final
crane runs for eleven seconds without a single cut.

**Quality adapts.** `src/core/Quality.ts` picks instance counts and a DPR
cap from the device, then watches median frame time and drops render
resolution if the device is struggling. Resolution goes first, because
fill rate is the usual bottleneck for a screen full of flowers.

## Layout

```
src/
  core/      renderer plumbing: layout, quality, input, camera director, maths
  gfx/       generated textures, tulip geometry, shared shader library, particles
  world/     ground, sky, planting bed, water, cut-away, flower field
  game/      world constants, camera shots, the state machine
  audio/     synthesised sound
  ui/        the small DOM overlay
tests/       Playwright playtests (see below)
```

## Playtests

The tests drive the real game with real pointer events at four device
shapes, then write screenshots to `shots/` for visual review.

```
node tests/playthrough.mjs iphone-portrait    # a whole game, start to finish
node tests/robust.mjs                         # rotate mid-play; the replay menu
node tests/beats.mjs ipad-landscape reveal 8  # one frame at one moment
node tests/audio.mjs                          # the audio graph and every cue
```

They use the Chromium that ships with the environment; set `CHROME_PATH`
to point somewhere else. Rendering runs under SwiftShader, so the images
are accurate but frame rate there means nothing — judge performance on
real hardware.

`window.__game` is exposed for the tests: `testAdvance(seconds)` steps the
simulation without waiting for frames, and `?scene=reveal` jumps straight
to a beat.
