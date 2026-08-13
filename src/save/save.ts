// SaveData契約(docs/INTERFACES.md)の実装。localStorage key: "elephant-hidden-feast:v1"。
// load(): parse失敗・型不一致・欠損キーいずれでも既定値へ復旧しthrowしない。
// save(): 部分更新API(updateSave)を主入口とし、settingsはショートハンドでネストマージする。
import type { BehaviorId, Quality, SaveData } from "../core/types";

export const SAVE_KEY = "elephant-hidden-feast:v1";

const BEHAVIOR_IDS: readonly BehaviorId[] = ["probe-gap", "dig-sand", "reach-pipe", "peel-banana", "break-branch"];
const QUALITY_SETTING_VALUES: readonly (Quality | "auto")[] = ["low", "medium", "high", "auto"];

function isBehaviorId(v: unknown): v is BehaviorId {
  return typeof v === "string" && (BEHAVIOR_IDS as readonly string[]).includes(v);
}

function isQualitySetting(v: unknown): v is Quality | "auto" {
  return typeof v === "string" && (QUALITY_SETTING_VALUES as readonly string[]).includes(v);
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0.6;
  return Math.max(0, Math.min(1, v));
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

/** parse失敗/型不一致/欠損キーいずれでも既定値(の該当フィールド)へ復旧する。throwしない。 */
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
        ambienceVolume: typeof settingsSrc.ambienceVolume === "number" ? clamp01(settingsSrc.ambienceVolume) : fallback.settings.ambienceVolume,
        reducedMotion: typeof settingsSrc.reducedMotion === "boolean" ? settingsSrc.reducedMotion : fallback.settings.reducedMotion,
        dimLight: typeof settingsSrc.dimLight === "boolean" ? settingsSrc.dimLight : fallback.settings.dimLight,
        quality: isQualitySetting(settingsSrc.quality) ? settingsSrc.quality : fallback.settings.quality
      }
    };
  } catch {
    return fallback;
  }
}

/** 全体を上書き保存する低レベルAPI。quota超過等は無視する(throwしない契約)。 */
export function persistSave(data: SaveData): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // quota超過等は無視(throwしない契約)
  }
}

export interface SaveDataPatch {
  firstPlayDone?: boolean;
  freePlayUnlocked?: boolean;
  observedBehaviors?: BehaviorId[];
  settings?: Partial<SaveData["settings"]>;
}

/** 部分更新API: 現在のsaveをloadSave()し、patchをマージして保存し、マージ後の値を返す。
 * settingsはネストされたキー単位でマージする(呼び出し側が丸ごと渡す必要はない)。 */
export function updateSave(patch: SaveDataPatch): SaveData {
  const current = loadSave();
  const next: SaveData = {
    version: 1,
    firstPlayDone: patch.firstPlayDone ?? current.firstPlayDone,
    freePlayUnlocked: patch.freePlayUnlocked ?? current.freePlayUnlocked,
    observedBehaviors: patch.observedBehaviors ?? current.observedBehaviors,
    settings: { ...current.settings, ...(patch.settings ?? {}) }
  };
  persistSave(next);
  return next;
}

/** データをリセット: 既定値で上書き保存し、既定値を返す。 */
export function resetSave(): SaveData {
  const fresh = defaultSaveData();
  persistSave(fresh);
  return fresh;
}
