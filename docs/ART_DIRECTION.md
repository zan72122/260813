# ART_DIRECTION — へんしん！いちにち保育室

**Frozen.**

## Concept

**A warm nursery-room 3D diorama: quality wooden toys meets small architectural model.**
Not photoreal; shapes simplified so a 4-year-old instantly recognizes every object.
Never flat icon-game, never colored-rectangle UI, never cheap ad-game look.

## Palette

- warm cream `#FAF3E7` (walls, base light)
- pale natural wood `#E3C9A3` / `#C9A876` (floor, furniture)
- coral pink `#F2857E`
- mint `#8FD6C0`
- sky blue `#8EC9EB`
- butter yellow `#F7D97B`
- rainbow accents sparingly (basket symbols, one rug arc, replay cards)

**Forbidden:** purple-gradient AI look; neon; glassmorphism cards; dashboard UI;
pill-button rows; uniform glossy plastic on everything; filler decoration;
any resemblance to existing anime/game characters.

## Hero materials (spend the budget here)

1. **Pale wood** — table/shelves: subtle procedural grain (generated canvas texture,
   ≤1024px atlas), soft roughness variation, gently rounded edges (beveled geometry).
2. **Woven fabric** — mats/blankets: visible weave via generated normal-ish shading
   texture, matte, warm colors per seed.
3. **Sheer curtain** — translucent (alpha, double-sided, slight vertex wave),
   catches window light.
4. **Toys** — moderate satin gloss, NOT mirror plastic; per-material family
   (wood block / plush / plastic ball) differ in roughness.
5. **Natural light** — the true hero: bright slightly-cool morning → warm lunch →
   dim amber nap with ceiling stars → bright afternoon. One directional key light
   (window), soft ambient/hemisphere fill, colors lerped by FSM phase. Baked-feel
   soft contact shadows via blob shadow meshes (no expensive shadow maps if budget
   tight; if shadow map used: single 1024 map, static objects only).

## Geometry style

- Rounded, chunky, low-poly-plus: beveled edges everywhere, no razor-sharp boxes.
- Room as cutaway diorama: floor slab + two back walls + big window; front/side open
  toward camera. Slight miniature feel (gentle tilt-shift-ish framing is OK via
  camera FOV ~35°, no post-processing DOF required).
- NPCs: rounded toy figures — capsule bodies, simple sphere heads, small dot eyes,
  soft smile; natural proportions of a wooden peg-doll-plus-limbs. NOT big-eyed
  chibi, NOT photoreal. Skin/hair/clothes varied per child; badge symbol on chest.

## Motion feel

- Everything eases (back/elastic-lite for playful items, cubic for furniture/light).
- Squash & stretch ≤ 15% on toys/chairs hops; none on architecture.
- The room must feel like it *performs* its transformation: staggered, rhythmic
  (chairs land on a beat), never all-at-once teleporting.
