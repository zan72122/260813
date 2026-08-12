import './style.css';
import { AudioEngine } from './audio/AudioEngine.ts';
import { GameFsm } from './game/fsm.ts';
import { loadLastSeed, loadReducedMotion, saveLastSeed, saveReducedMotion } from './game/persistence.ts';
import { CURATED_SEEDS } from './game/seeds.ts';
import { installTestHarness } from './harness/testHarness.ts';
import { SceneRoot } from './scene/SceneRoot.ts';
import { Overlay } from './ui/Overlay.ts';

function parseUrlParams(): { seed: number; testMode: boolean } {
  const params = new URLSearchParams(window.location.search);
  const testMode = params.get('test') === '1';
  const seedParam = params.get('seed');
  let seed = loadLastSeed() ?? CURATED_SEEDS[0];
  if (seedParam !== null) {
    const parsed = Number.parseInt(seedParam, 10);
    if (Number.isFinite(parsed) && parsed > 0) seed = parsed;
  }
  return { seed, testMode };
}

function main(): void {
  const { seed, testMode } = parseUrlParams();

  const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
  const uiRoot = document.getElementById('ui-root');
  if (!canvas || !uiRoot) throw new Error('missing #scene canvas or #ui-root element');

  const fsm = new GameFsm(seed);
  const audio = new AudioEngine();

  const osReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  let reducedMotion = loadReducedMotion() || osReducedMotion;

  const sceneRoot = new SceneRoot(canvas, fsm, audio, { reducedMotion, testMode });
  sceneRoot.setReducedMotion(reducedMotion);

  const overlay = new Overlay(uiRoot, {
    onPlay: () => {
      audio.resume();
      if (fsm.phase === 'TITLE') fsm.start();
      sceneRoot.start();
    },
    onToggleMute: () => {
      const muted = audio.toggleMuted();
      overlay.setMuted(muted);
    },
    onToggleReducedMotion: () => {
      reducedMotion = !reducedMotion;
      saveReducedMotion(reducedMotion);
      sceneRoot.setReducedMotion(reducedMotion);
      overlay.setReducedMotion(reducedMotion);
    },
    onReplaySame: () => fsm.replaySameDay(),
    onReplayShuffle: () => {
      const newSeed = fsm.replayShuffle();
      saveLastSeed(newSeed);
    },
    onReplayFreePlay: () => fsm.enterFreePlay(),
    onFreePlayMode: (mode) => sceneRoot.applyFreePlayMode(mode),
    onFreePlayExit: () => fsm.exitFreePlay(),
  });

  overlay.setMuted(audio.isMuted);
  overlay.setReducedMotion(reducedMotion);
  overlay.setPhase(fsm.phase);

  fsm.events.on('phaseChange', ({ to }) => overlay.setPhase(to));
  fsm.events.on('seedChanged', ({ seed: newSeed }) => saveLastSeed(newSeed));
  saveLastSeed(seed);

  if (testMode) {
    installTestHarness(fsm, sceneRoot, audio);
  }

  let rafId = 0;
  function frame(): void {
    sceneRoot.render();
    rafId = requestAnimationFrame(frame);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      sceneRoot.setPaused(true);
      cancelAnimationFrame(rafId);
    } else {
      sceneRoot.setPaused(false);
      rafId = requestAnimationFrame(frame);
    }
  });

  window.addEventListener('resize', () => sceneRoot.resize());
  window.addEventListener('orientationchange', () => sceneRoot.resize());

  sceneRoot.resize();
  rafId = requestAnimationFrame(frame);
}

main();
