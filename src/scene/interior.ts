/**
 * Cabin interior "world-up witnesses" (MATH_CONTRACT §4): a teal water
 * tank whose surface mesh counter-rotates to stay world-level, a hanging
 * lamp as a damped pendulum toward world-down, a big soft ball that rolls
 * toward the floor's low side and spring-centers, plus a friendly robot
 * operator and two passengers riding along.
 *
 * `cabinWorldTiltDeg` is read straight off the snapshot (the game owns the
 * leveling math); this module derives its own angular-velocity estimate
 * via finite difference purely to drive the springs' initial "kick" —
 * never to recompute the tilt itself.
 */

import * as THREE from 'three';

import {
  LAMP_SWING_MAX_DEG,
  PALETTE,
  WATER_SLOSH_MAX_DEG,
} from '../contracts/constants.ts';
import type { GameSnapshot } from '../contracts/store.ts';
import type { DisposeRegistry } from '../core/disposeRegistry.ts';
import type { MaterialLibrary } from '../render/materials.ts';
import { CABIN_FLOOR_HALF_EXTENTS, CABIN_INTERIOR_HEIGHT } from './carrierCabin.ts';
import { angularVelocityDeg, clampAbs, DampedOscillator } from './springs.ts';

const DEG2RAD = Math.PI / 180;
const MAX_TILT_RAD = 8 * DEG2RAD;

const TANK_LOCAL_POS = new THREE.Vector3(
  -(CABIN_FLOOR_HALF_EXTENTS.x - 0.28),
  0.5,
  CABIN_FLOOR_HALF_EXTENTS.z - 0.3,
);
const LAMP_PIVOT_LOCAL = new THREE.Vector3(0, CABIN_INTERIOR_HEIGHT - 0.16, 0);
const BALL_RADIUS = 0.16;
const BALL_Y = BALL_RADIUS + 0.02;

interface FriendlyFigureOptions {
  readonly bodyColor: THREE.Material;
  readonly position: THREE.Vector3;
  readonly scale?: number;
}

function buildFriendlyFigure(options: FriendlyFigureOptions, registry: DisposeRegistry, materials: MaterialLibrary): THREE.Group {
  const group = new THREE.Group();
  const scale = options.scale ?? 1;

  const bodyGeometry = registry.track(new THREE.CapsuleGeometry(0.16 * scale, 0.32 * scale, 4, 10));
  const body = new THREE.Mesh(bodyGeometry, options.bodyColor);
  body.position.y = 0.34 * scale;
  group.add(body);

  const headGeometry = registry.track(new THREE.SphereGeometry(0.15 * scale, 14, 10));
  const head = new THREE.Mesh(headGeometry, options.bodyColor);
  head.position.y = 0.62 * scale;
  group.add(head);

  // Both eyes (and both pupils) as one InstancedMesh each -- one draw call per
  // pair instead of one per sphere, still reads as two big friendly eyes.
  const eyeGeometry = registry.track(new THREE.SphereGeometry(0.045 * scale, 8, 6));
  const eyes = new THREE.InstancedMesh(eyeGeometry, materials.robotBody, 2);
  const pupilGeometry = registry.track(new THREE.SphereGeometry(0.02 * scale, 6, 6));
  const pupils = new THREE.InstancedMesh(pupilGeometry, materials.robotAccent, 2);
  const eyeMatrix = new THREE.Matrix4();
  [-1, 1].forEach((side, i) => {
    eyeMatrix.makeTranslation(side * 0.075 * scale, 0.65 * scale, 0.13 * scale);
    eyes.setMatrixAt(i, eyeMatrix);
    eyeMatrix.makeTranslation(side * 0.075 * scale, 0.65 * scale, 0.15 * scale);
    pupils.setMatrixAt(i, eyeMatrix);
  });
  eyes.instanceMatrix.needsUpdate = true;
  pupils.instanceMatrix.needsUpdate = true;
  group.add(eyes, pupils);

  group.position.copy(options.position);
  return group;
}

function buildWaterTank(materials: MaterialLibrary, registry: DisposeRegistry): { group: THREE.Group; surface: THREE.Mesh } {
  const group = new THREE.Group();
  const wallGeometry = registry.track(new THREE.BoxGeometry(0.42, 0.5, 0.34));
  const walls = new THREE.Mesh(wallGeometry, materials.glass);
  group.add(walls);

  const bodyGeometry = registry.track(new THREE.BoxGeometry(0.38, 0.34, 0.3));
  const water = new THREE.Mesh(bodyGeometry, materials.water);
  water.position.y = -0.06;
  group.add(water);

  const surfaceGeometry = registry.track(new THREE.PlaneGeometry(0.37, 0.29));
  const surface = new THREE.Mesh(surfaceGeometry, materials.water);
  surface.rotation.x = -Math.PI / 2;
  surface.position.y = 0.11;
  group.add(surface);

  return { group, surface };
}

function buildLamp(materials: MaterialLibrary, registry: DisposeRegistry): { pivot: THREE.Group; arm: THREE.Group } {
  const pivot = new THREE.Group();
  const arm = new THREE.Group();
  pivot.add(arm);

  const rodGeometry = registry.track(new THREE.CylinderGeometry(0.02, 0.02, 0.34, 6));
  const rod = new THREE.Mesh(rodGeometry, materials.lamp);
  rod.position.y = -0.17;
  arm.add(rod);

  const shadeGeometry = registry.track(new THREE.ConeGeometry(0.16, 0.16, 16, 1, true));
  const shade = new THREE.Mesh(shadeGeometry, materials.lamp);
  shade.position.y = -0.34;
  arm.add(shade);

  const glowGeometry = registry.track(new THREE.SphereGeometry(0.09, 12, 8));
  const glow = new THREE.Mesh(glowGeometry, materials.lampGlow);
  glow.position.y = -0.38;
  arm.add(glow);

  const light = new THREE.PointLight(PALETTE.undergroundLamplight, 6, 3.2, 2);
  light.position.y = -0.38;
  light.castShadow = false;
  arm.add(light);

  return { pivot, arm };
}

export interface InteriorRig {
  readonly group: THREE.Group;
  update(dt: number, snapshot: GameSnapshot): void;
}

export function buildInterior(materials: MaterialLibrary, registry: DisposeRegistry): InteriorRig {
  const group = new THREE.Group();
  group.name = 'interior';

  const tank = buildWaterTank(materials, registry);
  tank.group.position.copy(TANK_LOCAL_POS);
  group.add(tank.group);

  const lamp = buildLamp(materials, registry);
  lamp.pivot.position.copy(LAMP_PIVOT_LOCAL);
  group.add(lamp.pivot);

  const ballGeometry = registry.track(new THREE.SphereGeometry(BALL_RADIUS, 18, 14));
  const ball = new THREE.Mesh(ballGeometry, materials.ball);
  ball.position.set(0, BALL_Y, -0.15);
  group.add(ball);

  const robot = buildFriendlyFigure(
    { bodyColor: materials.robotBody, position: new THREE.Vector3(-0.32, 0, -0.5), scale: 0.95 },
    registry,
    materials,
  );
  group.add(robot);

  const passengerColors = [materials.passengerA, materials.passengerB];
  const passengerPositions = [new THREE.Vector3(0.4, 0, -0.55), new THREE.Vector3(0.4, 0, 0.2)];
  for (let i = 0; i < 2; i += 1) {
    const passenger = buildFriendlyFigure(
      {
        bodyColor: passengerColors[i]!,
        position: passengerPositions[i]!,
        scale: 0.85,
      },
      registry,
      materials,
    );
    group.add(passenger);
  }

  const sloshSpring = new DampedOscillator(9.5, 0.42);
  const lampSpring = new DampedOscillator(4.2, 0.3);
  const ballSpringX = new DampedOscillator(6.5, 0.75);

  let lastTiltDeg: number | null = null;

  function update(dt: number, snapshot: GameSnapshot): void {
    const tiltDeg = snapshot.cabinWorldTiltDeg;
    const tiltRad = tiltDeg * DEG2RAD;
    const angularVelDeg = lastTiltDeg === null ? 0 : angularVelocityDeg(lastTiltDeg, tiltDeg, dt);
    lastTiltDeg = tiltDeg;
    const angularVelRad = angularVelDeg * DEG2RAD;

    // Water slosh: driven by cabin angular velocity, settles back to level.
    const sloshKick = -angularVelRad * 1.6;
    sloshSpring.step(dt, 0, sloshKick);
    const sloshRad = clampAbs(sloshSpring.value, WATER_SLOSH_MAX_DEG * DEG2RAD);
    tank.surface.rotation.z = -tiltRad + sloshRad;

    // Hanging lamp: damped pendulum toward world-down, kicked by the same angular velocity.
    const lampKick = -angularVelRad * 2.1;
    lampSpring.step(dt, 0, lampKick);
    const swingRad = clampAbs(lampSpring.value, LAMP_SWING_MAX_DEG * DEG2RAD);
    lamp.arm.rotation.z = -tiltRad + swingRad;

    // Ball: rolls toward the low side proportional to sin(tilt), spring-returns when level.
    const floorRange = CABIN_FLOOR_HALF_EXTENTS.x - BALL_RADIUS - 0.05;
    const target = MAX_TILT_RAD > 0 ? (floorRange * Math.sin(tiltRad)) / Math.sin(MAX_TILT_RAD) : 0;
    ballSpringX.step(dt, target);
    ball.position.x = clampAbs(ballSpringX.value, floorRange);
  }

  return { group, update };
}
