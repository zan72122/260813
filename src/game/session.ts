// セッション状態の生成・進行管理。docs/INTERFACES.md の SessionConfig/SessionState契約に準拠。
// createSession(seed, {guided, freePlay}):
//   - guided: GUIDED_SPOT_IDS(3固定、stone-gap/sand/high-branch)
//   - 通常(!guided && !freePlay): rngで全5スポットから3つ提案
//   - freePlay: 5スポットまで(shuffleされた全5件、実際に隠すかはプレイヤー次第)
//   - seekOrder: 選ばれたspotsをrng.shuffle
//   - timeOfDay: guided(初回)はmorning固定、それ以外はrngで選択
import { createRng } from "../core/rng";
import type { FoodKind, HiddenFood, Rng, SessionConfig, SessionState, SpotKind, TimeOfDay } from "../core/types";
import { SPOTS, GUIDED_SPOT_IDS } from "./spots";

const TIME_OF_DAY_VALUES: readonly TimeOfDay[] = ["morning", "noon", "evening"];
const ALL_SPOT_IDS: readonly SpotKind[] = SPOTS.map((s) => s.id);
const NORMAL_SPOT_COUNT = 3;

export interface CreateSessionOptions {
  guided: boolean;
  freePlay: boolean;
}

function pickSpots(rng: Rng, opts: CreateSessionOptions): SpotKind[] {
  if (opts.guided) return [...GUIDED_SPOT_IDS];
  if (opts.freePlay) return rng.shuffle(ALL_SPOT_IDS);
  return rng.shuffle(ALL_SPOT_IDS).slice(0, NORMAL_SPOT_COUNT);
}

export function createSession(seed: number, opts: CreateSessionOptions): SessionState {
  const rng = createRng(seed);
  const spots = pickSpots(rng, opts);
  const seekOrder = rng.shuffle(spots);
  const timeOfDay: TimeOfDay = opts.guided ? "morning" : rng.pick(TIME_OF_DAY_VALUES);
  const config: SessionConfig = { seed, guided: opts.guided, freePlay: opts.freePlay, spots, timeOfDay };
  return { config, hidden: [], found: [], seekOrder };
}

/** その回に提示される餌トレイの数(=隠せるスポット数)。 */
export function traySize(state: SessionState): number {
  return state.config.spots.length;
}

/** 仕上げ操作完了時にhide screenが呼ぶ。重複spotIdは無視(冪等)。 */
export function recordHidden(state: SessionState, spotId: SpotKind, food: FoodKind): HiddenFood {
  const existing = state.hidden.find((h) => h.spotId === spotId);
  if (existing) return existing;
  const entry: HiddenFood = { spotId, food };
  state.hidden.push(entry);
  return entry;
}

/** behavior:complete受信時にseek screenが呼ぶ。重複spotIdは無視(冪等)。 */
export function recordFound(state: SessionState, spotId: SpotKind): void {
  if (state.found.includes(spotId)) return;
  state.found.push(spotId);
}

/** guided/通常: 全spotsに隠し終えたか。freePlay: 1つ以上隠せば進行可能とみなす呼び出し側の判断に使う。 */
export function isHideComplete(state: SessionState): boolean {
  return state.hidden.length >= state.config.spots.length && state.hidden.length > 0;
}

export function isSeekComplete(state: SessionState): boolean {
  return state.hidden.length > 0 && state.found.length >= state.hidden.length;
}

/** まだ食べ物を隠していないスポット一覧(hide screenのトレイ残数表示・ヒント対象選定に使う)。 */
export function remainingSpots(state: SessionState): SpotKind[] {
  const hiddenSet = new Set(state.hidden.map((h) => h.spotId));
  return state.config.spots.filter((s) => !hiddenSet.has(s));
}

/** seekOrder上で次にゾウが向かうべき(隠され済みでまだ見つけていない)スポット。無ければnull。 */
export function nextSeekTarget(state: SessionState): HiddenFood | null {
  for (const spotId of state.seekOrder) {
    if (state.found.includes(spotId)) continue;
    const hidden = state.hidden.find((h) => h.spotId === spotId);
    if (hidden) return hidden;
  }
  return null;
}
