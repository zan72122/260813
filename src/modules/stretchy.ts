import * as THREE from 'three';
import { Ctx, Mod, POS } from '../game';
import { clamp, damp, lerp } from '../util';
import { nearScreen } from './helpers';

/** Module 3: モッツァレラを伸ばす — 看板体験 */
export function stretchModule(): Mod {
  const anchor = new THREE.Vector3(-0.45, 0.72, -0.05);
  const handleRest = new THREE.Vector3(-0.08, 0.7, -0.05);
  let grabbing = false;
  let folding = 0; // >0: 折り畳み中
  let intro = 0; // 塊が持ち上がる演出
  let lastBoingLen = 0;
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0.05);
  const camBase = new THREE.Vector3(0.35, 1.0, 2.7);

  return {
    name: 'stretch',
    enter(c) {
      grabbing = false; folding = 0; intro = 0; lastBoingLen = 0;
      c.craft.folds = 0;
      c.cam.setShot({ pos: camBase.clone(), look: new THREE.Vector3(0.25, 0.65, -0.05), fov: 42 });
      c.audio.voice('びよーんと のばしてみよう');
      c.world.blob.visible = true;
      c.world.blob.position.set(0, 0.28, 0);
    },
    exit(c) {
      c.world.stretch.group.visible = false;
      c.world.blob.visible = false;
    },
    down(c, p) {
      if (intro < 1) return;
      const st = c.world.stretch;
      if (folding > 0 || nearScreen(c, st.visHandle, 150)) {
        grabbing = true;
        folding = 0;
        c.audio.squish();
      }
    },
    move(c, p) {
      if (!grabbing) return;
      const st = c.world.stretch;
      const hit = c.input.customPlaneHit(c.stage.camera, plane);
      if (!hit) return;
      hit.x = clamp(hit.x, anchor.x + 0.12, 2.2);
      hit.y = clamp(hit.y, 0.3, 1.5);
      hit.z = anchor.z;
      st.handle.copy(hit);
      // 速く引くと揺れる
      const speed = Math.hypot(p.vx, p.vy);
      st.excite(speed * 0.00003);
      const L = st.length;
      c.craft.maxStretch = Math.max(c.craft.maxStretch, L);
      // 伸びの節目で「びよーん」
      if (L > lastBoingLen + 0.45) {
        lastBoingLen = L;
        c.audio.boing(clamp(L / 2, 0, 1), clamp(speed / 2500, 0, 1));
        if (L > 1.2) c.audio.voice('びよーん！');
      }
    },
    up(c, p) {
      if (!grabbing) return;
      grabbing = false;
      folding = 0.0001; // 折り畳み開始
      lastBoingLen = 0;
    },
    update(c, dt) {
      const st = c.world.stretch;
      // 導入: 職人が塊を持ち上げる
      if (intro < 1) {
        intro = Math.min(1, intro + dt / 0.8);
        const p = new THREE.Vector3().lerpVectors(new THREE.Vector3(0, 0.28, 0), anchor, intro);
        c.world.blob.position.copy(p);
        c.stage.chef.setHands(p.clone().add(new THREE.Vector3(-0.08, 0.1, 0)), null);
        if (intro >= 1) {
          c.world.blob.visible = false;
          st.group.visible = true;
          st.snapTo(anchor, handleRest);
        }
        return;
      }
      // 折り畳み
      if (folding > 0) {
        folding += dt / 0.42;
        const k = Math.min(folding, 1);
        const e = 1 - Math.pow(1 - k, 2);
        st.handle.lerpVectors(st.handle, anchor.clone().add(new THREE.Vector3(0.14, 0.02, 0)), e * 0.25 + dt * 6 * e);
        if (k >= 1) {
          folding = 0;
          c.craft.folds++;
          c.audio.petan();
          st.excite(0.1);
          st.baseRadius = Math.min(0.2, st.baseRadius + 0.008);
          if (c.craft.folds === 1) c.audio.voice('もういっかい、びよーん');
          if (c.craft.folds >= 3) {
            c.audio.voice('つやつやに なったね');
            c.complete(anchor.clone().add(new THREE.Vector3(0.3, 0, 0)));
          }
        }
      }
      st.update(dt);
      // 職人の左手がチーズを保持
      c.stage.chef.setHands(anchor.clone().add(new THREE.Vector3(-0.05, 0.12, 0)), null);
      c.stage.chef.look(st.visHandle);
      // カメラ: チーズ全体が収まるよう横へ追従 + 引き
      const L = st.length;
      const mid = anchor.clone().lerp(st.visHandle, 0.5);
      const pull = clamp(L * 0.55, 0, 1.1);
      c.cam.nudgePos(new THREE.Vector3(
        camBase.x + mid.x * 0.45,
        camBase.y + (mid.y - 0.7) * 0.3,
        camBase.z + pull,
      ));
      c.cam.nudgeLook(new THREE.Vector3(mid.x * 0.8, mid.y * 0.75 + 0.18, -0.05));
    },
    hint(c) {
      if (intro < 1) return null;
      const st = c.world.stretch;
      return {
        path: [st.visHandle.clone(), st.visHandle.clone().add(new THREE.Vector3(1.0, 0.1, 0))],
        dur: 1.5,
      };
    },
  };
}

/** Module 4: 生地を丸く広げる — 放射状スワイプ */
export function spreadModule(): Mod {
  let progress = 0;
  let lastSquish = 0;
  return {
    name: 'spread',
    enter(c) {
      progress = 0;
      c.cam.setShot({
        pos: new THREE.Vector3(0, 1.5, 1.95),
        look: new THREE.Vector3(0, 0.08, 0.45),
        fov: 42,
      });
      c.audio.voice('まるく ひろげよう');
      c.stage.chef.look(POS.board);
    },
    move(c, p) {
      if (!p.down || progress >= 1) return;
      const bag = c.world.bag;
      const hit = c.input.planeHit(c.stage.camera, 0.06);
      const local = hit.clone().sub(bag.group.position);
      const r = Math.hypot(local.x, local.z);
      if (r > 0.75) return;
      // 外向きの動きだけが広げる
      const prevR = Math.hypot(local.x - (p.dx * 0.002), local.z);
      const move = Math.hypot(p.dx, p.dy) / window.innerWidth;
      // スワイプ方向が中心から外向きか (画面上の速度と半径方向でおおまかに判定)
      const dirOut = r > 0.06 ? 1 : 0.5;
      progress = Math.min(1, progress + move * dirOut * 0.95);
      void prevR;
      // 形へ反映
      const P = bag.params;
      P.R = lerp(0.2, 0.42, progress);
      P.thickness = lerp(0.3, 0.09, progress);
      // プレイヤーの方向の癖を波打ちとして記録
      const ang = Math.atan2(-local.z, local.x);
      const idx = ((Math.round((ang / (Math.PI * 2)) * P.wobble.length) % P.wobble.length) + P.wobble.length) % P.wobble.length;
      P.wobble[idx] = clamp(P.wobble[idx] + move * 0.55, 0.92, 1.1);
      bag.dirty = true;
      if (c.stage.time - lastSquish > 0.35 && move > 0.004) {
        lastSquish = c.stage.time;
        c.audio.squish(0.9 + progress * 0.3);
      }
      // 職人の両手が補完
      c.stage.chef.setHands(
        bag.group.position.clone().add(new THREE.Vector3(-P.R - 0.1, 0.15, 0)),
        bag.group.position.clone().add(new THREE.Vector3(P.R + 0.1, 0.15, 0)),
      );
      if (progress >= 1) {
        c.audio.voice('まあるく なったね');
        c.complete(bag.group.position.clone().add(new THREE.Vector3(0, 0.2, 0)));
      }
    },
    update(c, dt) {
      if (!c.input.p.down) {
        c.stage.chef.setHands(null, null);
      }
    },
    hint(c) {
      const b = c.world.bag.group.position;
      return {
        path: [
          b.clone().add(new THREE.Vector3(0, 0.12, 0)),
          b.clone().add(new THREE.Vector3(0.5, 0.1, 0.15)),
        ],
        dur: 1.2,
      };
    },
  };
}

/** Module 5: チーズの袋を作る — へこませる → 持ち上げる */
export function bagFormModule(): Mod {
  let stage: 'dip' | 'lift' = 'dip';
  let active = false;
  return {
    name: 'bagform',
    enter(c) {
      stage = 'dip'; active = false;
      c.cam.setShot({
        pos: new THREE.Vector3(0.15, 1.15, 2.05),
        look: new THREE.Vector3(0, 0.15, 0.45),
        fov: 42,
      });
      c.audio.voice('まんなかを ぐっと おそう');
    },
    down(c, p) {
      const bag = c.world.bag;
      const center = bag.group.position.clone().add(new THREE.Vector3(0, 0.1, 0));
      if (stage === 'dip') {
        active = nearScreen(c, center, 220);
      } else {
        active = nearScreen(c, center, 320);
      }
      if (active) c.audio.squish();
    },
    move(c, p) {
      if (!active) return;
      const bag = c.world.bag;
      const P = bag.params;
      if (stage === 'dip') {
        // 画面下方向ドラッグ → 深さ
        P.depth = clamp(P.depth + p.dy / (window.innerHeight * 0.35), 0, 0.9);
        bag.dirty = true;
        if (P.depth >= 0.88) {
          stage = 'lift';
          active = false;
          c.audio.plop(1.2);
          c.audio.voice('ふちを うえへ もちあげよう');
        }
      } else {
        // 上方向スワイプ → 縁の持ち上がり
        P.rimLift = clamp(P.rimLift + (-p.dy) / (window.innerHeight * 0.3), 0, 0.75);
        bag.dirty = true;
        if (P.rimLift >= 0.74) {
          c.audio.voice('ふくろに なったね！');
          c.complete(bag.group.position.clone().add(new THREE.Vector3(0, 0.25, 0)));
        }
      }
      // 職人の両手
      c.stage.chef.setHands(
        bag.group.position.clone().add(new THREE.Vector3(-P.R - 0.08, 0.2, 0)),
        bag.group.position.clone().add(new THREE.Vector3(P.R + 0.08, 0.2, 0)),
      );
    },
    up() { active = false; },
    update(c, dt) {
      c.stage.chef.look(c.world.bag.group.position);
    },
    hint(c) {
      const b = c.world.bag.group.position;
      if (stage === 'dip') {
        return {
          path: [
            b.clone().add(new THREE.Vector3(0, 0.35, 0)),
            b.clone().add(new THREE.Vector3(0, 0.02, 0.1)),
          ],
          dur: 1.3,
        };
      }
      return {
        path: [
          b.clone().add(new THREE.Vector3(0.32, 0.05, 0.1)),
          b.clone().add(new THREE.Vector3(0.3, 0.5, 0.1)),
        ],
        dur: 1.3,
      };
    },
  };
}
