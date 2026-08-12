import * as THREE from 'three';
import type { ChildDef, ToySymbol } from '../game/types.ts';
import { mergeGeometries, paintGeometry } from './geometry.ts';
import { PALETTE } from './palette.ts';
import { Easing, TweenManager } from './tween.ts';

const BADGE_COLOR: Record<ToySymbol, number> = {
  star: PALETTE.butter,
  rainbow: PALETTE.coral,
  flower: PALETTE.mint,
};

export interface NpcRig {
  id: string;
  isTeacher: boolean;
  group: THREE.Group;
  armL: THREE.Mesh;
  armR: THREE.Mesh;
  body: THREE.Mesh;
  breathing: boolean;
  eating: boolean;
  waving: boolean;
  lying: boolean;
  phase: number;
  armRestRotL: THREE.Euler;
  armRestRotR: THREE.Euler;
}

function buildArmGeometry(skin: number, clothes: number, scale: number): THREE.BufferGeometry {
  const sleeve = new THREE.CapsuleGeometry(0.028 * scale, 0.1 * scale, 3, 6);
  sleeve.translate(0, -0.06 * scale, 0);
  paintGeometry(sleeve, new THREE.Color(clothes));
  const hand = new THREE.SphereGeometry(0.026 * scale, 8, 6);
  hand.translate(0, -0.135 * scale, 0);
  paintGeometry(hand, new THREE.Color(skin));
  return mergeGeometries([sleeve, hand]);
}

function buildBodyGeometry(child: { skinTone: number; hairStyle: number; hairColor: number; clothesColor: number; badge: ToySymbol }, scale: number, isTeacher: boolean): THREE.BufferGeometry {
  const skin = PALETTE.skinTones[child.skinTone % PALETTE.skinTones.length]!;
  const hair = PALETTE.hairColors[child.hairColor % PALETTE.hairColors.length]!;
  const clothes = PALETTE.clothesColors[child.clothesColor % PALETTE.clothesColors.length]!;
  const badgeColor = BADGE_COLOR[child.badge];

  const parts: THREE.BufferGeometry[] = [];

  const legs = new THREE.CapsuleGeometry(0.05 * scale, 0.16 * scale, 3, 8);
  legs.translate(0, 0.12 * scale, 0);
  paintGeometry(legs, new THREE.Color(clothes).lerp(new THREE.Color(0x333333), 0.25));
  parts.push(legs);

  const torso = new THREE.CapsuleGeometry(0.075 * scale, 0.16 * scale, 4, 10);
  torso.translate(0, 0.3 * scale, 0);
  paintGeometry(torso, new THREE.Color(clothes));
  parts.push(torso);

  const head = new THREE.SphereGeometry(0.075 * scale, 16, 12);
  head.translate(0, 0.46 * scale, 0);
  paintGeometry(head, new THREE.Color(skin));
  parts.push(head);

  const hairCap = new THREE.SphereGeometry(0.079 * scale, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.62);
  hairCap.translate(0, 0.475 * scale, 0);
  paintGeometry(hairCap, new THREE.Color(hair));
  parts.push(hairCap);

  const eyeGeo = new THREE.SphereGeometry(0.007 * scale, 6, 6);
  const eyeL = eyeGeo.clone();
  eyeL.translate(-0.028 * scale, 0.465 * scale, 0.068 * scale);
  paintGeometry(eyeL, new THREE.Color(0x2b2320));
  parts.push(eyeL);
  const eyeR = eyeGeo.clone();
  eyeR.translate(0.028 * scale, 0.465 * scale, 0.068 * scale);
  paintGeometry(eyeR, new THREE.Color(0x2b2320));
  parts.push(eyeR);
  eyeGeo.dispose();

  if (!isTeacher) {
    const badge = new THREE.CircleGeometry(0.022 * scale, 10);
    badge.translate(0, 0.33 * scale, 0.077 * scale);
    paintGeometry(badge, new THREE.Color(badgeColor));
    parts.push(badge);
  } else {
    const apron = new THREE.CapsuleGeometry(0.08 * scale, 0.14 * scale, 3, 8);
    apron.translate(0, 0.26 * scale, 0.01 * scale);
    apron.scale(1.03, 1, 0.55);
    paintGeometry(apron, new THREE.Color(PALETTE.cream));
    parts.push(apron);
  }

  return mergeGeometries(parts);
}

export function buildNpcRig(child: ChildDef, isTeacher = false): NpcRig {
  const scale = isTeacher ? 1.32 : 1;
  const skin = isTeacher ? PALETTE.teacherSkin : PALETTE.skinTones[child.skinTone % PALETTE.skinTones.length]!;
  const clothes = isTeacher ? PALETTE.teacherClothes : PALETTE.clothesColors[child.clothesColor % PALETTE.clothesColors.length]!;

  const bodyGeo = buildBodyGeometry(
    { skinTone: child.skinTone, hairStyle: child.hairStyle, hairColor: isTeacher ? 0 : child.hairColor, clothesColor: child.clothesColor, badge: child.badgeSymbol },
    scale,
    isTeacher,
  );
  const bodyMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 });
  const body = new THREE.Mesh(bodyGeo, bodyMat);

  const armGeo = buildArmGeometry(skin, clothes, scale);
  const armMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 });
  const armL = new THREE.Mesh(armGeo, armMat);
  const armR = new THREE.Mesh(armGeo.clone(), armMat);
  armL.position.set(-0.1 * scale, 0.38 * scale, 0);
  armR.position.set(0.1 * scale, 0.38 * scale, 0);
  const restRotL = new THREE.Euler(0, 0, 0.18);
  const restRotR = new THREE.Euler(0, 0, -0.18);
  armL.rotation.copy(restRotL);
  armR.rotation.copy(restRotR);

  const group = new THREE.Group();
  group.add(body, armL, armR);

  return {
    id: isTeacher ? 'teacher' : child.id,
    isTeacher,
    group,
    armL,
    armR,
    body,
    breathing: false,
    eating: false,
    waving: false,
    lying: false,
    phase: Math.random() * Math.PI * 2,
    armRestRotL: restRotL,
    armRestRotR: restRotR,
  };
}

export class NpcAnimator {
  private tweens: TweenManager;
  constructor(tweens: TweenManager) {
    this.tweens = tweens;
  }

  walkTo(rig: NpcRig, target: THREE.Vector3, duration: number, onDone?: () => void): void {
    const start = rig.group.position.clone();
    const dir = Math.atan2(target.x - start.x, target.z - start.z);
    rig.group.rotation.y = dir;
    this.tweens.add(
      duration,
      Easing.cubicInOut,
      (p) => {
        rig.group.position.lerpVectors(start, target, p);
        rig.group.position.y = Math.abs(Math.sin(p * Math.PI * 8)) * 0.015;
      },
      () => {
        rig.group.position.y = 0;
        onDone?.();
      },
    );
  }

  sitDown(rig: NpcRig, seatPos: THREE.Vector3, facing: number, duration: number, onDone?: () => void): void {
    const startPos = rig.group.position.clone();
    const startRot = rig.group.rotation.y;
    this.tweens.add(
      duration,
      Easing.backOut,
      (p) => {
        rig.group.position.lerpVectors(startPos, seatPos, p);
        rig.group.position.y = -0.06 * p;
        rig.group.rotation.y = THREE.MathUtils.lerp(startRot, facing, p);
      },
      onDone,
    );
  }

  standUp(rig: NpcRig, target: THREE.Vector3, duration: number, onDone?: () => void): void {
    const startPos = rig.group.position.clone();
    this.tweens.add(
      duration,
      Easing.cubicOut,
      (p) => {
        rig.group.position.lerpVectors(startPos, target, p);
        rig.group.position.y = -0.06 * (1 - p);
      },
      onDone,
    );
  }

  lieDown(rig: NpcRig, matPos: THREE.Vector3, facing: number, duration: number, onDone?: () => void): void {
    const startPos = rig.group.position.clone();
    const startRotY = rig.group.rotation.y;
    const startRotX = rig.group.rotation.x;
    this.tweens.add(
      duration,
      Easing.cubicInOut,
      (p) => {
        rig.group.position.lerpVectors(startPos, matPos, p);
        rig.group.rotation.x = THREE.MathUtils.lerp(startRotX, -Math.PI / 2, p);
        rig.group.rotation.y = THREE.MathUtils.lerp(startRotY, facing, p);
        rig.group.position.y = 0.06 * (1 - Math.cos(p * Math.PI)) * 0.5;
      },
      () => {
        rig.lying = true;
        onDone?.();
      },
    );
  }

  wake(rig: NpcRig, standPos: THREE.Vector3, duration: number, onDone?: () => void): void {
    const startPos = rig.group.position.clone();
    const startRotX = rig.group.rotation.x;
    rig.lying = false;
    this.tweens.add(
      duration,
      Easing.cubicOut,
      (p) => {
        rig.group.position.lerpVectors(startPos, standPos, p);
        rig.group.rotation.x = THREE.MathUtils.lerp(startRotX, 0, p);
      },
      onDone,
    );
  }

  playWave(rig: NpcRig): void {
    const base = rig.armRestRotR.clone();
    this.tweens.add(0.9, Easing.sineInOut, (p) => {
      const wiggle = Math.sin(p * Math.PI * 4) * 0.5;
      rig.armR.rotation.set(base.x - 1.6 * Math.sin(p * Math.PI), base.y, base.z + wiggle * 0.3);
    }, () => {
      rig.armR.rotation.copy(base);
    });
  }

  playPointGesture(rig: NpcRig, durationSeconds: number): void {
    const baseL = rig.armRestRotL.clone();
    this.tweens.add(durationSeconds, Easing.cubicInOut, (p) => {
      const raise = Math.sin(p * Math.PI);
      rig.armL.rotation.set(baseL.x - 1.3 * raise, baseL.y, baseL.z);
    }, () => {
      rig.armL.rotation.copy(baseL);
    });
  }
}

/** Continuous idle animation (breathing / eating spoon motion) — called every frame, no allocations. */
export function updateNpcIdle(rig: NpcRig, elapsedSeconds: number, reducedMotion: boolean): void {
  const speed = reducedMotion ? 0.6 : 1;
  if (rig.breathing) {
    const breathe = 1 + Math.sin(elapsedSeconds * 1.6 * speed + rig.phase) * (reducedMotion ? 0.015 : 0.03);
    rig.body.scale.set(1, breathe, 1);
  }
  if (rig.eating && !rig.lying) {
    const spoon = Math.max(0, Math.sin(elapsedSeconds * 2.2 * speed + rig.phase));
    rig.armR.rotation.set(rig.armRestRotR.x - spoon * 0.9, rig.armRestRotR.y, rig.armRestRotR.z);
  }
  if (!rig.lying && !rig.eating) {
    const sway = Math.sin(elapsedSeconds * 0.7 * speed + rig.phase) * (reducedMotion ? 0.01 : 0.02);
    rig.group.rotation.z = sway;
  } else if (!rig.lying) {
    rig.group.rotation.z = 0;
  }
}
