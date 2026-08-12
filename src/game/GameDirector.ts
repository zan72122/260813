/**
 * GamePhase state machine per docs/MASTER_SPEC.md's phase table. Consumes
 * every ActionIntent (input + ui route here), advances StageTransformProgress
 * from ropeDrag deltas (GameState applies clamp/snap), runs the 3-5s idle
 * hint timer, and fires AudioCue one-shots/continuous velocities. GameDirector
 * only receives (GameState, EventBus) from App's frozen wiring, not
 * ctx.services -- so AudioCue playback goes out as `audioCue` bus events,
 * which App already forwards to the audio engine 1:1 with a direct service
 * call (docs/CONTRACTS_ADDENDUM.md: "どちらの経路も可").
 */
import type { ActionIntent, AudioCue, EventBus, GamePhase, GameState, GameStateSnapshot, TransformPair } from '../core';

/** Phases that auto-advance after a fixed watch beat, per MASTER_SPEC's "見る" rows. No user input needed. */
const AUTO_ADVANCE_MS: Partial<Record<GamePhase, number>> = {
  establish: 6000,
  descend: 6000,
  reveal1: 8000,
  reveal2: 8000,
  finale: 4000
};

const AUTO_NEXT: Partial<Record<GamePhase, GamePhase>> = {
  establish: 'cue',
  descend: 'unlock',
  reveal1: 'cue2',
  reveal2: 'finale',
  finale: 'choice'
};

/** Which non-verbal hint (docs/CONTRACTS.md hintShown union) applies to each actionable phase. */
const ACTIONABLE_HINT: Partial<Record<GamePhase, 'tapFloor' | 'releaseLock' | 'pullRope' | 'choose'>> = {
  cue: 'tapFloor',
  unlock: 'releaseLock',
  pull1: 'pullRope',
  cue2: 'pullRope',
  pull2: 'pullRope',
  freePlay: 'pullRope',
  choice: 'choose'
};

const HINT_MIN_S = 3;
const HINT_MAX_S = 5;

const SALON_FOREST: TransformPair = { from: 'salon', to: 'forest' };
const FOREST_RUSTIC: TransformPair = { from: 'forest', to: 'rustic' };

function randomHintDelay(): number {
  return HINT_MIN_S + Math.random() * (HINT_MAX_S - HINT_MIN_S);
}

export class GameDirector {
  private phaseElapsedS = 0;
  private idleS = 0;
  private nextHintS = randomHintDelay();
  private prevProgress = 0;
  private applauseFired = false;
  private bootHandled = false;

  constructor(
    private readonly state: GameState,
    private readonly bus: EventBus
  ) {
    this.bus.on('transformComplete', (event) => this.handleTransformComplete(event.pair));
    this.bus.on('transformReset', () => this.playCue('releaseSoft'));
  }

  handleIntent(intent: ActionIntent): void {
    this.idleS = 0;
    this.nextHintS = randomHintDelay();

    const phase = this.state.getSnapshot().phase;
    switch (intent.kind) {
      case 'tap':
        this.handleTap(phase, intent.x);
        break;
      case 'ropeGrab':
        // Grip feedback only; progress itself is driven by ropeDrag deltas.
        break;
      case 'ropeDrag':
        this.handleRopeDrag(phase, intent.deltaProgress);
        break;
      case 'ropeRelease':
        break;
      case 'lockRelease':
        if (phase === 'unlock') this.releaseLock();
        break;
      case 'uiToggle':
        this.handleUiToggle(intent.control, phase);
        break;
    }
  }

  update(dt: number): void {
    if (!this.bootHandled) {
      this.bootHandled = true;
      this.state.setPhase('title');
    }

    const snapshot = this.state.getSnapshot();
    this.runIdleHint(dt, snapshot.phase);
    this.runAutoAdvance(dt, snapshot.phase);
    this.runContinuousAudio(dt, snapshot);
    this.runFinaleSequence(dt, snapshot.phase);
  }

  private handleTap(phase: GamePhase, x: number): void {
    if (phase === 'title') {
      this.state.setPhase('establish');
      return;
    }
    if (phase === 'cue') {
      this.state.setPhase('descend');
      return;
    }
    if (phase === 'unlock') {
      this.releaseLock();
      return;
    }
    if (phase === 'cue2') {
      this.beginPull(this.state.getSnapshot().pair);
      return;
    }
    if (phase === 'choice') {
      // Picture-based three-way choice (docs/MASTER_SPEC.md "絵による三択"): normalized x
      // thirds of the tap select replay-same / different-scenery / freePlay.
      if (x < 1 / 3) this.chooseReplaySame();
      else if (x < 2 / 3) this.chooseDifferentScenery();
      else this.chooseFreePlay();
    }
  }

  private chooseReplaySame(): void {
    const pair = this.state.getSnapshot().pair;
    this.state.setProgress(0);
    this.state.setPair(pair);
    this.state.setPhase('cue2');
  }

  private chooseDifferentScenery(): void {
    this.state.setProgress(0);
    this.state.setPair(SALON_FOREST);
    this.state.setCurrentScene('salon');
    this.state.setPhase('establish');
  }

  private chooseFreePlay(): void {
    this.state.setPhase('freePlay');
  }

  private releaseLock(): void {
    this.playCue('lockClick');
    this.bus.emit({ type: 'lockReleased' });
    this.beginPull(SALON_FOREST);
  }

  private beginPull(pair: TransformPair): void {
    this.state.setPair(pair);
    this.state.setProgress(0);
    this.state.setPhase(pair.to === 'forest' ? 'pull1' : 'pull2');
  }

  private handleRopeDrag(phase: GamePhase, deltaProgress: number): void {
    let activePhase = phase;
    if (phase === 'cue2') {
      this.beginPull(this.state.getSnapshot().pair);
      activePhase = this.state.getSnapshot().phase;
    }
    if (activePhase !== 'pull1' && activePhase !== 'pull2' && activePhase !== 'freePlay') return;
    const current = this.state.getSnapshot().progress;
    this.state.setProgress(current + deltaProgress);
  }

  private handleUiToggle(control: 'mute' | 'quality' | 'exitFree', phase: GamePhase): void {
    if (control === 'mute') {
      this.state.setMuted(!this.state.getSnapshot().muted);
      return;
    }
    if (control === 'quality') {
      const order: readonly GameStateSnapshot['quality'][] = ['low', 'medium', 'high'];
      const idx = order.indexOf(this.state.getSnapshot().quality);
      this.state.setQuality(order[(idx + 1) % order.length]!);
      return;
    }
    if (control === 'exitFree' && phase === 'freePlay') {
      this.state.setPhase('choice');
    }
  }

  private handleTransformComplete(pair: TransformPair): void {
    this.playCue('settleThud');
    const phase = this.state.getSnapshot().phase;
    if (phase === 'pull1') {
      this.state.setCurrentScene(pair.to);
      this.state.setPhase('reveal1');
    } else if (phase === 'pull2') {
      this.state.setCurrentScene(pair.to);
      this.state.setPhase('reveal2');
    }
  }

  private runIdleHint(dt: number, phase: GamePhase): void {
    const hint = ACTIONABLE_HINT[phase];
    if (!hint) return;
    this.idleS += dt;
    if (this.idleS >= this.nextHintS) {
      this.bus.emit({ type: 'hintShown', hint });
      this.idleS = 0;
      this.nextHintS = randomHintDelay();
    }
  }

  private runAutoAdvance(dt: number, phase: GamePhase): void {
    const durationMs = AUTO_ADVANCE_MS[phase];
    const next = AUTO_NEXT[phase];
    if (durationMs === undefined || next === undefined) {
      this.phaseElapsedS = 0;
      return;
    }
    this.phaseElapsedS += dt;
    const reduced = this.state.getSnapshot().reducedMotion;
    const thresholdS = (durationMs * (reduced ? 0.5 : 1)) / 1000;
    if (this.phaseElapsedS >= thresholdS) {
      this.phaseElapsedS = 0;
      if (phase === 'establish') {
        this.playCue('knock3');
      }
      if (phase === 'reveal1') {
        this.state.setPair(FOREST_RUSTIC);
        this.state.setProgress(0);
      }
      this.state.setPhase(next);
    }
  }

  private runFinaleSequence(dt: number, phase: GamePhase): void {
    if (phase !== 'finale') {
      this.applauseFired = false;
      return;
    }
    if (this.phaseElapsedS <= dt) {
      this.playCue('footlightsOn');
    }
    if (!this.applauseFired && this.phaseElapsedS >= 0.8) {
      this.applauseFired = true;
      this.playCue('applause');
    }
  }

  private runContinuousAudio(dt: number, snapshot: Readonly<GameStateSnapshot>): void {
    const active = snapshot.phase === 'pull1' || snapshot.phase === 'pull2' || snapshot.phase === 'freePlay';
    const velocity = dt > 0 && active ? (snapshot.progress - this.prevProgress) / dt : 0;
    this.prevProgress = snapshot.progress;
    this.setContinuous('ropeCreak', velocity);
    this.setContinuous('pulleySpin', velocity);
    this.setContinuous('woodClatter', velocity);
    this.setContinuous('flatSlide', velocity);
  }

  private playCue(cue: AudioCue): void {
    this.bus.emit({ type: 'audioCue', cue });
  }

  private setContinuous(cue: AudioCue, velocity: number): void {
    this.bus.emit({ type: 'audioCue', cue, velocity });
  }
}
