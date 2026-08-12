/**
 * Non-verbal hint: a small glowing hand mesh that performs a brief gesture
 * near the thing the child should touch next, per docs/MASTER_SPEC.md
 * ("無操作3〜5秒で非言語ヒント：光る手がジェスチャーを実演") and
 * docs/CAMERA_STORYBOARD.md (hint visuals may live in scenes or camera).
 * Triggered by the `hintShown` bus event emitted by GameDirector's idle
 * timer; this is the one piece of scene content allowed its own short local
 * animation clock, since it is a UI affordance, not a StageTransformProgress
 * rig element bound by the "no per-element timers" rule.
 */
import { ConeGeometry, Group, Mesh, SphereGeometry, type BufferGeometry, type Material } from 'three';
import type { EventBus, MaterialLibrary } from '../../core';

const GESTURE_DURATION_S = 1.6;

const HINT_POSITION: Record<'tapFloor' | 'releaseLock' | 'pullRope' | 'choose', readonly [number, number, number]> = {
  tapFloor: [0.3, 0.12, -0.2],
  releaseLock: [0.55, -0.55, 1.15],
  pullRope: [0.95, -0.75, 1.1],
  choose: [0, 1.2, 1.4]
};

export class HintHand {
  readonly group = new Group();
  private readonly palm: Mesh;
  private readonly ownedGeometries: BufferGeometry[] = [];
  private readonly ownedMaterials: Material[] = [];
  private elapsed = GESTURE_DURATION_S; // start finished/hidden
  private baseY = 0;
  private unsubscribe: (() => void) | null = null;

  constructor(materials: MaterialLibrary) {
    const palmGeometry = new SphereGeometry(0.14, 10, 8);
    this.ownedGeometries.push(palmGeometry);
    const fingerGeometry = new ConeGeometry(0.05, 0.16, 6);
    this.ownedGeometries.push(fingerGeometry);
    const material = materials.goldTrim();
    this.ownedMaterials.push(material);

    this.palm = new Mesh(palmGeometry, material);
    this.group.add(this.palm);
    for (let i = -1; i <= 1; i += 1) {
      const finger = new Mesh(fingerGeometry, material);
      finger.position.set(i * 0.09, 0.16, 0);
      this.group.add(finger);
    }
    this.group.visible = false;
  }

  attach(bus: EventBus): void {
    this.unsubscribe = bus.on('hintShown', (event) => {
      const position = HINT_POSITION[event.hint];
      this.baseY = position[1];
      this.group.position.set(position[0], position[1], position[2]);
      this.elapsed = 0;
    });
  }

  update(dt: number, reducedMotion: boolean): void {
    if (this.elapsed >= GESTURE_DURATION_S) {
      this.group.visible = false;
      return;
    }
    this.elapsed += dt;
    this.group.visible = true;
    if (reducedMotion) return; // still shown, but no sway/bob motion
    const t = this.elapsed * 5;
    this.group.position.y = this.baseY + Math.sin(t) * 0.06;
    const scale = 1 + Math.sin(t * 2) * 0.08;
    this.group.scale.setScalar(scale);
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const geometry of this.ownedGeometries) geometry.dispose();
    for (const material of this.ownedMaterials) material.dispose();
    this.group.clear();
  }
}
