// AudioContext管理。外部音源ファイルは一切使わず、sfx.ts/ambience.tsがこのエンジンのmasterGainへ
// 接続してWebAudio合成音を鳴らす。unlock()はiOS/Safari対応(ユーザー操作内でresume+無音バッファ再生)。
// suspend/resumeはvisibilitychangeへ自動連動する(タブが隠れている間はCPU/バッテリを使わない)。

const MASTER_VOLUME = 0.6; // 音量は控えめに揃える(圧縮/リミッタ的な役割の固定マスタ音量)

export interface AudioEngine {
  /** 生成済みならAudioContext、unlock()未実行ならnull(play()側はnullガードして無音で諦める)。 */
  getContext(): AudioContext | null;
  /** sfx/ambienceが繋ぐ先。muted切り替えはこのgainのみで行う(実質のmasterGain)。 */
  getMasterGain(): GainNode | null;
  /** 初回pointerdown/touchstartで呼ぶ想定。AudioContext生成(初回のみ)+resume+無音バッファ再生。 */
  unlock(): void;
  readonly unlocked: boolean;
  setMuted(m: boolean): void;
  readonly muted: boolean;
  suspend(): void;
  resume(): void;
}

export function createAudioEngine(): AudioEngine {
  let ctx: AudioContext | null = null;
  let masterGain: GainNode | null = null;
  let muted = false;
  let unlocked = false;
  let wasRunningBeforeSuspend = false;

  function ensureContext(): AudioContext | null {
    if (ctx) return ctx;
    if (typeof window === "undefined") return null;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    try {
      const created = new Ctor();
      const gain = created.createGain();
      gain.gain.value = muted ? 0 : MASTER_VOLUME;
      gain.connect(created.destination);
      ctx = created;
      masterGain = gain;
      return ctx;
    } catch {
      // 環境によってはAudioContext生成が失敗しうる(headless等)。以後は無音で諦める(throw禁止)。
      return null;
    }
  }

  function unlock(): void {
    const c = ensureContext();
    if (!c) return;
    if (c.state === "suspended") {
      void c.resume().catch(() => {
        // resume失敗は致命的でない(次のユーザー操作で再試行される)。
      });
    }
    try {
      // 無音バッファを1つ即再生し、iOS Safariの出力ルートを確実に開く定番手法。
      const buffer = c.createBuffer(1, 1, 22050);
      const src = c.createBufferSource();
      src.buffer = buffer;
      src.connect(c.destination);
      src.start(0);
    } catch {
      // 失敗しても致命的ではない(通常のsfx再生が後段でresumeを試みる)。
    }
    unlocked = true;
  }

  function setMuted(m: boolean): void {
    muted = m;
    if (masterGain) masterGain.gain.value = m ? 0 : MASTER_VOLUME;
  }

  function suspend(): void {
    if (ctx && ctx.state === "running") {
      wasRunningBeforeSuspend = true;
      void ctx.suspend().catch(() => {});
    } else {
      wasRunningBeforeSuspend = false;
    }
  }

  function resume(): void {
    if (ctx && wasRunningBeforeSuspend && ctx.state === "suspended") {
      void ctx.resume().catch(() => {});
    }
  }

  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) suspend();
      else resume();
    });
  }

  return {
    getContext: () => ctx,
    getMasterGain: () => masterGain,
    unlock,
    get unlocked() {
      return unlocked;
    },
    setMuted,
    get muted() {
      return muted;
    },
    suspend,
    resume
  };
}
