import * as THREE from 'three';
import { InputManager } from './input';

export interface HintSpec {
  /** ワールド座標の経路 (2点以上でスワイプ、1点でタップ/長押し) */
  path: THREE.Vector3[];
  /** ループ時間 */
  dur?: number;
  hold?: boolean;
  circle?: boolean;
}

/**
 * 迷ったときの指ヒント。数秒操作が無いと、光る指パックが
 * なぞるべき軌跡をやさしく往復する。
 */
export class HintManager {
  private puck = document.getElementById('hintPuck')!;
  private trail = document.getElementById('hintTrail') as unknown as SVGSVGElement;
  private t = 0;
  active = false;
  idleDelay = 5;
  private camera: THREE.PerspectiveCamera;

  constructor(camera: THREE.PerspectiveCamera) {
    this.camera = camera;
    this.trail.setAttribute('width', '100%');
    this.trail.setAttribute('height', '100%');
  }

  update(dt: number, spec: HintSpec | null, input: InputManager) {
    const idle = (performance.now() - input.lastActive) / 1000;
    const show = !!spec && idle > this.idleDelay && !input.p.down;
    if (!show || !spec) {
      if (this.active) {
        this.active = false;
        this.puck.style.opacity = '0';
        this.trail.innerHTML = '';
      }
      return;
    }
    this.active = true;
    this.t += dt;
    const dur = spec.dur ?? 1.6;
    const cyc = (this.t % (dur + 0.6)) / dur; // 少し休止を挟む
    const k = Math.min(1, cyc);
    const pts = spec.path.map(w => {
      const p = w.clone().project(this.camera);
      return {
        x: (p.x * 0.5 + 0.5) * window.innerWidth,
        y: (-p.y * 0.5 + 0.5) * window.innerHeight,
      };
    });
    let x: number, y: number;
    if (spec.circle && pts.length >= 1) {
      const cx = pts[0].x, cy = pts[0].y;
      const r = Math.min(window.innerWidth, window.innerHeight) * 0.2;
      const a = k * Math.PI * 2;
      x = cx + Math.cos(a) * r;
      y = cy + Math.sin(a) * r * 0.7;
    } else if (pts.length === 1) {
      x = pts[0].x; y = pts[0].y;
    } else {
      // ポリライン補間
      const seg = (pts.length - 1) * k;
      const i = Math.min(pts.length - 2, Math.floor(seg));
      const f = seg - i;
      x = pts[i].x + (pts[i + 1].x - pts[i].x) * f;
      y = pts[i].y + (pts[i + 1].y - pts[i].y) * f;
    }
    const fade = cyc > 1 ? Math.max(0, 1 - (cyc - 1) * 4) : 1;
    const pulse = spec.hold || pts.length === 1 ? (0.85 + Math.sin(this.t * 6) * 0.15) : 1;
    this.puck.style.opacity = String(0.9 * fade);
    this.puck.style.transform = `translate(${x}px, ${y}px) scale(${pulse})`;
    this.puck.style.left = '0px';
    this.puck.style.top = '0px';
    // 軌跡線
    if (pts.length >= 2 && !spec.circle) {
      const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(0)},${p.y.toFixed(0)}`).join(' ');
      this.trail.innerHTML = `<path d="${d}" fill="none" stroke="rgba(255,180,210,0.55)" stroke-width="14" stroke-linecap="round" stroke-dasharray="2 22"/>`;
    } else if (spec.circle) {
      const cx = pts[0].x, cy = pts[0].y;
      const r = Math.min(window.innerWidth, window.innerHeight) * 0.2;
      this.trail.innerHTML = `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${r * 0.7}" fill="none" stroke="rgba(255,180,210,0.5)" stroke-width="12" stroke-dasharray="2 20"/>`;
    } else {
      this.trail.innerHTML = '';
    }
  }
}
