# ASSET_MANIFEST

All textures, sounds, and VFX sprites in this project are **procedurally
generated in-code, no third-party assets**. Nothing in this manifest is a
downloaded/purchased/licensed file; there are no binary asset files under
`public/` — everything below is synthesized at runtime by owner B's
(rendering-audio) implementations of `src/core/interfaces.ts`.

## Textures (src/render/MaterialLibrary.ts + src/render/textureGen.ts)

Painted with offscreen `<canvas>` 2D. Every `paintedFlat` texture paints a real,
recognizable picture first (a paneled wall with a window, tree trunks and
canopy, a beamed room with a hearth...); cloth-weave noise, brushstroke
gradients and edge unevenness are then layered on top as a subtle painted-
canvas finish, never used in place of the picture. Square, generated ≤1024px
(hard cap 2048 per MASTER_SPEC, never approached). Cached per key;
regenerated in place at the current QualityTier's resolution.

| Key | Method | Notes |
|---|---|---|
| `paintedFlat(salon, backdrop)` | `paintSalonBackdrop` | 3 gold-trimmed wall panels + tall arched window + chandelier silhouette |
| `paintedFlat(salon, wing0\|1\|2)` | `paintSalonWing` | fluted pilaster/column, gold capital/base/edge trim |
| `paintedFlat(forest, backdrop)` | `paintForestBackdrop` | 5 layered tree trunks (near/far), canopy blobs, warm light shafts between trunks |
| `paintedFlat(forest, wing0\|1\|2)` | `paintForestWingCutout` | bold trunk + foliage silhouette painted on a transparent canvas (cut-flat look); material uses `alphaTest` so the rectangular plane edges vanish |
| `paintedFlat(rustic, backdrop)` | `paintRusticBackdrop` | beamed ceiling, hearth with warm fire glow, two shelves with jug shapes |
| `paintedFlat(rustic, wing0\|1\|2)` | `paintRusticWing` | plastered wall with a grained timber post |
| `paintedFlat(*, border)` | `paintedFlat` | dark proscenium-frame gradient (gold/dark accent brushstrokes) |
| `paintedFlat(*, foreground0)` | `paintMossyRock` | mossy gray-green rock, same across all 3 scenes |
| `paintedFlat(*, foreground1)` | `paintWoodGrain` | wood-brown log, same across all 3 scenes |
| `paintedFlat(*, foreground2)` | `paintSoftAccentProp` | scene-tinted soft accent (rose silk / mossy leaf / terracotta) — index-aware so foreground props never render as one uniform pink block |
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

Auditorium sells blue-white-gold (docs/VISUAL_DIRECTION.md V2): `wall` is a
warm-white plaster wash, `seat` is a deep-blue velvet gradient with a lighter
sheen band at the top (not washed out light-blue), `curtain` is deep blue
with fold shading, and `goldTrim` is a `MeshPhysicalMaterial` (metalness
0.4/roughness 0.34/clearcoat 0.2 + a faint warm emissive) for a visible
paper-gilt sheen without reading as a polished metal ingot.

## VFX sprite textures (src/vfx/VfxSystem.ts)

| Sprite | Method | Notes |
|---|---|---|
| Dust mote disc | `buildDiscTexture` | warm honey-brown radial-gradient disc, ≤200 billboard `Points`, confined to the understage Y band so it reads as dusty air, not a starfield |
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
