import * as THREE from 'three';
import { Ctx } from '../game';
import { InputManager } from '../input';

/** ワールド座標がポインタから px 以内か (寛容な当たり判定) */
export function nearScreen(c: Ctx, world: THREE.Vector3, px: number): boolean {
  const s = InputManager.toScreen(world, c.stage.camera);
  const p = c.input.p;
  return Math.hypot(s.x - p.x, s.y - p.y) < px * uiScale();
}

/** 画面サイズに応じた当たり判定スケール */
export function uiScale(): number {
  return Math.max(0.85, Math.min(window.innerWidth, window.innerHeight) / 620);
}

export function screenDist(c: Ctx, world: THREE.Vector3): number {
  const s = InputManager.toScreen(world, c.stage.camera);
  const p = c.input.p;
  return Math.hypot(s.x - p.x, s.y - p.y) / uiScale();
}
