import * as THREE from 'three';
import { Ctx, Mod, POS, applyDecor } from '../game';
import { clamp, damp, lerp } from '../util';
import { nearScreen } from './helpers';

/** Module 0: 導入 — 見る、選ぶ */
export function introModule(): Mod {
  let wave = 0;
  return {
    name: 'intro',
    enter(c) {
      c.cam.setShot({
        pos: new THREE.Vector3(0.2, 1.5, 3.6),
        look: new THREE.Vector3(0, 0.55, -0.3),
        fov: 44,
      });
      applyDecor(c.stage, c.save);
      c.ui.onDecor = () => applyDecor(c.stage, c.save);
      c.ui.showIntro(c.save, () => {
        c.audio.unlock();
        c.audio.voice('チーズやさん、はじめるよ');
        c.complete(undefined, true);
      });
      wave = 0;
    },
    exit(c) {
      c.ui.hideIntro();
    },
    update(c, dt) {
      wave += dt;
      // 職人が手をふる
      const t = c.stage.time;
      c.stage.chef.setHands(
        null,
        new THREE.Vector3(0.5, 1.15 + Math.sin(t * 5) * 0.08, -1.0),
      );
      c.stage.chef.look(new THREE.Vector3(0, 0.6, 3));
    },
    hint: () => null,
  };
}

/** Module 1: お湯を注ぐ — レバーを下へ */
export function pourModule(): Mod {
  let progress = 0;
  let pull = 0;
  let grabbing = false;
  let zoomed = false;
  const knobWorld = new THREE.Vector3();
  const spout = new THREE.Vector3();
  const impact = new THREE.Vector3(0.28, 0.08, -0.28);
  let rippleT = 0;
  let steamT = 0;

  return {
    name: 'pour',
    enter(c) {
      progress = 0; pull = 0; grabbing = false; zoomed = false;
      c.cam.setShot({
        pos: new THREE.Vector3(0.7, 1.35, 2.6),
        look: new THREE.Vector3(0.5, 0.25, -0.1),
        fov: 46,
      });
      c.audio.voice('おゆで やわらかくしよう');
      c.stage.chef.look(knobWorld.set(1.12, 0.62, 0.14));
      c.audio.startChannel('pour');
    },
    exit(c) {
      c.audio.stopChannel('pour');
      c.stage.hotStream.level = 0;
      c.stage.props.kettle.rotation.z = 0;
      c.stage.props.lever.rotation.x = 0;
    },
    down(c, p) {
      const knob = c.stage.props.lever.getObjectByName('knob')!;
      knob.getWorldPosition(knobWorld);
      if (nearScreen(c, knobWorld, 110)) {
        grabbing = true;
        c.audio.squish(1.2);
      }
    },
    move(c, p) {
      if (!grabbing) return;
      pull = clamp((p.y - p.startY) / (window.innerHeight * 0.16), 0, 1);
    },
    up() {
      grabbing = false;
    },
    update(c, dt) {
      if (!grabbing) pull = damp(pull, 0, 6, dt);
      const lever = c.stage.props.lever;
      lever.rotation.x = pull * 0.85;
      const kettle = c.stage.props.kettle;
      kettle.rotation.z = damp(kettle.rotation.z, pull * 0.75, 8, dt);
      // 職人がケトルを支える
      const kw = kettle.position;
      c.stage.chef.setHands(
        pull > 0.05 ? new THREE.Vector3(kw.x - 0.1, kw.y + 0.28, kw.z + 0.1) : null,
        new THREE.Vector3(1.62, 0.72, -0.1),
      );
      const pouring = pull > 0.25;
      // 注ぎ口ワールド座標
      spout.set(-0.36, 0.28, 0);
      kettle.localToWorld(spout);
      c.stage.hotStream.level = damp(c.stage.hotStream.level, pouring ? pull : 0, 8, dt);
      c.stage.hotStream.from.copy(spout);
      c.stage.hotStream.to.copy(impact);
      c.audio.setChannel('pour', pouring ? pull : 0);
      if (pouring) {
        progress = Math.min(1, progress + dt * pull / 2.6);
        if (!zoomed && progress > 0.12) {
          zoomed = true;
          // 因果へ寄る (カットせず移動、レバーは画面内に保つ)
          c.cam.setShot({
            pos: new THREE.Vector3(0.8, 1.1, 2.25),
            look: new THREE.Vector3(0.45, 0.18, -0.05),
            fov: 44,
          });
        }
        // 波紋と湯気
        rippleT -= dt;
        if (rippleT <= 0) {
          rippleT = 0.35;
          c.stage.ripples.spawn(new THREE.Vector3(impact.x, 0.075, impact.z), 1.1);
        }
        steamT -= dt;
        if (steamT <= 0 && !c.stage.reduceMotion) {
          steamT = 0.22;
          c.stage.steam.spawn(
            impact.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.05, (Math.random() - 0.5) * 0.3)),
            new THREE.Vector3(0, 0.35, 0), 1.6, 0.14, 0.12, -0.05, 0.3,
          );
        }
        // 水面が現れ、カードがしっとり
        const surf = c.stage.props.mainBowl.getObjectByName('hotSurf') as THREE.Mesh;
        surf.visible = progress > 0.08;
        surf.scale.setScalar(clamp(progress * 1.4, 0.15, 1));
        (c.stage.mats.curd as THREE.MeshStandardMaterial).roughness = lerp(0.85, 0.38, progress);
        // カードがゆらゆら
        const cs = c.world.curdStates;
        for (let i = 0; i < cs.length; i++) {
          const s = cs[i];
          s.pos.y = s.home.y + Math.sin(c.stage.time * 5 + i) * 0.012 * progress;
          // 少しずつ寄る
          s.pos.x = damp(s.pos.x, s.home.x * (1 - progress * 0.25), 1, dt);
          s.pos.z = damp(s.pos.z, s.home.z * (1 - progress * 0.25), 1, dt);
        }
        c.world.updateCurds();
        if (progress >= 1) {
          c.audio.voice('やわらかくなってきた');
          c.complete(new THREE.Vector3(0, 0.3, 0));
        }
      }
    },
    hint(c) {
      const knob = c.stage.props.lever.getObjectByName('knob')!;
      knob.getWorldPosition(knobWorld);
      return {
        path: [knobWorld.clone(), knobWorld.clone().add(new THREE.Vector3(0, -0.4, 0))],
        dur: 1.4,
      };
    },
  };
}

/** Module 2: カードを集める — 中央へ寄せる */
export function gatherModule(): Mod {
  let strokes = 0;
  let strokeDist = 0;
  let merged = false;
  let mergeT = 0;
  const paddleTarget = new THREE.Vector3(0.4, 0.14, 0.3);

  return {
    name: 'gather',
    enter(c) {
      strokes = 0; merged = false; mergeT = 0;
      c.cam.setShot({
        pos: new THREE.Vector3(0, 1.85, 1.75),
        look: new THREE.Vector3(0, 0.05, -0.05),
        fov: 42,
      });
      c.audio.voice('まんなかへ あつめよう');
      const paddle = c.stage.props.paddle;
      paddle.visible = true;
      paddle.position.copy(paddleTarget);
      c.stage.chef.look(new THREE.Vector3(0, 0.1, 0));
    },
    exit(c) {
      c.stage.props.paddle.visible = false;
    },
    down(c, p) {
      strokeDist = 0;
    },
    move(c, p) {
      if (!p.down || merged) return;
      const hit = c.input.planeHit(c.stage.camera, 0.12);
      // ボウル範囲へ緩くクランプ
      const r = Math.hypot(hit.x, hit.z);
      if (r > 0.7) hit.multiplyScalar(0.7 / r).setY(0.12);
      paddleTarget.copy(hit);
      strokeDist += Math.hypot(p.dx, p.dy);
      // パドル付近のカードを中央へ
      const cs = c.world.curdStates;
      let moved = false;
      for (const s of cs) {
        const d = Math.hypot(s.pos.x - hit.x, s.pos.z - hit.z);
        if (d < 0.3) {
          s.pos.x = damp(s.pos.x, s.pos.x * 0.5, 6, 1 / 60);
          s.pos.z = damp(s.pos.z, s.pos.z * 0.5, 6, 1 / 60);
          moved = true;
        }
      }
      if (moved) c.audio.gather();
      c.world.updateCurds();
    },
    up(c, p) {
      if (strokeDist > 50 && !merged) {
        strokes++;
        // 磁力: ひと撫でごとに全体が中央へ
        for (const s of c.world.curdStates) {
          s.pos.x *= 0.72;
          s.pos.z *= 0.72;
        }
        c.world.updateCurds();
        if (strokes >= 3) {
          merged = true;
          c.audio.squish(0.8);
        }
      }
    },
    update(c, dt) {
      const paddle = c.stage.props.paddle;
      paddle.position.x = damp(paddle.position.x, paddleTarget.x, 12, dt);
      paddle.position.y = damp(paddle.position.y, paddleTarget.y, 12, dt);
      paddle.position.z = damp(paddle.position.z, paddleTarget.z, 12, dt);
      c.stage.chef.setHands(null, paddle.position.clone().add(new THREE.Vector3(0.1, 0.35, 0.15)));
      if (merged) {
        mergeT += dt;
        const k = clamp(mergeT / 0.9, 0, 1);
        for (const s of c.world.curdStates) {
          s.gathered = k;
          s.pos.x = lerp(s.pos.x, 0, k * 0.4);
          s.pos.z = lerp(s.pos.z, 0, k * 0.4);
          s.pos.y = lerp(s.pos.y, 0.2, k * 0.2);
        }
        c.world.updateCurds();
        const blob = c.world.blob;
        blob.visible = k > 0.25;
        blob.position.set(0, 0.26, 0);
        blob.scale.setScalar(clamp((k - 0.25) * 1.4, 0.01, 1));
        if (k >= 1) {
          c.world.curds.visible = false;
          c.audio.voice('ひとつに なったね');
          c.complete(new THREE.Vector3(0, 0.35, 0));
          merged = false;
        }
      }
    },
    hint(c) {
      return {
        path: [
          new THREE.Vector3(0.45, 0.15, 0.25),
          new THREE.Vector3(0, 0.15, 0),
          new THREE.Vector3(-0.4, 0.15, -0.2),
        ],
        dur: 1.6,
      };
    },
  };
}
