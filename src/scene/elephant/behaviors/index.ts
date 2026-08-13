// 5固有行動のバレル export + dispatchテーブル。world.tsのelephantSeek/playBehaviorDirectが使う。
import type { BehaviorId } from "../../../core/types";
import { breakBranch } from "./breakBranch";
import { digSand } from "./digSand";
import { peelBanana } from "./peelBanana";
import { probeGap } from "./probeGap";
import { reachPipe } from "./reachPipe";
import type { BehaviorFn } from "./types";

export const BEHAVIORS: Record<BehaviorId, BehaviorFn> = {
  "probe-gap": probeGap,
  "dig-sand": digSand,
  "reach-pipe": reachPipe,
  "peel-banana": peelBanana,
  "break-branch": breakBranch
};

export { breakBranch, digSand, peelBanana, probeGap, reachPipe };
export type { BehaviorCamera, BehaviorContext, BehaviorEnv, BehaviorFn } from "./types";
export { runBehaviorLifecycle, scaledDuration, REDUCED_MOTION_SCALE } from "./support";
