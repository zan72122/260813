// 各画面(screens/*)へ渡す共有コンテキスト。main.ts/app.tsが1つ生成し、全画面が同じ実体を参照する。
import type { CameraRig } from "../scene/cameras";
import type { World } from "../scene/world";
import type { EventBus, FoodKind, GamePhase, GameStateMachine, SaveData, SessionState, SpotKind } from "../core/types";
import type { AlbumState } from "../game/album";
import type { Orientation } from "./dom";

export interface AppContext {
  /** 画面はこの直下へ自分のルート要素を1つappendする(mount)。unmountで必ず取り除く。 */
  readonly uiRoot: HTMLElement;
  readonly world: World;
  readonly cameraRig: CameraRig;
  readonly fsm: GameStateMachine & { setFreePlay(on: boolean): void };
  readonly events: EventBus;
  /** 現在のプレイの設定/進行状況。hide以前(title/intro)はnull。 */
  getSession(): SessionState | null;
  setSession(s: SessionState | null): void;
  readonly album: AlbumState;
  readonly save: SaveData;
  persistSaveNow(): void;
  getOrientation(): Orientation;
  onOrientation(cb: (o: Orientation) => void): () => void;
  /** title/album等から次のセッションを作る時に使う共通ヘルパー。 */
  regenerateSession(opts: { guided: boolean; freePlay: boolean }): SessionState;
  transition(to: GamePhase): boolean;
  /** QA/E2E向け: 通常のドラッグ操作を経由せず1食材を直接隠す(仕上げ演出も含む)。app.tsが実装を注入。 */
  hideFoodDirect: (spotId: SpotKind, food: FoodKind) => Promise<void>;
}
