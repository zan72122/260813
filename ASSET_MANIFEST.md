# ASSET_MANIFEST

All textures, sounds, and VFX sprites in this project are **procedurally
generated in-code, no third-party assets**. Nothing in this manifest is a
downloaded/purchased/licensed file; there are no binary asset files under
`public/` — everything below is synthesized at runtime by owner B's
(rendering-audio) implementations of `src/core/interfaces.ts`.

## Textures (src/render/MaterialLibrary.ts + src/render/textureGen.ts)

Painted with offscreen `<canvas>` 2D (cloth-weave noise + brushstroke
gradients + edge unevenness, wood grain, twist/veins/nap/fold patterns as
appropriate), square, generated ≤1024px (hard cap 2048 per MASTER_SPEC,
never approached). Cached per key; regenerated in place at the current
QualityTier's resolution.

| Key | Method | Notes |
|---|---|---|
| `paintedFlat(salon\|forest\|rustic, wing0)` | `paintedFlat` | nearest wing pair, richest/darkest tone per scene |
| `paintedFlat(*, wing1)` | `paintedFlat` | mid wing pair |
| `paintedFlat(*, wing2)` | `paintedFlat` | farthest wing pair, lightened for atmospheric depth |
| `paintedFlat(*, backdrop)` | `paintedFlat` | softest wash, widest brushstroke spread |
| `paintedFlat(*, border)` | `paintedFlat` | darkest frame tone |
| `paintedFlat(*, foreground)` | `paintedFlat` | richest accent tone (rose/gold for salon, bark/leaf for forest, hearth for rustic) |
| `wood(beam)` | `wood` | honey-to-dark grain, horizontal |
| `wood(drum)` | `wood` | horizontal grain |
| `wood(floor)` | `wood` | horizontal grain |
| `wood(furniture)` | `wood` | vertical grain, finer knots |
| `wood(pulley)` | `wood` | vertical grain |
| `rope()` | `rope` | twisted hemp strands, tileable along V; `setRopeScroll(offset)` scrolls UV-V by rope travel (m) |
| `metal()` | `metal` | brushed black iron, subtle streak noise |
| `goldTrim()` | `goldTrim` | paper-gilt: blotchy unevenness + tiny sheen flecks |
| `auditorium(wall)` | `auditorium` | warm-white plaster wash + blotchy noise |
| `auditorium(seat)` | `auditorium` | blue velvet gradient + nap noise |
| `auditorium(marble)` | `auditorium` | faux-marble veining |
| `auditorium(curtain)` | `auditorium` | deep blue fabric, vertical fold shading |

Total distinct cached textures: 18 painted flats (3 scenes × 6 elements) + 5
wood kinds + 1 rope + 1 metal + 1 gold trim + 4 auditorium kinds = 30.

## VFX sprite textures (src/vfx/VfxSystem.ts)

| Sprite | Method | Notes |
|---|---|---|
| Dust mote disc | `buildDiscTexture` | warm dark radial-gradient disc, ≤200 billboard `Points` |
| Footlight glow disc | `buildDiscTexture` | warm `#ffd9a0` radial-gradient disc, additive, row of small glows |
| Gobo light-shaft | `buildShaftTexture` | tapered vertical beam, additive planes, 木漏れ日 intensity 0..1 |
| Bird silhouette | `buildBirdTexture` | simple wing-arc stroke, 2–3 billboard `Points` with gentle flutter |

## Audio (src/audio/AudioEngine.ts)

100% procedural WebAudio synthesis (oscillators, filtered noise bursts,
envelopes) — no `<audio>` elements, no external sound files.

| Cue | Kind | Synthesis |
|---|---|---|
| `knock3` | one-shot | 3× wooden knock (triangle thump + bandpass noise click) |
| `lockClick` | one-shot | metallic "カチン" (sine ping + highpass noise click) |
| `settleThud` | one-shot | soft low "コトン" (sine drop + lowpass noise thump) |
| `releaseSoft` | one-shot | gentle lowpass noise puff |
| `birds` | one-shot | 2–3 short glissando-sine chirps |
| `wind` | one-shot | lowpass-swept noise gust |
| `applause` | one-shot | ~70 randomized bandpass noise clicks under a rise/fall envelope |
| `footlightsOn` | one-shot | warm triangle-wave triad swell with slow vibrato |
| `ropeCreak` | continuous | bandpass noise, pitch/tremolo scale with velocity |
| `pulleySpin` | continuous | triangle oscillator + bandpass, pitch/squeak-rate scale with velocity |
| `woodClatter` | continuous | highpass noise gated by a speed-scaled rhythmic LFO |
| `flatSlide` | continuous | broad lowpass noise, steady with velocity |
| `ambienceRoom` | continuous | quiet lowpass noise bed + faint sustained pad (loopable) |
| `ambienceUnder` | continuous | darker/lower lowpass noise bed + faint low pad (loopable) |

## public/generated/

Not used — no assets are pre-baked to disk; everything is generated at
runtime in memory (canvas textures, WebAudio graphs).
