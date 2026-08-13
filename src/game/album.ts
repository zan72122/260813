// 観察済み行動(BehaviorId)の集計。セッション内(sessionBehaviors、出現順・重複あり=絵カードの並び用)と
// 累積(observedBehaviors、重複なし=アルバム蓄積)。save本体の読み書きはsrc/save/save.ts(S5本実装)を
// そのまま使う(以前ここに置いていたlocalStorage直書きの仮実装はS5でsave/save.tsへ置換した)。
import type { BehaviorId } from "../core/types";
import { defaultSaveData, loadSave, persistSave, SAVE_KEY, updateSave } from "../save/save";

export { defaultSaveData, loadSave, persistSave, SAVE_KEY, updateSave };

export interface AlbumState {
  /** その回に観察した順(重複含む、絵カードを並べる演出用)。 */
  sessionBehaviors: BehaviorId[];
  /** 端末に蓄積された累積観察済み行動(重複なし)。 */
  observedBehaviors: BehaviorId[];
}

export function createAlbum(): AlbumState {
  return { sessionBehaviors: [], observedBehaviors: loadSave().observedBehaviors.slice() };
}

/** behavior:complete受信時に呼ぶ。セッション内リストへ追加(重複可)+累積へ重複なし追加。 */
export function recordBehavior(album: AlbumState, id: BehaviorId): void {
  album.sessionBehaviors.push(id);
  if (!album.observedBehaviors.includes(id)) album.observedBehaviors.push(id);
}

export function resetSessionAlbum(album: AlbumState): void {
  album.sessionBehaviors = [];
}

/** アルバム到達時(初回クリア=firstPlayDone, freePlay解放)にsaveへ確定反映する。 */
export function commitAlbumToSave(album: AlbumState) {
  const current = loadSave();
  const merged = current.observedBehaviors.slice();
  for (const id of album.observedBehaviors) {
    if (!merged.includes(id)) merged.push(id);
  }
  return updateSave({ firstPlayDone: true, freePlayUnlocked: true, observedBehaviors: merged });
}
