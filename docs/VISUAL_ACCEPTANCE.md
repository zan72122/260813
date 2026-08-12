# VISUAL_ACCEPTANCE

Art direction target: **high-quality museum cutaway model** — the dollhouse
cross-section of a great machine, warm and precise. NOT a dashboard, NOT sci-fi.

## Hero materials (exactly these five families)
1. Dark iron lattice (near-black warm grey, subtle roughness variation).
2. Brass + black iron hydraulic machinery (polished brass accents on valve
   wheels, piston collars; oily black iron bodies).
3. Thick steel cable (visible twist, catches light).
4. Warm ochre/yellow passenger cabin (the historic yellow cabins) with soft
   warm interior light.
5. Colored water + glass indicators (the ONLY glass: cabin water tank + small
   valve sight-glass; water a friendly teal-blue).

Palette anchors: iron `#2b2b30`, brass `#b08d3f`, cabin ochre `#e0a83c`,
water teal `#3fa8b8`, Paris-sky pale `#cfd8e3`→`#f2e8d8` horizon gradient,
underground warm lamplight `#ffb36b`. Paris skyline = pale flat silhouettes.

## Forbidden
Blue holographic UI, glassmorphism, neon gradients, generic dashboards, rows of
technical explanation panels, text labels in-scene, stacked transparent layers,
full-tower x-ray transparency, scary darkness/heights framing.

## Cutaway policy
Tower normally reads as SOLID iron lattice silhouette. Only the focus region is
opened: authored cutaway geometry (pre-modeled open segments with painted cap
faces) — machine-room earth cut ("dollhouse" section) and a track corridor
sliver along the leg. At most ONE semi-transparent surface per frame region.

## Color-coded causality (child-readable)
Water/hydraulic = teal-blue, moving piston = brass/orange accents, cable =
steel with a moving highlight so travel direction is visible, cabin = yellow.
A child must be able to trace valve → piston → pulley → cable → carrier by
color and motion alone.

## Screenshot acceptance set
Captured by e2e at each cue, all four viewports (390×844, 844×390, 820×1180,
1180×820), saved to `artifacts/qa/<viewport-name>/<shot>.png`:

| shot file | must show |
|---|---|
| `01-opening-cutaway` | leg + track + yellow cabin + underground room + cable + big pulley relationship, readable in one glance |
| `02-underground-pistons` | two pistons, brass/iron machine room, master lever |
| `03-cable-follow` | cable/pulley mid-journey frame |
| `04-first-slope` | 54° ride, girders, horizon |
| `05-slope-transition` | steeper track + tilted carrier + level cabin floor + horizon, all four legible |
| `06-horizontal-cabin-proof` | interior: level water surface, centered ball, vertical lamp, horizon in window |
| `07-arrival` | second floor platform, Paris, the climbed track below |

## Blind-review pass bar
A reviewer seeing ONLY the screenshots must be able to answer yes to: it's the
Eiffel Tower's inclined leg; underground machines connect to the cabin; the
cutaway is clean; carrier and cabin are distinct; one frame alone explains the
slope change; the level floor is visually proven; UI doesn't block the scene;
portrait and landscape are each properly composed (not letterboxed crops).
