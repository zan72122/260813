// 観察済み行動(BehaviorId)の集計。セッション内(sessionBehaviors、出現順・重複あり=絵カードの並び用)と
// 累積(observedBehaviors、重複なし=アルバム蓄積)。saveへの接続はSaveData契約(docs/INTERFACES.md)に
// 合わせたlocalStorage直書きの仮実装(実保存/設定UIはS5)。parse失敗時は既定値で復旧しthrowしない。
import type { BehaviorId, SaveData } from "../core/types";

export const SAVE_KEY = "elephant-hidden-feast:v1";

const BEHAVIOR_IDS: readonly BehaviorId[] = ["probe-gap", "dig-sand", "reach-pipe", "peel-banana", "break-branch"];

function isBehaviorId(v: unknown): v is BehaviorId {
  return typeof v === "string" && (BEHAVIOR_IDS as readonly string[]).includes(v);
}

export function defaultSaveData(): SaveData {
  return {
    version: 1,
    firstPlayDone: false,
    freePlayUnlocked: false,
    observedBehaviors: [],
    settings: {
      muted: false,
      ambienceVolume: 0.6,
      reducedMotion: false,
      dimLight: false,
      quality: "auto"
    }
  };
}

function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
}

export function loadSave(): SaveData {
  const fallback = defaultSaveData();
  if (!hasLocalStorage()) return fallback;
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<SaveData> | null;
    if (!parsed || typeof parsed !== "object") return fallback;
    const settingsSrc = (parsed.settings ?? {}) as Partial<SaveData["settings"]>;
    return {
      version: 1,
      firstPlayDone: typeof parsed.firstPlayDone === "boolean" ? parsed.firstPlayDone : fallback.firstPlayDone,
      freePlayUnlocked: typeof parsed.freePlayUnlocked === "boolean" ? parsed.freePlayUnlocked : fallback.freePlayUnlocked,
      observedBehaviors: Array.isArray(parsed.observedBehaviors) ? parsed.observedBehaviors.filter(isBehaviorId) : [],
      settings: {
        muted: typeof settingsSrc.muted === "boolean" ? settingsSrc.muted : fallback.settings.muted,
        ambienceVolume: typeof settingsSrc.ambienceVolume === "number" ? settingsSrc.ambienceVolume : fallback.settings.ambienceVolume,
        reducedMotion: typeof settingsSrc.reducedMotion === "boolean" ? settingsSrc.reducedMotion : fallback.settings.reducedMotion,
        dimLight: typeof settingsSrc.dimLight === "boolean" ? settingsSrc.dimLight : fallback.settings.dimLight,
        quality: settingsSrc.quality ?? fallback.settings.quality
      }
    };
  } catch {
    return fallback;
  }
}

export function persistSave(data: SaveData): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // quota超過等は無視(throwしない契約)
  }
}

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
export function commitAlbumToSave(album: AlbumState): SaveData {
  const save = loadSave();
  save.firstPlayDone = true;
  save.freePlayUnlocked = true;
  for (const id of album.observedBehaviors) {
    if (!save.observedBehaviors.includes(id)) save.observedBehaviors.push(id);
  }
  persistSave(save);
  return save;
}
