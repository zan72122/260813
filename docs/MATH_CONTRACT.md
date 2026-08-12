# MATH_CONTRACT

All gameplay math lives in `src/game/**`, pure and unit-testable (no Three.js
scene objects; `three` math classes allowed). World units: meters. World up: +Y.
The travel plane is the world X–Y plane; lateral axis is +Z. Angles in radians
internally; readouts expose degrees.

## 1. Track (`src/game/track.ts`)
Analytic piecewise **line – circular-arc – line** curve in the X–Y plane,
arc-length parameterized by construction (NOT CatmullRom; exact tangents matter).

Canonical constants (in `src/contracts/constants.ts`, frozen):
```
THETA_LOWER = 54°  (from horizontal)
THETA_UPPER = 74°
TRACK_LENGTH = 128            // total arc length, meters
BLEND_START_S = 70            // arc length where curvature begins
BLEND_END_S   = 86            // arc length where 74° is reached
STATION_BOTTOM_S = 0, STATION_TOP_S = 128
```
- Inclination profile: `theta(s) = THETA_LOWER` for `s ≤ BLEND_START_S`;
  linear in s across the blend (a circular arc ⇔ linear angle in arc length);
  `THETA_UPPER` for `s ≥ BLEND_END_S`.
- Position `P(s)` by closed-form integration (line, arc, line). `P(0)` at the
  ground station portal; y strictly increasing in s.
- API: `trackPoint(s): Vec3`, `trackTangent(s): Vec3` (unit, in-plane),
  `trackTheta(s): number`, normalized `t = s / TRACK_LENGTH`.
- Invariants: `theta` monotonic non-decreasing; `|tangent| = 1`;
  `dy/ds = sin(theta) > 0` (monotonic ascent); C¹ continuity at joints
  (tangent mismatch < 1e-9).

## 2. Drive pipeline (single source of motion)
```
valveOpen ∈ [0,1]  (master lever / throttle)
pistonSpeed = valveOpen * direction * PISTON_MAX_SPEED     (accel-limited, see §5)
pistonDisplacement p ∈ [0, PISTON_STROKE]                  (PISTON_STROKE = 16)
cableTravel c = MECH_ADVANTAGE * p                          (MECH_ADVANTAGE = 8)
carrier arc length s = c                                    (so s ∈ [0,128])
pulleyAngle φ = c / PULLEY_RADIUS                           (PULLEY_RADIUS = 1.1)
```
Invariants (unit-tested, tolerance 1e-9 relative):
- `c === 8 * p` and `φ === c / 1.1` at every step, in both directions.
- pistonSpeed = 0 ⇒ ds/dt = 0 and dφ/dt = 0 (pistons stop ⇒ everything stops).
- s is clamped to [0, 128]; hitting an end eases speed to 0 (no bounce, no NaN).
- Repeated full ascent+descent cycles return p, c, s, φ exactly to initial
  values (no drift; verified over 20 cycles).

## 3. Carrier & cabin orientation (`src/game/leveling.ts`)
- Carrier quaternion: rotation about **+Z only**:
  `q_carrier = Quaternion.setFromAxisAngle(+Z, theta(s) - PI/2)`
  so at θ=90° the carrier is upright; at θ=54° it leans by 36°.
  Single-axis ⇒ no gimbal lock; quaternions still used end-to-end.
- Cabin is a **child of the carrier**. Its local rotation about +Z is
  `q_cabin_local = Quaternion.setFromAxisAngle(+Z, -(theta(s) - PI/2) + e)`
  where `e` is the residual tilt error (radians).
- Residual error dynamics: critically-damped spring toward 0 with time constant
  `TAU_ASSIST = 0.8s`; during `transition` state the target convergence gets a
  player boost: level-wheel input multiplies convergence rate up to 3×, and
  within the snap band (|e| < 6°) a magnetic pull engages. With zero input,
  |e| < 0.25° within 3 s of any theta change completing (guaranteed success).
- Hard clamp: `|cabinWorldTiltDeg| ≤ 8°` at ALL times (water never spills).
- Steady-state invariants: `cabinWorldTiltDeg < 1°` whenever θ is constant for
  ≥ 2 s; `< 0.25°` after assist completes; cabin floor world normal
  `dot(n, +Y) > cos(1°)`.
- Readout: `cabinFloorNormal` = cabin's local +Y transformed to world space.

## 4. Interior indicators (world-up witnesses)
- **Water surface**: a mesh child of the cabin whose *world* orientation is
  identity plus a slosh angle `w` about +Z: 2nd-order damped spring driven by
  cabin angular velocity, `|w| ≤ 4°`, settles < 0.5° within 1.5 s.
- **Hanging lamp**: damped pendulum about its pivot toward world-down; same
  spring form, `|swing| ≤ 10°`, no NaN at rest.
- **Ball**: rolls toward the low side of the floor proportional to
  `sin(cabinWorldTilt)`, spring-returns to center when level, clamped to floor.

## 5. Motion feel (child-safe)
`PISTON_MAX_SPEED` sized so full run takes ~45 s at full throttle
(≈ 2.9 m/s cabin speed). Acceleration limit 1.2 m/s²; release ⇒ ease to stop
within 1 s. No jerk discontinuity (accel is rate-limited too).

## 6. Determinism & numeric hygiene
- Fixed step `SIM_DT = 1/60`; sim state advanced only in `step()`.
- Seeded PRNG (mulberry32) — the ONLY randomness source in `src/game`.
- All quaternions renormalized after integration; `assertFinite` dev-guard on
  the sim snapshot (stripped in prod builds via `import.meta.env`).
- Same seed + same input script ⇒ bit-identical readout trajectory.
- Orientation (portrait↔landscape) and pause/resume must not touch sim state.

## 7. Test tolerances (Vitest)
| Quantity | Tolerance |
|---|---|
| c = 8p, φ = c/r | 1e-9 relative |
| tangent continuity at joints | 1e-9 |
| monotonic ascent (Δs>0 ⇒ Δy>0) | exact |
| cabin steady tilt | < 1° (assist done: < 0.25°) |
| replay reset (all scalars) | 1e-9 absolute |
| 20-cycle drift (p,c,s,φ,e) | 1e-6 absolute |
| NaN anywhere in snapshot | never |
