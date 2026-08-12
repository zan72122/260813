// src/game/director.ts
// The game director: owns the full phase flow from garden-idle through
// replay-choice (title -> garden-idle is the app skeleton's job, see
// src/app/phaseMachine.ts). Consumes ActionIntent from the bus, integrates
// valve/water/procession state, and emits every GameEvent in the causal
// chain: whistle-blown -> valve-progress* -> valve-opened -> water-progress*
// -> water-arrived -> fountain-flow* -> (loop) -> finale-started ->
// loop-completed. See docs/CONTRACTS.md "因果のデータフロー".

import {
  ALL_FOUNTAIN_IDS,
  type ActionIntent,
  type FountainId,
  type GameEvent,
  type GamePhase,
  type SceneContext,
} from '../contracts';
import { HintTimer } from './hintTimer';
import { KingProcession } from './procession';
import { FINALE_HOLD_SEC, REVEAL_TOTAL_SEC, VALVE_APPROACH_SEC } from './timing';
import { ValveModel } from './valve';
import { fountainFlowIntensity, isRevealHoldComplete, pipeRunDurationSec } from './water';

export interface GameDirectorState {
  phase: GamePhase;
  fountain: FountainId | null;
  openness: number;
  waterProgress: number;
  flowIntensity: number;
  freeValveMode: boolean;
}

export class GameDirector {
  private readonly ctx: SceneContext;

  private phase: GamePhase = 'title';
  private fountain: FountainId | null = null;
  private phaseElapsed = 0;
  private started = false;

  private readonly valve = new ValveModel();
  private readonly procession = new KingProcession();
  private readonly hintWhistle = new HintTimer();
  private readonly hintValve = new HintTimer();
  private readonly hintChoice = new HintTimer();

  private pipeRunDuration = 3;
  private waterProgress = 0;
  private waterArrivedEmitted = false;
  private flowIntensity = 0;

  private freeValveMode = false;
  private freeValveIndex = 0;

  private readonly unsubscribers: Array<() => void> = [];

  constructor(ctx: SceneContext) {
    this.ctx = ctx;
    this.unsubscribers.push(
      ctx.bus.onIntent((intent) => this.handleIntent(intent)),
      ctx.bus.onEvent((event) => {
        // The app skeleton (src/app/phaseMachine.ts) owns title -> garden-idle
        // on the first tap; we pick up the moment that first garden-idle
        // arrives, wherever it came from, so we never race construction order.
        if (!this.started && event.kind === 'phase-changed' && event.phase === 'garden-idle') {
          this.started = true;
          this.procession.reset();
          this.enterGardenIdle(this.procession.currentFountain);
        }
      }),
    );
  }

  getState(): GameDirectorState {
    return {
      phase: this.phase,
      fountain: this.fountain,
      openness: this.valve.openness,
      waterProgress: this.waterProgress,
      flowIntensity: this.flowIntensity,
      freeValveMode: this.freeValveMode,
    };
  }

  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;
  }

  update(dt: number): void {
    if (!this.started) return;
    this.phaseElapsed += dt;

    switch (this.phase) {
      case 'garden-idle': {
        this.procession.update(dt);
        if (this.procession.hasArrived) this.enterWhistleCue();
        break;
      }
      case 'whistle-cue': {
        if (this.hintWhistle.tick(dt)) this.emit({ kind: 'hint', target: 'whistle' });
        break;
      }
      case 'valve-approach': {
        if (this.phaseElapsed >= VALVE_APPROACH_SEC) this.beginValveTurn(this.mustFountain());
        break;
      }
      case 'valve-turn': {
        this.valve.update(dt);
        if (this.hintValve.tick(dt)) this.emit({ kind: 'hint', target: 'valve' });
        this.emitValveProgress();
        break;
      }
      case 'pipe-run': {
        this.waterProgress = Math.min(1, this.phaseElapsed / this.pipeRunDuration);
        this.emit({ kind: 'water-progress', t: this.waterProgress, fountain: this.mustFountain() });
        if (this.waterProgress >= 1 && !this.waterArrivedEmitted) {
          this.waterArrivedEmitted = true;
          this.emit({ kind: 'water-arrived', fountain: this.mustFountain() });
          this.enterFountainReveal();
        }
        break;
      }
      case 'fountain-reveal': {
        this.flowIntensity = fountainFlowIntensity(this.phaseElapsed);
        this.emit({ kind: 'fountain-flow', fountain: this.mustFountain(), intensity: this.flowIntensity });
        if (isRevealHoldComplete(this.phaseElapsed) && this.phaseElapsed >= REVEAL_TOTAL_SEC) {
          this.completeFountainReveal();
        }
        break;
      }
      case 'finale': {
        if (this.phaseElapsed >= FINALE_HOLD_SEC) this.enterReplayChoice();
        break;
      }
      case 'replay-choice': {
        if (this.hintChoice.tick(dt)) this.emit({ kind: 'hint', target: 'choice' });
        break;
      }
      default:
        break;
    }
  }

  // ---- intent handling ----------------------------------------------

  private handleIntent(intent: ActionIntent): void {
    if (intent.kind === 'whistle-blow' && this.phase === 'whistle-cue') {
      this.hintWhistle.disarm();
      this.emit({ kind: 'whistle-blown' });
      this.enterValveApproach();
      return;
    }
    if (intent.kind === 'valve-rotate' && this.phase === 'valve-turn') {
      this.valve.applyRotation(intent.deltaAngleRad, intent.angularVelocityRadPerSec);
      this.hintValve.notifyActivity();
      this.emitValveProgress();
      if (this.valve.isFullyOpen) this.openValveAndProceed();
      return;
    }
    if (intent.kind === 'choice' && this.phase === 'replay-choice') {
      this.handleChoice(intent.choice);
    }
  }

  private emitValveProgress(): void {
    const snap = this.valve.snapshot();
    this.emit({ kind: 'valve-progress', openness: snap.openness, angularVelocityRadPerSec: snap.angularVelocityRadPerSec });
  }

  // ---- phase transitions ----------------------------------------------

  private enterGardenIdle(fountain: FountainId): void {
    this.hintWhistle.disarm();
    this.hintValve.disarm();
    this.hintChoice.disarm();
    this.setPhase('garden-idle', fountain);
  }

  private enterWhistleCue(): void {
    this.setPhase('whistle-cue', this.procession.currentFountain);
    this.hintWhistle.arm();
  }

  private enterValveApproach(): void {
    this.setPhase('valve-approach', this.mustFountain());
  }

  private beginValveTurn(fountain: FountainId): void {
    this.valve.reset();
    this.waterArrivedEmitted = false;
    this.waterProgress = 0;
    this.flowIntensity = 0;
    this.setPhase('valve-turn', fountain);
    this.hintValve.arm();
  }

  private openValveAndProceed(): void {
    this.hintValve.disarm();
    const fountain = this.mustFountain();
    this.emit({ kind: 'valve-opened', fountain });
    this.pipeRunDuration = pipeRunDurationSec(this.valve.averageAngularVelocity);
    this.waterArrivedEmitted = false;
    this.waterProgress = 0;
    this.setPhase('pipe-run', fountain);
  }

  private enterFountainReveal(): void {
    this.setPhase('fountain-reveal', this.mustFountain());
  }

  private completeFountainReveal(): void {
    if (this.freeValveMode) {
      this.beginValveTurn(this.nextFreeValveFountain());
      return;
    }
    if (this.procession.isLastFountain) {
      this.enterFinale();
      return;
    }
    this.procession.advanceToNextFountain();
    this.enterGardenIdle(this.procession.currentFountain);
  }

  private enterFinale(): void {
    this.setPhase('finale', null);
    this.emit({ kind: 'finale-started' });
    for (const id of ALL_FOUNTAIN_IDS) {
      this.emit({ kind: 'fountain-flow', fountain: id, intensity: 1 });
    }
  }

  private enterReplayChoice(): void {
    this.setPhase('replay-choice', null);
    this.emit({ kind: 'loop-completed' });
    this.hintChoice.arm();
  }

  private handleChoice(choice: 'same' | 'restart' | 'free-valve'): void {
    this.hintChoice.disarm();
    if (choice === 'same') {
      this.freeValveMode = false;
      this.procession.restartCurrentLeg();
      this.enterWhistleCue(); // king is already at the stop: 1 tap to replay
    } else if (choice === 'restart') {
      this.freeValveMode = false;
      this.procession.reset();
      for (const id of ALL_FOUNTAIN_IDS) this.emit({ kind: 'fountain-flow', fountain: id, intensity: 0 });
      // garden-idle requires no tap at all, so the ~4.5s walk-up still keeps
      // the player at "playable again within 2 taps" (choice + whistle).
      this.enterGardenIdle(this.procession.currentFountain);
    } else {
      this.freeValveMode = true;
      this.freeValveIndex = 0;
      this.beginValveTurn(this.nextFreeValveFountain());
    }
  }

  private nextFreeValveFountain(): FountainId {
    const id = ALL_FOUNTAIN_IDS[this.freeValveIndex % ALL_FOUNTAIN_IDS.length] ?? 'fountain-fan';
    this.freeValveIndex += 1;
    return id;
  }

  // ---- helpers ----------------------------------------------

  private setPhase(phase: GamePhase, fountain: FountainId | null): void {
    this.phase = phase;
    this.fountain = fountain;
    this.phaseElapsed = 0;
    this.emit({ kind: 'phase-changed', phase, fountain });
  }

  private mustFountain(): FountainId {
    if (!this.fountain) throw new Error(`GameDirector: expected an active fountain in phase ${this.phase}`);
    return this.fountain;
  }

  private emit(event: GameEvent): void {
    this.ctx.bus.emitEvent(event);
  }
}
