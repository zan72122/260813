// audio/の公開入口。AudioApi(docs/INTERFACES.md契約)の実装+ゲームイベント→SfxIdの配線。
// 全て外部音源ファイル無し、WebAudio合成のみ(engine.ts/sfx.ts/ambience.ts)。
import type { AudioApi, EventBus, SfxId, SpotKind } from "../core/types";
import { createAudioEngine, type AudioEngine } from "./engine";
import { createSfx, type Sfx } from "./sfx";
import { createAmbience, type Ambience } from "./ambience";

/** テスト向けの差し替え口(既定は本物のWebAudio実装)。tests/unit/audio-mapping.test.tsが
 * 「イベント→SfxId」の対応表をAudioContextモック無しで検証するために使う。 */
export interface AudioSystemDeps {
  engine?: AudioEngine;
  sfx?: Sfx;
  ambience?: Ambience;
}

export interface AudioSystem {
  readonly api: AudioApi;
  /** ゲームイベント(food:hidden/gate:opened/behavior:start/behavior:complete)を購読して音を鳴らす。
   * 戻り値で購読解除。イベント→SfxIdの対応表はops/reports/S5.mdに一覧化する。 */
  bindEvents(events: EventBus): () => void;
}

// food:hidden: スポットごとに質感を変える(タスク仕様どおり)。
const HIDE_SFX: Record<SpotKind, SfxId> = {
  "stone-gap": "food-tuck",
  sand: "sand-cover",
  pipe: "trunk-pipe", // 「転用の転がり音でもよい」の指示どおりtrunk-pipeを流用
  "banyan-root": "leaf-rustle",
  "high-branch": "leaf-rustle" // +滑車のキュッ(pulleySqueakで別途重ねる、下記参照)
};

export function createAudioSystem(deps: AudioSystemDeps = {}): AudioSystem {
  const engine = deps.engine ?? createAudioEngine();
  const sfx = deps.sfx ?? createSfx(engine);
  const ambience = deps.ambience ?? createAmbience(engine);
  let ambienceVolume = 0.6;
  let ambienceStarted = false;

  const api: AudioApi = {
    unlock(): void {
      engine.unlock();
    },
    play(id: SfxId): void {
      sfx.play(id);
    },
    setMuted(m: boolean): void {
      engine.setMuted(m);
    },
    setAmbienceVolume(v: number): void {
      ambienceVolume = Math.max(0, Math.min(1, v));
      ambience.setVolume(ambienceVolume);
    },
    startAmbience(): void {
      if (ambienceStarted) return;
      ambienceStarted = true;
      ambience.setVolume(ambienceVolume);
      ambience.start();
    },
    suspend(): void {
      engine.suspend();
    },
    resume(): void {
      engine.resume();
    }
  };

  function bindEvents(events: EventBus): () => void {
    // break-branch: creak(開始時)→snap(完了直前で近似)。behaviors側(elephant/behaviors/*)は変更しない
    // 契約のため、behavior:start/completeのタイミングだけから「折れる瞬間」を近似する。
    // 通常速度でのbreak-branch(鼻を伸ばす1.6s+2-3回引く×1.1s)は概ね3.8〜4.9s付近で折れるため、
    // 2.8sを狙って先出しし、それより早くbehavior:completeが届いた場合はその時点でsnapを鳴らす。
    const pendingSnap = new Map<SpotKind, ReturnType<typeof setTimeout>>();

    const unsubs: Array<() => void> = [];

    unsubs.push(
      events.on("food:hidden", ({ spotId }) => {
        sfx.play(HIDE_SFX[spotId]);
        if (spotId === "high-branch") {
          setTimeout(() => sfx.playPulleySqueak(), 130);
        }
      })
    );

    unsubs.push(
      events.on("gate:opened", () => {
        sfx.play("gate-open");
      })
    );

    unsubs.push(
      events.on("behavior:start", ({ behaviorId, spotId }) => {
        switch (behaviorId) {
          case "probe-gap":
            sfx.play("leaf-rustle", 0.5);
            sfx.play("trunk-pipe", 0.4);
            break;
          case "dig-sand":
            sfx.play("sand-cover");
            setTimeout(() => sfx.play("sand-cover", 0.85), 260);
            setTimeout(() => sfx.play("sand-cover", 0.7), 520);
            break;
          case "reach-pipe":
            sfx.play("trunk-pipe");
            break;
          case "peel-banana":
            sfx.play("banana-peel");
            setTimeout(() => sfx.play("banana-peel", 0.85), 240);
            break;
          case "break-branch": {
            sfx.play("branch-creak");
            const timer = setTimeout(() => {
              pendingSnap.delete(spotId);
              sfx.play("branch-snap");
            }, 2800);
            pendingSnap.set(spotId, timer);
            break;
          }
        }
      })
    );

    unsubs.push(
      events.on("behavior:complete", ({ behaviorId, spotId }) => {
        if (behaviorId === "break-branch") {
          const timer = pendingSnap.get(spotId);
          if (timer) {
            clearTimeout(timer);
            pendingSnap.delete(spotId);
            sfx.play("branch-snap");
          }
        }
        sfx.play("found-chime");
        if (Math.random() < 0.35) {
          setTimeout(() => sfx.play("elephant-rumble", 0.7), 220);
        }
      })
    );

    return () => {
      for (const unsub of unsubs) unsub();
      for (const timer of pendingSnap.values()) clearTimeout(timer);
      pendingSnap.clear();
    };
  }

  return { api, bindEvents };
}

/** ui-tap: ボタン/操作対象への最初のタップで鳴らす(1リスナーで全画面のボタンをカバーする委譲方式)。
 * button要素とrole="button"要素のみを対象にし、ドラッグ操作(食材トレイ等)では鳴らさない。 */
export function bindUiTapSounds(audio: AudioApi): () => void {
  function handlePointerDown(ev: PointerEvent): void {
    const target = ev.target;
    if (!(target instanceof Element)) return;
    if (target.closest('button, [role="button"]')) {
      audio.play("ui-tap");
    }
  }
  document.addEventListener("pointerdown", handlePointerDown);
  return () => document.removeEventListener("pointerdown", handlePointerDown);
}
