/**
 * Assembles the full `window.__eiffel` TestApi (contracts/testing.ts) from
 * the already-constructed owner systems. This is also where the ONE
 * `?fixedStep=1` stepping composition lives: `step(frames)` drives exactly
 * `frames` fixed logical+render steps by calling `game.tick(FIXED_DT)`
 * then `render.stepFrames(1)` — the same pairing bootstrap.ts's normal-mode
 * path achieves continuously via two independent self-driving loops (see
 * that module's doc comment for the full frame-loop ownership rationale).
 * Outside `?fixedStep=1`, `step()` is a defensive no-op, mirroring
 * `RenderSystem.stepFrames`'s own "only meaningful under fixedStep" contract
 * so it can never double-drive anything alongside the self-running loops.
 */
import type { TestApi } from '../contracts/testing';
import { createGameState } from '../contracts/stateMachine';
import type { GameState } from '../contracts/types';
import { FIXED_DT } from '../contracts/constants';
import type { GameController } from '../game';
import { createTestDrive } from '../game';
import type { RenderSystem } from '../render';

export interface TestApiDeps {
  game: GameController;
  render: RenderSystem;
  /** Whether `?fixedStep=1` was present — gates `step()`, matching RenderSystem.stepFrames's own semantics. */
  fixedStepMode: boolean;
}

export interface AppTestApi {
  api: TestApi;
  /** Flips `api.ready` to true. Called once by bootstrap.ts the moment the first real frame has rendered. */
  markReady: () => void;
}

/** Builds the live TestApi wired to a fully constructed app (WebGL2 present). */
export function buildTestApi(deps: TestApiDeps): AppTestApi {
  const { game, render, fixedStepMode } = deps;
  const drive = createTestDrive(game);

  const api: TestApi = {
    ready: false,
    settled: () => render.settled(),
    state: () => game.getState(),
    alignmentError: (leg) => drive.alignmentError(leg),
    locked: (leg) => drive.locked(leg),
    step(frames: number): void {
      if (!fixedStepMode) return;
      for (let i = 0; i < frames; i++) {
        game.tick(FIXED_DT);
        render.stepFrames(1);
      }
    },
    drive: drive.drive,
    renderInfo: () => render.renderInfo(),
  };

  return {
    api,
    markReady(): void {
      api.ready = true;
    },
  };
}

/**
 * Fallback TestApi for the (WebGL2-unavailable) error-fallback path.
 * `window.__eiffel` is declared non-optional by contracts/testing.ts, so
 * something well-typed must exist even when gameplay itself never starts —
 * every member here is a safe, inert no-op/constant.
 */
export function buildUnavailableTestApi(): TestApi {
  const inertState: GameState = createGameState(0);
  return {
    ready: false,
    settled: () => true,
    state: () => structuredClone(inertState),
    alignmentError: () => 0,
    locked: () => false,
    step: () => undefined,
    drive: {
      setGate: () => undefined,
      pump: () => undefined,
      dragWedge: () => undefined,
      releaseWedge: () => undefined,
      hammer: () => undefined,
      advance: () => undefined,
      replay: () => undefined,
    },
    renderInfo: () => ({ geometries: 0, textures: 0, drawCalls: 0 }),
  };
}
