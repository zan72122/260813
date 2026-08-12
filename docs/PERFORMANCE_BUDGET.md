# PERFORMANCE_BUDGET

Baseline: WebGL2, mobile Safari (iPhone 12 class) target 60 fps, floor 30 fps.

| Budget | Limit |
|---|---|
| Draw calls / frame | ≤ 150 (high tier), ≤ 90 (low) |
| Triangles / frame | ≤ 300k (high), ≤ 150k (low) |
| Texture memory | ≤ 64 MB; every texture ≤ 2048px, procedural (canvas) only |
| DPR | min(devicePixelRatio, 2); low tier 1.5 |
| JS heap growth over 20 ascent/descent replays | ~0 (leak test; < 5 MB tolerance after GC) |
| Main-thread per-frame allocations in sim/render hot path | none (reused vectors/quats) |
| Bundle | ≤ 1.5 MB gzip total; no runtime network fetches |
| Load to interactive (attract state) | ≤ 3 s on mid device |

Techniques (required):
- InstancedMesh for lattice girders/rivets; merged BufferGeometry for static
  one-offs; frustum culling with per-cue hints; tower segmented so off-screen
  leg sections cull.
- No shadow-mapped sun over the whole tower: baked/fake AO on statics, one
  small shadow map (≤1024) only near carrier/machine focus, low tier: none.
- Transparency: never >1 blended layer per screen region; no full-scene
  transparent tower; particles = light additive sprites, ≤ 200 (low: 0).
- Adaptive quality: 3 tiers, auto-downgrade after 60 consecutive frames over
  budget, upgrade hysteresis 10 s; never changes gameplay/sim.
- `document.hidden` ⇒ stop rendering AND pause sim clock.
- Context lost ⇒ prevent default, rebuild scene on restore, GameStore intact.
- `dispose()` everything on replay-loop teardown paths; geometry/material/
  texture reuse via caches.
- No heavy physics engine; springs/quaternions per MATH_CONTRACT only.
