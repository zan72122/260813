// src/scene/index.ts
// Orchestrates every procedural piece (tower, crane, beam/ghost, rivet+forge,
// worker team, Paris backdrop, yard) into one scene graph and maps
// GameState -> world transforms every frame. This is the "game logic ->
// 3D pose" translation layer; core/index.ts owns the THREE.Scene/camera/
// renderer and just calls update()/dispose() here, and render/camera.ts
// reads `points` to frame the camera without needing 3D construction
// knowledge of its own.
//
// All continuous idle motion (chimney sway, hammer ready-sway, etc.) is
// driven off an internally accumulated sim-time (sum of dtMs), never
// performance.now()/Date.now()/Math.random() — this keeps ?test=1 fully
// deterministic given a fixed dt sequence, per ARCHITECTURE_CONTRACT.md.

import { BoxGeometry, Group, Mesh, Vector3 } from 'three';
import type { Camera } from 'three';
import { mulberry32 } from '../contracts/machine';
import type { AnchorId, GamePhase, GameState } from '../contracts/types';
import { buildMaterialSet, disposeMaterialSet, type MaterialSet } from '../visual/materials';
import { buildTextureSet, disposeTextureSet } from '../visual/textures';
import { createSteamSystem } from '../visual/steam';
import { createSparkSystem } from '../visual/sparks';
import { createBlobShadowSystem } from '../visual/shadow';
import { createTowerRig, TOWER_MAX_HEIGHT } from './tower';
import { createCraneRig } from './crane';
import { createBeamRig } from './beam';
import { createRivetRig } from './rivet';
import { createWorkerTeam } from './workers';
import { createBackdropRig } from './backdrop';
import { createYardRig } from './yard';
import { createCableRig } from './cable';
import { endpointsChanged } from './cableMath';
import { LEG_ANGLES, LEVEL_HEIGHT } from './curve';

const OPERATING_LEG_INDEX = 0;
const OPERATING_ANGLE = LEG_ANGLES[OPERATING_LEG_INDEX]!;
const YARD_BEAM_Y = 0.35;
const HOOK_IDLE_DROP = 0.55;
const HOOK_RELEASE_MS = 500;

export interface ScenePoints {
  hook: Vector3;
  beam: Vector3;
  ghost: Vector3;
  forge: Vector3;
  rivetHole: Vector3;
  hammerSpot: Vector3;
  craneTop: Vector3;
  craneBase: Vector3;
  towerTop: Vector3;
  /** On-axis (x=0,z=0) point at a good framing height, for wide establishing/reveal/complete shots — towerTop itself sits on the leg surface and reads badly as a camera subject. */
  towerAxis: Vector3;
  climbLever: Vector3;
  startLever: Vector3;
  workers: [Vector3, Vector3, Vector3, Vector3];
}

export interface AnchorWorld {
  pos: Vector3;
  r: number;
  active: boolean;
}

export interface SceneRig {
  root: Group;
  points: ScenePoints;
  anchorWorld: Map<AnchorId, AnchorWorld>;
  update(state: GameState, dtMs: number, camera: Camera, testMode: boolean): void;
  setQualityDetail(detail: 'full' | 'reduced' | 'minimal'): void;
  setParticleCaps(steamMax: number, sparkMax: number): void;
  dispose(): void;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Rotate a beam/slot-local (x along beam length, z depth) offset by `angle` around Y and add to `origin`. */
function rotateLocal(
  localX: number,
  localY: number,
  localZ: number,
  angle: number,
  origin: Vector3,
  out: Vector3,
): Vector3 {
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);
  out.set(origin.x + localX * cosA - localZ * sinA, origin.y + localY, origin.z + localX * sinA + localZ * cosA);
  return out;
}

const EMPTY_ANCHOR_SET: ReadonlySet<AnchorId> = new Set();

/** Which anchors are interactable (active) per phase. Positions stay current
 * every frame regardless; this only gates the `active` flag published to
 * the registry so Input doesn't hit-test anchors that aren't this step's verb. */
const ANCHOR_ACTIVE_BY_PHASE: Partial<Record<GamePhase, ReadonlySet<AnchorId>>> = {
  title: new Set(['lever']),
  hookDown: new Set(['hook']),
  hoist: new Set(['hook']),
  align: new Set(['beam', 'ghost']),
  bolts: new Set(['bolt0', 'bolt1', 'hole0', 'hole1']),
  rivetHeat: new Set(['forge']),
  rivetCarry: new Set(['tongs']),
  rivetInsert: new Set(['rivetHole']),
  rivetHammer: new Set(['hammerSpot']),
  sling: new Set(['slingClasp']),
  climb: new Set(['climbLever']),
  playRivet: new Set(['forge', 'tongs', 'rivetHole', 'hammerSpot']),
  playClimb: new Set(['climbLever']),
};

/** A brief downward swing pulse timed off simTimeMs + hit count so each hit reads as a fresh swing. */
function hammerPose(hits: 0 | 1 | 2 | 3, simTimeMs: number): number {
  const phase = (simTimeMs * 0.006 + hits * 2.1) % (Math.PI * 2);
  return Math.sin(phase) * 0.12 - 0.15;
}

export function createSceneRig(seed: number): SceneRig {
  const materialsRand = mulberry32((seed ^ 0x51ed) >>> 0);
  const backdropRand = mulberry32((seed ^ 0x7a11) >>> 0);
  const yardRand = mulberry32((seed ^ 0x9c31) >>> 0);
  const clothRand = mulberry32((seed ^ 0xc0de) >>> 0);

  const root = new Group();
  root.name = 'sceneRoot';

  const textures = buildTextureSet(materialsRand);
  const materials: MaterialSet = buildMaterialSet(textures);

  const tower = createTowerRig(materials);
  root.add(tower.group);

  const crane = createCraneRig(materials);
  root.add(crane.group);
  root.add(crane.hookBlock);

  const beam = createBeamRig(materials);
  root.add(beam.group, beam.ghostGroup, beam.boltGroup);

  const rivet = createRivetRig(materials);
  root.add(rivet.rivetGroup, rivet.forgeGroup);

  const team = createWorkerTeam(materials, Math.floor(clothRand() * 5));
  root.add(team.heater.group, team.catcher.group, team.holder.group, team.striker.group);
  crane.driverSlot.add(team.driver.group);

  const backdrop = createBackdropRig(materials, textures.softCircle, backdropRand);
  root.add(backdrop.group);

  const yard = createYardRig(materials, yardRand);
  root.add(yard.group);

  const cable = createCableRig(materials);
  root.add(cable.mesh);

  const steam = createSteamSystem(textures.softCircle);
  root.add(steam.mesh);
  const sparks = createSparkSystem(textures.spark);
  root.add(sparks.mesh);
  const shadows = createBlobShadowSystem(8);
  root.add(shadows.mesh);

  // ---- working platform under the current beam slot (simple static prop) ----
  const platformGeo = new BoxGeometry(4.2, 0.14, 2.1);
  const platform = new Mesh(platformGeo, materials.timber);
  root.add(platform);

  // ---- decorative title-screen "start lever" ---------------------------------
  const startLeverWorldPos = new Vector3(3.4, 0, 6.4);
  const startLever = new Group();
  const leverPostGeo = new BoxGeometry(0.12, 1.1, 0.12);
  const leverPost = new Mesh(leverPostGeo, materials.ironDark);
  leverPost.position.y = 0.55;
  startLever.add(leverPost);
  const leverArmGeo = new BoxGeometry(0.7, 0.14, 0.14);
  const leverArm = new Mesh(leverArmGeo, materials.brass);
  leverArm.position.set(0.3, 1.05, 0);
  leverArm.rotation.z = -0.5;
  startLever.add(leverArm);
  startLever.position.copy(startLeverWorldPos);
  root.add(startLever);

  const points: ScenePoints = {
    hook: new Vector3(),
    beam: new Vector3(),
    ghost: new Vector3(),
    forge: new Vector3(),
    rivetHole: new Vector3(),
    hammerSpot: new Vector3(),
    craneTop: new Vector3(),
    craneBase: new Vector3(),
    towerTop: new Vector3(),
    towerAxis: new Vector3(),
    climbLever: new Vector3(),
    startLever: startLeverWorldPos.clone(),
    workers: [new Vector3(), new Vector3(), new Vector3(), new Vector3()],
  };

  const anchorWorld = new Map<AnchorId, AnchorWorld>();

  // ---- per-instance mutable animation/tracking state (declared before use) ----
  let currentTowerLevel = -1;
  let currentBeamShape: GameState['beamShape'] | null = null;
  let hookReleaseT = 0;
  let simTimeMs = 0;
  let idleSteamAccumMs = 0;
  let valveSteamAccumMs = 0;
  let lastHits: 0 | 1 | 2 | 3 = 0;
  const boltSeatLocal: [number, number] = [0, 0];
  const tmpVec = new Vector3();
  const prevCableEndpoints = { drum: new Vector3(), sheave: new Vector3(), hook: new Vector3() };
  let firstCableBuild = true;

  function setAnchor(id: AnchorId, pos: Vector3, r: number, active: boolean): void {
    let entry = anchorWorld.get(id);
    if (!entry) {
      entry = { pos: new Vector3(), r, active };
      anchorWorld.set(id, entry);
    }
    entry.pos.copy(pos);
    entry.r = r;
    entry.active = active;
  }

  function update(state: GameState, dtMs: number, camera: Camera, testMode: boolean): void {
    simTimeMs += dtMs;
    steam.setReducedMotion(state.prefs.reducedMotion);

    // ---- tower level ---------------------------------------------------------
    if (state.towerLevel !== currentTowerLevel) {
      currentTowerLevel = state.towerLevel;
      tower.setLevel(currentTowerLevel);
    }

    // ---- beam shape ------------------------------------------------------------
    if (state.beamShape !== currentBeamShape) {
      currentBeamShape = state.beamShape;
      beam.setShape(currentBeamShape);
    }

    // ---- slot (where the current beam attaches) ---------------------------------
    const slotPos = tower.topOfLeg(OPERATING_LEG_INDEX);
    beam.placeSlot(slotPos, OPERATING_ANGLE);
    points.towerTop.copy(slotPos);
    points.towerAxis.set(0, Math.max(tower.builtHeight * 0.55, 3.5), 0);
    points.ghost.copy(beam.ghostGroup.position);

    platform.position.set(slotPos.x, slotPos.y - 0.55, slotPos.z);
    platform.rotation.y = OPERATING_ANGLE;
    rotateLocal(-2.0, -0.55, 1.0, OPERATING_ANGLE, slotPos, points.forge);
    rotateLocal(0, -0.55, 1.0, OPERATING_ANGLE, slotPos, points.hammerSpot);

    // ---- crane carriage height ---------------------------------------------------
    const climbing = state.phase === 'climb' || state.phase === 'playClimb';
    const craneT = climbing ? Math.min(Math.max(state.climb.progress, 0), 1) : 0;
    const craneHeightWorld = tower.builtHeight + craneT * LEVEL_HEIGHT;
    const craneProfileT = Math.min(craneHeightWorld / TOWER_MAX_HEIGHT, 1);
    crane.setCarriage(OPERATING_ANGLE, craneProfileT, craneHeightWorld);
    crane.setBoomTilt(-0.15);
    crane.setIdlePhase(simTimeMs * 0.001);

    // wheel spin: rate follows valve/lever opening during climb, gentle idle otherwise
    const spinRate = climbing ? 4 + state.climb.lever * 10 : 0.4;
    crane.setWheelSpin((spinRate * dtMs) / 1000);

    points.craneTop.copy(crane.anchors.sheaveWorld);
    points.craneBase.copy(crane.anchors.wheelWorld);
    points.climbLever.copy(crane.anchors.climbLeverWorld);

    // ---- hook / beam pose ---------------------------------------------------------
    const attached = state.hook.attached;
    const snapped = state.align.snapped;
    const sheave = crane.anchors.sheaveWorld;

    if (!attached) {
      const y = lerp(sheave.y - HOOK_IDLE_DROP, YARD_BEAM_Y + 0.5, state.hook.depth);
      crane.hookBlock.position.set(sheave.x, y, sheave.z);
      hookReleaseT = 0;
    } else if (!snapped) {
      const hangBaseY = lerp(YARD_BEAM_Y + 0.3, slotPos.y, state.hoist.height);
      const hangLength = Math.max(sheave.y - hangBaseY, 0.2);
      const swayOffset = hangLength * Math.sin(state.hoist.sway);
      const alignPhase = state.phase === 'align';
      const dx = alignPhase ? state.align.dx : 0;
      const dy = alignPhase ? state.align.dy : 0;
      crane.hookBlock.position.set(sheave.x + swayOffset + dx, hangBaseY + dy, sheave.z);
      hookReleaseT = 0;
    } else if (!state.sling.released) {
      crane.hookBlock.position.copy(beam.slotAttachPosition);
      hookReleaseT = 0;
    } else {
      hookReleaseT = testMode ? 1 : Math.min(hookReleaseT + dtMs / HOOK_RELEASE_MS, 1);
      const idlePos = tmpVec.set(sheave.x, sheave.y - HOOK_IDLE_DROP, sheave.z);
      crane.hookBlock.position.lerpVectors(beam.slotAttachPosition, idlePos, hookReleaseT);
    }
    points.hook.copy(crane.hookBlock.position);

    if (!snapped) {
      // beam hangs directly under the hook while it's being carried/aligned
      const dropped = tmpVec.copy(crane.hookBlock.position);
      dropped.y -= 0.3;
      beam.setBeamPose(dropped, OPERATING_ANGLE + Math.PI / 2, 0);
    } else {
      beam.setBeamPose(slotPos, OPERATING_ANGLE, 0);
    }
    beam.group.getWorldPosition(points.beam);

    const ghostVisible = !snapped;
    beam.ghostGroup.visible = ghostVisible;
    if (ghostVisible) {
      const pulseAmp = state.prefs.reducedMotion ? 0 : 0.06;
      const pulse = 1 + pulseAmp * Math.sin(simTimeMs * 0.0025);
      beam.setGhostPulse(pulse, state.prefs.reducedMotion ? 0.45 : 0.38);
    }

    // ---- bolts: locally animate a seat-progress spring toward the boolean target
    for (let i = 0; i < 2; i += 1) {
      const target = state.bolts[i] ? 1 : 0;
      const current = boltSeatLocal[i]!;
      const next = testMode ? target : current + (target - current) * Math.min(dtMs / 220, 1);
      boltSeatLocal[i] = next;
      beam.setBoltSeat(i as 0 | 1, next);
    }

    // ---- rivet position + color ---------------------------------------------------
    rivet.setColor(state.rivet.temp, state.rivet.cooled);
    rivet.setFormed(state.rivet.hits / 3);
    rivet.update(dtMs);

    points.rivetHole.copy(beam.rivetHolePosition);
    const stationPoints: readonly Vector3[] = [
      points.forge,
      team.catcher.toolTip,
      team.holder.toolTip,
      beam.rivetHolePosition,
    ];
    const rivetPos = state.rivet.inserted
      ? beam.rivetHolePosition
      : (stationPoints[state.rivet.station] ?? points.forge);
    rivet.rivetGroup.position.copy(rivetPos);
    rivet.rivetGroup.rotation.set(Math.PI / 2, 0, OPERATING_ANGLE);
    rivet.rivetGroup.visible = state.rivet.temp > 0.001 || state.rivet.inserted;

    // ---- worker poses (driven by rivet station/hits from the store) ----------------
    rotateLocal(-2.2, -0.55, 1.25, OPERATING_ANGLE, slotPos, tmpVec);
    team.heater.group.position.copy(tmpVec);
    team.heater.group.rotation.y = OPERATING_ANGLE + Math.PI;
    rotateLocal(-0.9, -0.55, 1.1, OPERATING_ANGLE, slotPos, tmpVec);
    team.catcher.group.position.copy(tmpVec);
    team.catcher.group.rotation.y = OPERATING_ANGLE + Math.PI;
    rotateLocal(0.3, -0.5, -0.35, OPERATING_ANGLE, slotPos, tmpVec);
    team.holder.group.position.copy(tmpVec);
    team.holder.group.rotation.y = OPERATING_ANGLE;
    rotateLocal(0.3, -0.55, 1.05, OPERATING_ANGLE, slotPos, tmpVec);
    team.striker.group.position.copy(tmpVec);
    team.striker.group.rotation.y = OPERATING_ANGLE + Math.PI;

    const readySwing = Math.sin(simTimeMs * 0.004) * 0.1;
    team.heater.setPose(state.rivet.station === 0 ? readySwing - 0.3 : -0.1, 0);
    team.catcher.setPose(state.rivet.station === 1 ? readySwing - 0.4 : -0.1, 0);
    team.holder.setPose(state.rivet.station >= 2 ? -0.9 : -0.2, 0.2);
    team.striker.setPose(hammerPose(state.rivet.hits, simTimeMs), 0);
    team.driver.setPose(Math.sin(simTimeMs * 0.002) * 0.05, 0);

    points.workers[0].copy(team.heater.group.position);
    points.workers[1].copy(team.catcher.group.position);
    points.workers[2].copy(team.holder.group.position);
    points.workers[3].copy(team.striker.group.position);

    // ---- cable rebuild (only when endpoints move beyond epsilon) -------------------
    const cableEndpoints = {
      drum: crane.anchors.drumWorld,
      sheave: crane.anchors.sheaveWorld,
      hook: crane.hookBlock.position,
    };
    if (firstCableBuild || endpointsChanged(prevCableEndpoints, cableEndpoints)) {
      cable.rebuild(cableEndpoints, hookReleaseT);
      prevCableEndpoints.drum.copy(cableEndpoints.drum);
      prevCableEndpoints.sheave.copy(cableEndpoints.sheave);
      prevCableEndpoints.hook.copy(cableEndpoints.hook);
      firstCableBuild = false;
    }

    // ---- steam: chimney idle wisp + climb valve bursts ------------------------------
    tmpVec.set(crane.group.position.x, crane.group.position.y + 2.1, crane.group.position.z);
    idleSteamAccumMs += dtMs;
    const idleSteamInterval = state.prefs.reducedMotion ? 900 : 550;
    if (idleSteamAccumMs > idleSteamInterval) {
      idleSteamAccumMs = 0;
      steam.burst(tmpVec.x, tmpVec.y, tmpVec.z, 1);
    }
    if (climbing) {
      valveSteamAccumMs += dtMs;
      const interval = Math.max(90 - state.climb.lever * 60, 30);
      if (valveSteamAccumMs > interval) {
        valveSteamAccumMs = 0;
        steam.burst(crane.group.position.x, crane.group.position.y + 0.3, crane.group.position.z, 2);
      }
    }
    steam.update(dtMs, camera);
    sparks.update(dtMs, camera);

    // ---- spark burst on a fresh hammer hit ------------------------------------------
    if (state.rivet.hits !== lastHits) {
      if (state.rivet.hits > lastHits) {
        sparks.burst(points.rivetHole.x, points.rivetHole.y, points.rivetHole.z, 8);
      }
      lastHits = state.rivet.hits;
    }

    // ---- blob shadows -----------------------------------------------------------------
    let si = 0;
    shadows.setAt(si++, crane.group.position.x, crane.group.position.y - 0.15, crane.group.position.z, 0.9);
    shadows.setAt(si++, points.beam.x, slotPos.y - 0.55, points.beam.z, 1.4);
    shadows.setAt(si++, team.heater.group.position.x, team.heater.group.position.y - 0.02, team.heater.group.position.z, 0.35);
    shadows.setAt(si++, team.catcher.group.position.x, team.catcher.group.position.y - 0.02, team.catcher.group.position.z, 0.35);
    shadows.setAt(si++, team.holder.group.position.x, team.holder.group.position.y - 0.02, team.holder.group.position.z, 0.35);
    shadows.setAt(si++, team.striker.group.position.x, team.striker.group.position.y - 0.02, team.striker.group.position.z, 0.35);
    shadows.setAt(si++, 8, 0.01, -4, 0.6);
    shadows.setAt(si++, points.startLever.x, 0.01, points.startLever.z, state.phase === 'title' ? 0.4 : 0);
    shadows.commit();

    startLever.visible = state.phase === 'title' || state.phase === 'loading';

    // ---- anchor registry (world positions; core/render projects to screen) -----------
    const activePhaseSet = ANCHOR_ACTIVE_BY_PHASE[state.phase] ?? EMPTY_ANCHOR_SET;
    setAnchor('hook', points.hook, 0.5, activePhaseSet.has('hook'));
    setAnchor('beam', points.beam, 0.9, activePhaseSet.has('beam'));
    setAnchor('ghost', points.ghost, 0.9, activePhaseSet.has('ghost') && ghostVisible);
    setAnchor('lever', points.startLever, 0.7, activePhaseSet.has('lever'));
    setAnchor('bolt0', beam.boltCurrentPosition(0), 0.4, activePhaseSet.has('bolt0'));
    setAnchor('bolt1', beam.boltCurrentPosition(1), 0.4, activePhaseSet.has('bolt1'));
    setAnchor('hole0', beam.holePositions[0]!, 0.4, activePhaseSet.has('hole0'));
    setAnchor('hole1', beam.holePositions[1]!, 0.4, activePhaseSet.has('hole1'));
    setAnchor('forge', points.forge, 0.5, activePhaseSet.has('forge'));
    setAnchor('tongs', team.catcher.toolTip, 0.45, activePhaseSet.has('tongs'));
    setAnchor('rivetHole', points.rivetHole, 0.4, activePhaseSet.has('rivetHole'));
    setAnchor('hammerSpot', points.hammerSpot, 0.5, activePhaseSet.has('hammerSpot'));
    setAnchor('slingClasp', beam.slotAttachPosition, 0.4, activePhaseSet.has('slingClasp'));
    setAnchor('climbLever', points.climbLever, 0.45, activePhaseSet.has('climbLever'));
    setAnchor('worker0', points.workers[0], 0.4, activePhaseSet.has('worker0'));
    setAnchor('worker1', points.workers[1], 0.4, activePhaseSet.has('worker1'));
    setAnchor('worker2', points.workers[2], 0.4, activePhaseSet.has('worker2'));
    setAnchor('worker3', points.workers[3], 0.4, activePhaseSet.has('worker3'));
  }

  function setQualityDetail(detail: 'full' | 'reduced' | 'minimal'): void {
    backdrop.setDetail(detail);
  }

  function setParticleCaps(steamMax: number, sparkMax: number): void {
    steam.setCap(steamMax);
    sparks.setCap(sparkMax);
  }

  function dispose(): void {
    tower.dispose();
    crane.dispose();
    beam.dispose();
    rivet.dispose();
    team.dispose();
    backdrop.dispose();
    yard.dispose();
    cable.dispose();
    steam.dispose(root);
    sparks.dispose(root);
    shadows.dispose(root);
    platformGeo.dispose();
    leverPostGeo.dispose();
    leverArmGeo.dispose();
    disposeMaterialSet(materials);
    disposeTextureSet(textures);
  }

  return {
    root,
    points,
    anchorWorld,
    update,
    setQualityDetail,
    setParticleCaps,
    dispose,
  };
}
