// src/app/presentationWiring.ts
// Wave 3 integration point: connects Worker B's VFX factories (src/vfx/**)
// and AudioDirector (src/audio/**) to the shared bus's GameEvents, anchored
// at Worker A's SceneAnchors (src/scenes/anchors.ts). Per docs/CONTRACTS.md
// "配線規約": "B の VFX/材質はこのアンカーへ Integrator が接続する".
//
// Also supersedes the two placeholder visuals Worker A's own scene ships
// with a real VFX pass would otherwise double-render alongside
// (src/scenes/build/fountains.ts nozzle cones, src/scenes/build/pipes.ts tube
// + blob): those are hidden here rather than deleted, so Worker A's own
// colocated unit tests (which build the scene without this wiring) still see
// their original, fully-functional placeholders.

import * as THREE from 'three';
import { ALL_FOUNTAIN_IDS, type AudioCue, type FountainId, type GamePhase, type SceneContext } from '../contracts';
import { getSceneAnchors } from '../scenes/anchors';
import type { HeroMaterialsHandle } from '../render';
import { createWaterJet, createPipeFlow, type WaterJet, type WaterJetKind, type PipeFlow } from '../vfx';

const JET_KIND: Record<FountainId, WaterJetKind> = {
  'fountain-fan': 'fan',
  'fountain-ring': 'ring',
  'fountain-crown': 'crown',
};

const SPLASH_CUE: Record<FountainId, AudioCue> = {
  'fountain-fan': 'fountain-splash-fan',
  'fountain-ring': 'fountain-splash-ring',
  'fountain-crown': 'fountain-splash-crown',
};

/** Normalizes valve angular velocity (rad/s) into a 0..1 creak intensity. */
function valveCreakIntensity(angularVelocityRadPerSec: number): number {
  return THREE.MathUtils.clamp(Math.abs(angularVelocityRadPerSec) / 6, 0, 1);
}

export interface PresentationWiring {
  /** Call once per frame (main.ts's own rAF loop) to advance VFX shader time. */
  update(dt: number, elapsed: number): void;
  dispose(): void;
}

export function wirePresentation(ctx: SceneContext, heroHandle: HeroMaterialsHandle): PresentationWiring {
  const anchors = getSceneAnchors();

  // Supersede Worker A's placeholder nozzle cones + pipe network with Worker
  // B's real VFX, so both don't render stacked on top of each other.
  for (const id of ALL_FOUNTAIN_IDS) {
    const nozzle = ctx.scene.getObjectByName(anchors.fountains[id].nozzleName);
    if (nozzle) nozzle.visible = false;
  }
  const pipeNetwork = ctx.scene.getObjectByName('pipe-network');
  if (pipeNetwork) pipeNetwork.visible = false;

  const waterJets = {} as Record<FountainId, WaterJet>;
  const pipeFlows = {} as Record<FountainId, PipeFlow>;
  for (const id of ALL_FOUNTAIN_IDS) {
    const jet = createWaterJet(JET_KIND[id], ctx.quality);
    jet.group.position.copy(anchors.fountains[id].center).setY(0.16);
    jet.setIntensity(0);
    ctx.scene.add(jet.group);
    waterJets[id] = jet;

    const pipe = createPipeFlow(anchors.pipeCurves[id]);
    ctx.scene.add(pipe.group);
    pipeFlows[id] = pipe;
  }

  let phase: GamePhase = 'title';
  let wetnessApplied = false;
  let lastResistPlayedAt = -Infinity;
  const RESIST_COOLDOWN_SEC = 0.25;
  let elapsedClock = 0;

  const unsubEvent = ctx.bus.onEvent((event) => {
    switch (event.kind) {
      case 'phase-changed': {
        const leavingValve = phase === 'valve-turn' && event.phase !== 'valve-turn';
        const leavingPipe = phase === 'pipe-run' && event.phase !== 'pipe-run';
        phase = event.phase;
        if (leavingValve) ctx.audio.setIntensity('valve-creak', 0);
        if (leavingPipe) ctx.audio.setIntensity('pipe-rush', 0);
        break;
      }
      case 'whistle-blown': {
        ctx.audio.play('whistle');
        break;
      }
      case 'valve-progress': {
        ctx.audio.setIntensity('valve-creak', valveCreakIntensity(event.angularVelocityRadPerSec));
        break;
      }
      case 'water-progress': {
        pipeFlows[event.fountain]?.setProgress(event.t);
        ctx.audio.setIntensity('pipe-rush', THREE.MathUtils.clamp(0.3 + 0.7 * event.t, 0, 1));
        break;
      }
      case 'water-arrived': {
        pipeFlows[event.fountain]?.setProgress(1);
        ctx.audio.setIntensity('pipe-rush', 0);
        break;
      }
      case 'fountain-flow': {
        waterJets[event.fountain]?.setIntensity(event.intensity);
        ctx.audio.setIntensity(SPLASH_CUE[event.fountain], event.intensity);
        if (!wetnessApplied && event.intensity > 0.5) {
          wetnessApplied = true;
          heroHandle.setWetness(1);
        }
        break;
      }
      case 'finale-started': {
        ctx.audio.play('finale-chord');
        break;
      }
      default:
        break;
    }
  });

  // MASTER_SPEC: counter-clockwise input during valve-turn gets a light
  // resistance cue rather than being treated as failure — raw ActionIntent,
  // not a GameEvent (openness itself never reacts to it).
  const unsubIntent = ctx.bus.onIntent((intent) => {
    if (
      intent.kind === 'valve-rotate' &&
      phase === 'valve-turn' &&
      intent.deltaAngleRad < 0 &&
      elapsedClock - lastResistPlayedAt > RESIST_COOLDOWN_SEC
    ) {
      lastResistPlayedAt = elapsedClock;
      ctx.audio.play('valve-resist', { gain: 0.35 });
    }
  });

  return {
    update(dt: number, elapsed: number): void {
      elapsedClock = elapsed;
      for (const id of ALL_FOUNTAIN_IDS) {
        waterJets[id]?.update(dt, elapsed);
        pipeFlows[id]?.update(dt, elapsed);
      }
    },
    dispose(): void {
      unsubEvent();
      unsubIntent();
      for (const id of ALL_FOUNTAIN_IDS) {
        waterJets[id]?.dispose();
        ctx.scene.remove(waterJets[id]!.group);
        pipeFlows[id]?.dispose();
        ctx.scene.remove(pipeFlows[id]!.group);
      }
    },
  };
}
