import * as THREE from 'three';
import type { Phase } from '../game/types.ts';
import { Easing, TweenManager } from './tween.ts';

interface LightPreset {
  keyColor: THREE.Color;
  keyIntensity: number;
  keyPosition: THREE.Vector3;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  background: THREE.Color;
  fillIntensity: number;
}

function preset(
  keyColor: number,
  keyIntensity: number,
  keyPos: [number, number, number],
  hemiSky: number,
  hemiGround: number,
  hemiIntensity: number,
  background: number,
  fillIntensity: number,
): LightPreset {
  return {
    keyColor: new THREE.Color(keyColor),
    keyIntensity,
    keyPosition: new THREE.Vector3(...keyPos),
    hemiSky: new THREE.Color(hemiSky),
    hemiGround: new THREE.Color(hemiGround),
    hemiIntensity,
    background: new THREE.Color(background),
    fillIntensity,
  };
}

const MORNING = preset(0xeaf3ff, 2.6, [2.2, 3, 1.6], 0xdfeeff, 0xe3c9a3, 1.1, 0xf6ede0, 0.6);
const LUNCH = preset(0xfff0d8, 2.5, [1.8, 2.8, 1.8], 0xfff1da, 0xe3c9a3, 1.05, 0xfaead9, 0.65);
const NAP = preset(0x8fa8d6, 0.55, [1.2, 2.4, 1.0], 0x40507c, 0x2c2418, 0.32, 0x1e2438, 0.18);
const AFTERNOON = preset(0xfff4e0, 2.7, [2.4, 3.1, 1.4], 0xffe9c8, 0xe3c9a3, 1.15, 0xf8ecd8, 0.62);

const PHASE_PRESET: Record<Phase, LightPreset> = {
  TITLE: MORNING,
  PLAY_CLEANUP: MORNING,
  LUNCH_SETUP: LUNCH,
  LUNCH_CLEANUP: LUNCH,
  NAP_SETUP: NAP,
  WAKE_RESTORE: AFTERNOON,
  REPLAY: AFTERNOON,
  FREE_PLAY: AFTERNOON,
};

export class LightingRig {
  readonly group = new THREE.Group();
  readonly key: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly fill: THREE.PointLight;
  readonly scene: THREE.Scene;
  private tweens: TweenManager;
  private current: LightPreset = MORNING;
  private morningAngle = 0;

  constructor(scene: THREE.Scene, tweens: TweenManager) {
    this.scene = scene;
    this.tweens = tweens;
    this.key = new THREE.DirectionalLight(MORNING.keyColor, MORNING.keyIntensity);
    this.key.position.copy(MORNING.keyPosition);
    this.key.castShadow = false;
    this.hemi = new THREE.HemisphereLight(MORNING.hemiSky, MORNING.hemiGround, MORNING.hemiIntensity);
    this.fill = new THREE.PointLight(0xfff4e0, MORNING.fillIntensity, 6, 2);
    this.fill.position.set(-1.2, 1.4, 1.4);
    this.group.add(this.key, this.hemi, this.fill);
    scene.add(this.group);
    scene.background = MORNING.background.clone();
    scene.fog = new THREE.Fog(MORNING.background.getHex(), 6, 14);
  }

  setMorningAngle(angle: number): void {
    this.morningAngle = angle;
  }

  applyPhase(phase: Phase, durationSeconds: number): void {
    const target = PHASE_PRESET[phase];
    const start: LightPreset = {
      keyColor: this.key.color.clone(),
      keyIntensity: this.key.intensity,
      keyPosition: this.key.position.clone(),
      hemiSky: this.hemi.color.clone(),
      hemiGround: this.hemi.groundColor.clone(),
      hemiIntensity: this.hemi.intensity,
      background: (this.scene.background as THREE.Color).clone(),
      fillIntensity: this.fill.intensity,
    };
    const targetKeyPos = target.keyPosition.clone();
    targetKeyPos.x += Math.sin(this.morningAngle) * 0.6;
    targetKeyPos.z += Math.cos(this.morningAngle) * 0.2;

    const tmpColor = new THREE.Color();
    this.tweens.add(
      durationSeconds,
      Easing.cubicInOut,
      (t) => {
        this.key.color.copy(start.keyColor).lerp(target.keyColor, t);
        this.key.intensity = THREE.MathUtils.lerp(start.keyIntensity, target.keyIntensity, t);
        this.key.position.lerpVectors(start.keyPosition, targetKeyPos, t);
        this.hemi.color.copy(start.hemiSky).lerp(target.hemiSky, t);
        this.hemi.groundColor.copy(start.hemiGround).lerp(target.hemiGround, t);
        this.hemi.intensity = THREE.MathUtils.lerp(start.hemiIntensity, target.hemiIntensity, t);
        this.fill.intensity = THREE.MathUtils.lerp(start.fillIntensity, target.fillIntensity, t);
        tmpColor.copy(start.background).lerp(target.background, t);
        (this.scene.background as THREE.Color).copy(tmpColor);
        if (this.scene.fog) (this.scene.fog as THREE.Fog).color.copy(tmpColor);
      },
      () => {
        this.current = target;
      },
    );
  }

  get isNapDark(): boolean {
    return this.current === NAP;
  }
}
