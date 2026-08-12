# HISTORICAL_NOTES — The Eiffel Tower's inclined hydraulic elevators

Research summary feeding the game's design. Sources listed at the end; figures
vary slightly between publications and are marked "approx." where they do.

## Why these elevators are special
The east and west leg elevators of the Eiffel Tower are **neither ordinary
vertical elevators nor simple funiculars**. They climb *inside a curved,
inclined tower leg whose slope changes along the way*, driven by underground
water-hydraulic machinery, while a leveling arrangement keeps the passenger
cabin floor horizontal the whole ride.

## Timeline
- **1889** — Original elevators for the Exposition: Roux, Combaluzier & Lepape
  (east/west legs, articulated-piston chain system, unreliable) and Otis
  (north/south legs, two-stage cable/pulley hydraulic with double-deck cabins).
- **1899** — East/west systems replaced by **Compagnie de Fives-Lille**
  hydraulic elevators — the yellow-cabin machines. Modernized in 1986–2005 but
  still running on the same core mechanical principle: the oldest continuously
  used lift mechanism of its kind in the world.

## The Fives-Lille machine (what the game abstracts)
- **Underground machine room** at the foot of the pillar (still visitable on
  "backstage" tours today).
- **Two horizontal hydraulic presses** — rolled-steel plungers of **402 mm
  diameter** with about **16.5 m of stroke**, fed by high-pressure water
  accumulators (~52 kg/cm²); on descent, water returns to a low-pressure
  accumulator (~18 kg/cm²). Pumps sit in the south pillar.
- **Cable & pulley multiplication**: the pistons drive a sheave carriage with
  movable pulleys (sources describe six); cables reeved between moving and fixed
  sheaves multiply the ~16.5 m stroke into roughly **128 m of travel** from the
  underground machinery up to the second-floor platform.
- Historically the pumps were powered by machinery, and the operator worked a
  **control valve** — the game's "master lever" abstracts exactly this (opening
  the operating valve), *not* hand-pumping.

## The changing inclination
The leg's elevator track is not a constant slope: **approximately 54° from
horizontal near the base**, steepening as the leg straightens toward the second
floor — sources cite the upper run at **74°–80°** (publications round
differently; the game uses 54° → 74° as its visual anchor, within the sourced
range). Vogel's Smithsonian monograph notes the original hydraulic cylinders
were even "set on an angle roughly equal to the incline of the lower section of
run" — the changing angle shaped the machine design from the start.

## Carrier vs passenger cabin — the leveling system
- The **carrier (chariot)** is the rigid truck that runs on rails bolted to the
  leg and **tilts with the track** (54° → ~74-80°).
- The **passenger cabin** is a separate body mounted on the carrier through an
  articulating linkage. Vogel describes connecting rods forming an
  **articulated parallelogram** (four-bar linkage) that geometrically holds the
  passenger floor horizontal as the carrier's attitude changes. Early pivoting
  "recovery"/re-leveling floor sections adjusted by the operator were also
  tried on some 1889 cars.
- The game's model — carrier follows track tangent, cabin counter-rotates to
  world-up with a child-assisted "leveling wheel" — is a faithful abstraction
  of this carrier/cabin split and its leveling mechanism.

## Causal chain the game must never break
underground machinery moves → water drives the two pistons → sheave carriage
multiplies stroke into cable travel → pulleys turn, cable runs → carrier climbs
the leg rails → slope changes mid-run → **only the cabin stays level**.

## Simplifications taken by the game (deliberate, child-facing)
- One combined machine room view; accumulators shown as a friendly weighted
  water tank; pressures/valve gear reduced to a single big master lever.
- Piston stroke : cable travel ratio fixed at 1:8 (real reeving ratios varied).
- 54° → 74° used as the canonical pair of angles; the blend placed near the
  first-floor level.
- Water hydraulics (not oil) — the game shows water-blue fluid accordingly.

## Sources
- toureiffel.paris — official site: lifts overview; "What were the elevators in
  the Eiffel Tower's early days" (130-years series).
- Robert M. Vogel, *Elevator Systems of the Eiffel Tower, 1889* (Smithsonian;
  Project Gutenberg #32282) — carrier/chariot, articulated-parallelogram cabin
  leveling, angle-matched cylinder design.
- wonders-of-the-world.net — Fives-Lille technical detail (402 mm plungers,
  16.5 m stroke, accumulator pressures, six movable sheaves).
- otis.com — Otis's account of its 1889 north/south leg double-deck elevators.
- powermotiontech.com; sortiraparis.com (machine-room backstage tours);
  vacatis.com (128 m travel figure).

Note: some official pages were egress-blocked during research and were read via
search summaries; exact pressure/angle figures above are flagged "approx." and
the game intentionally presents angles as visual anchors, not measurements.
