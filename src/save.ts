export interface SaveData {
  apron: number;
  bowlRim: number;
  plateStyle: number;
  muted: boolean;
  /** 0=大 1=小 2=ミュート */
  volumeStep: number;
  reduceMotion: boolean;
  finishedOnce: boolean;
}

const KEY = 'biyoon-cheese-v1';

export function loadSave(): SaveData {
  const def: SaveData = {
    apron: 0, bowlRim: 0, plateStyle: 0,
    muted: false, volumeStep: 0, reduceMotion: false, finishedOnce: false,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return def;
    return { ...def, ...JSON.parse(raw) };
  } catch {
    return def;
  }
}

export function saveSave(s: SaveData) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* プライベートブラウズ等では無視 */ }
}
