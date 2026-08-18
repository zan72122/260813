import * as THREE from 'three';
import { Ctx, Mod, POS } from '../game';
import { clamp, damp, lerp } from '../util';
import { nearScreen } from './helpers';
import { saveSave } from '../save';
import { makeRibbon } from '../cheese';

/** Module 8: 口を集める — 上へ大きくスワイプ */
export function gatherMouthModule(): Mod {
  let progress = 0;
  let active = false;
  return {
    name: 'gatherMouth',
    enter(c) {
      progress = 0; active = false;
      c.cam.setShot({
        pos: new THREE.Vector3(0.1, 0.95, 1.85),
        look: new THREE.Vector3(0, 0.3, 0.5),
        fov: 42,
      });
      c.audio.voice('ふくろの くちを あつめよう');
    },
    down(c, p) {
      active = nearScreen(c, c.world.bag.group.position.clone().add(new THREE.Vector3(0, 0.2, 0)), 300);
    },
    move(c, p) {
      if (!active || progress >= 1) return;
      progress = clamp(progress + (-p.dy) / (window.innerHeight * 0.3), 0, 1);
      const bag = c.world.bag;
      bag.params.neck = progress;
      bag.dirty = true;
      if (Math.abs(p.dy) > 2) c.audio.gather();
      // 職人の指が縁全体を補完
      const h = 0.35 + progress * 0.25;
      c.stage.chef.setHands(
        bag.group.position.clone().add(new THREE.Vector3(-0.25 + progress * 0.15, h, 0)),
        bag.group.position.clone().add(new THREE.Vector3(0.25 - progress * 0.15, h, 0)),
      );
      if (progress >= 1) {
        c.audio.voice('くびが できたね');
        c.complete(bag.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
      }
    },
    up() { active = false; },
    update(c, dt) {
      c.stage.chef.look(c.world.bag.group.position);
    },
    hint(c) {
      const b = c.world.bag.group.position;
      return {
        path: [
          b.clone().add(new THREE.Vector3(0.28, 0.1, 0.1)),
          b.clone().add(new THREE.Vector3(0.05, 0.7, 0)),
        ],
        dur: 1.4,
      };
    },
    marker(c) {
      return { pos: c.world.bag.group.position.clone().add(new THREE.Vector3(0.28, 0.12, 0.1)), r: 0.15 };
    },
  };
}

/** Module 9: 口を閉じる — つまむ → ねじる */
export function closeMouthModule(): Mod {
  let stage: 'pinch' | 'twist' = 'pinch';
  let acc = 0;
  return {
    name: 'closeMouth',
    enter(c) {
      stage = 'pinch'; acc = 0;
      c.cam.setShot({
        pos: new THREE.Vector3(0.1, 0.8, 1.7),
        look: new THREE.Vector3(0, 0.42, 0.5),
        fov: 40,
      });
      c.audio.voice('くびを ちょんと つまもう');
    },
    move(c, p) {
      if (!p.down) return;
      const bag = c.world.bag;
      const neckTop = bag.group.position.clone().add(new THREE.Vector3(0, 0.55, 0));
      if (!nearScreen(c, neckTop, 320)) return;
      if (stage === 'pinch') {
        acc += Math.max(0, -p.dy);
        const k = clamp(acc / (window.innerHeight * 0.08), 0, 1);
        bag.params.knot = k * 0.5;
        bag.dirty = true;
        if (k >= 1) {
          stage = 'twist'; acc = 0;
          c.audio.squish(1.4);
          c.audio.voice('よこに くるっと ねじろう');
        }
      } else {
        acc += Math.abs(p.dx);
        const k = clamp(acc / (window.innerWidth * 0.12), 0, 1);
        bag.params.knot = 0.5 + k * 0.5;
        bag.knotMesh.rotation.y = k * 3.5;
        bag.dirty = true;
        if (k >= 1) {
          c.craft.knotTilt = clamp(p.vx / 3000, -0.3, 0.3);
          bag.knotMesh.rotation.z = c.craft.knotTilt;
          c.audio.kyu();
          c.audio.voice('キュッ！ とじたね');
          c.complete(bag.group.position.clone().add(new THREE.Vector3(0, 0.55, 0)));
        }
      }
    },
    update(c, dt) {
      const bag = c.world.bag;
      const neckTop = bag.group.position.clone().add(new THREE.Vector3(0, 0.5, 0));
      c.stage.chef.setHands(
        neckTop.clone().add(new THREE.Vector3(-0.12, 0.08, 0)),
        neckTop.clone().add(new THREE.Vector3(0.12, 0.08, 0)),
      );
      c.stage.chef.look(neckTop);
    },
    hint(c) {
      const b = c.world.bag.group.position;
      if (stage === 'pinch') {
        return {
          path: [
            b.clone().add(new THREE.Vector3(0, 0.45, 0.05)),
            b.clone().add(new THREE.Vector3(0, 0.75, 0)),
          ],
          dur: 1.1,
        };
      }
      return {
        path: [
          b.clone().add(new THREE.Vector3(-0.2, 0.6, 0)),
          b.clone().add(new THREE.Vector3(0.2, 0.6, 0)),
        ],
        dur: 1.1,
      };
    },
    marker(c) {
      return { pos: c.world.bag.group.position.clone().add(new THREE.Vector3(0, 0.52, 0.05)), r: 0.13 };
    },
  };
}

/** Module 10: 冷たい水へ — ポチャン */
export function coldWaterModule(): Mod {
  let grabbing = false;
  let dropped = false;
  let bobT = 0;
  return {
    name: 'coldWater',
    enter(c) {
      grabbing = false; dropped = false; bobT = 0;
      c.cam.setShot({
        pos: new THREE.Vector3(0.75, 1.25, 2.4),
        look: new THREE.Vector3(0.6, 0.2, 0.45),
        fov: 46,
      });
      c.audio.voice('つめたい おみずへ いれよう');
    },
    down(c, p) {
      if (dropped) return;
      grabbing = nearScreen(c, c.world.bag.group.position.clone().add(new THREE.Vector3(0, 0.25, 0)), 260);
      if (grabbing) c.audio.squish();
    },
    move(c, p) {
      if (!grabbing || dropped) return;
      const hit = c.input.planeHit(c.stage.camera, 0.3);
      const g = c.world.bag.group;
      g.position.x = clamp(hit.x, -0.3, 1.85);
      g.position.z = clamp(hit.z, 0.0, 1.1);
      g.position.y = 0.25;
      const d = Math.hypot(g.position.x - POS.coldBowl.x, g.position.z - POS.coldBowl.z);
      if (d < 0.32) drop(c);
    },
    up(c, p) {
      if (!grabbing || dropped) return;
      grabbing = false;
      const g = c.world.bag.group;
      const dCold = Math.hypot(g.position.x - POS.coldBowl.x, g.position.z - POS.coldBowl.z);
      const dBoard = Math.hypot(g.position.x - POS.board.x, g.position.z - POS.board.z);
      if (dCold < dBoard * 1.3) {
        // 磁力: 水まで運んであげる
        drop(c);
      }
      // そうでなければ update でボードへ戻る
    },
    update(c, dt) {
      const g = c.world.bag.group;
      if (dropped) {
        bobT += dt;
        // 沈む → 浮かぶ
        const sink = bobT < 0.5 ? lerp(0.25, -0.02, bobT / 0.5)
          : lerp(-0.02, 0.13, clamp((bobT - 0.5) / 1.0, 0, 1)) + Math.sin(bobT * 3) * 0.012;
        g.position.y = sink;
        if (bobT > 0.4 && bobT < 1.6 && Math.random() < dt * 6) {
          c.stage.coldRipples.spawn(new THREE.Vector3(g.position.x - POS.coldBowl.x, 0.21, g.position.z - POS.coldBowl.z), 1.2);
        }
        if (bobT >= 1.8) {
          // 冷水で少し締まる
          c.world.bag.params.R = 0.3;
          c.world.bag.dirty = true;
          c.audio.voice('かたちが きゅっと しまったよ');
          c.complete(g.position.clone().add(new THREE.Vector3(0, 0.3, 0)));
          dropped = false;
        }
        return;
      }
      if (!grabbing) {
        // ボードへ戻る
        g.position.x = damp(g.position.x, POS.board.x, 5, dt);
        g.position.z = damp(g.position.z, POS.board.z, 5, dt);
        g.position.y = damp(g.position.y, 0.05, 5, dt);
      }
      c.stage.chef.setHands(null, g.position.clone().add(new THREE.Vector3(0.15, 0.35, 0)));
      c.stage.chef.look(g.position);
    },
    hint(c) {
      return {
        path: [
          c.world.bag.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)),
          POS.coldBowl.clone().add(new THREE.Vector3(0, 0.4, 0)),
        ],
        dur: 1.6,
      };
    },
    marker(c) {
      if (dropped) return null;
      return { pos: c.world.bag.group.position.clone().add(new THREE.Vector3(0, 0.35, 0)), r: 0.18 };
    },
  };

  function drop(c: Ctx) {
    dropped = true;
    grabbing = false;
    bobT = 0;
    const g = c.world.bag.group;
    g.position.x = POS.coldBowl.x;
    g.position.z = POS.coldBowl.z;
    c.audio.splash(1);
    const top = POS.coldBowl.clone().add(new THREE.Vector3(0, 0.32, 0));
    if (!c.stage.reduceMotion) {
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        c.stage.splash.spawn(
          top.clone(),
          new THREE.Vector3(Math.cos(a) * 0.55, 1.3, Math.sin(a) * 0.55),
          0.5, 0.06, 0, 4,
        );
      }
    }
    c.stage.coldRipples.spawn(new THREE.Vector3(0, 0.21, 0), 1.4);
  }
}

/** Module 11: 皿へ移す — すくって置く */
export function plateModule(): Mod {
  let grabbing = false;
  let placed = false;
  let squishT = 0;
  let dripT = 0;
  return {
    name: 'toPlate',
    enter(c) {
      grabbing = false; placed = false; squishT = 0;
      c.cam.setShot({
        pos: new THREE.Vector3(1.05, 1.15, 2.4),
        look: new THREE.Vector3(1.05, 0.2, 0.6),
        fov: 45,
      });
      c.audio.voice('おさらへ うつそう');
      const spoon = c.stage.props.spoon;
      spoon.visible = true;
      spoon.position.copy(POS.coldBowl).add(new THREE.Vector3(0.3, 0.45, 0.2));
    },
    exit(c) {
      c.stage.props.spoon.visible = false;
    },
    down(c, p) {
      if (placed) return;
      grabbing = nearScreen(c, c.world.bag.group.position, 280);
      if (grabbing) c.audio.drip();
    },
    move(c, p) {
      if (!grabbing || placed) return;
      const hit = c.input.planeHit(c.stage.camera, 0.3);
      const g = c.world.bag.group;
      g.position.x = clamp(hit.x, 0.2, 1.9);
      g.position.z = clamp(hit.z, 0.1, 1.25);
      g.position.y = 0.3;
      const spoon = c.stage.props.spoon;
      spoon.position.copy(g.position).add(new THREE.Vector3(0, -0.13, 0.02));
      dripT -= 1 / 60;
      if (dripT <= 0) {
        dripT = 0.3;
        c.audio.drip();
        c.stage.drips.spawn(
          g.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.2, -0.1, 0.05)),
          new THREE.Vector3(0, -0.3, 0), 0.5, 0.035, 0, 3,
        );
      }
      const d = Math.hypot(g.position.x - POS.plate.x, g.position.z - POS.plate.z);
      if (d < 0.3) place(c);
    },
    up(c, p) {
      if (!grabbing || placed) return;
      grabbing = false;
      const g = c.world.bag.group;
      const d = Math.hypot(g.position.x - POS.plate.x, g.position.z - POS.plate.z);
      if (d < 0.75) place(c);
    },
    update(c, dt) {
      const g = c.world.bag.group;
      if (placed) {
        squishT += dt;
        // 柔らかくつぶれて、ゆっくり戻る
        const press = squishT < 0.35 ? squishT / 0.35 : Math.max(0, 1 - (squishT - 0.35) / 0.5);
        c.world.bag.params.squish = clamp(0.12 + 0.25 * press, 0, 0.4);
        c.world.bag.dirty = true;
        if (squishT > 1.1) {
          c.world.bag.params.squish = 0.12;
          c.world.bag.dirty = true;
          c.audio.voice('できたての ブラータ！');
          c.complete(g.position.clone().add(new THREE.Vector3(0, 0.35, 0)));
          placed = false;
        }
        return;
      }
      if (!grabbing) {
        g.position.x = damp(g.position.x, POS.coldBowl.x, 5, dt);
        g.position.z = damp(g.position.z, POS.coldBowl.z, 5, dt);
        g.position.y = damp(g.position.y, 0.14, 5, dt);
        const spoon = c.stage.props.spoon;
        spoon.position.x = damp(spoon.position.x, POS.coldBowl.x + 0.3, 5, dt);
        spoon.position.z = damp(spoon.position.z, POS.coldBowl.z + 0.2, 5, dt);
      }
      c.stage.chef.setHands(null, c.stage.props.spoon.position.clone().add(new THREE.Vector3(0.1, 0.3, 0.1)));
      c.stage.chef.look(c.world.bag.group.position);
    },
    hint(c) {
      return {
        path: [
          POS.coldBowl.clone().add(new THREE.Vector3(0, 0.35, 0)),
          POS.plate.clone().add(new THREE.Vector3(0, 0.3, 0)),
        ],
        dur: 1.6,
      };
    },
    marker(c) {
      if (placed) return null;
      return { pos: c.world.bag.group.position.clone().add(new THREE.Vector3(0, 0.32, 0)), r: 0.18 };
    },
  };

  function place(c: Ctx) {
    placed = true;
    grabbing = false;
    squishT = 0;
    const g = c.world.bag.group;
    g.position.set(POS.plate.x, 0.07, POS.plate.z);
    c.audio.plop(0.8);
    c.audio.squish(0.7);
  }
}

/** Module 12: 中を見せる — なぞって開く */
export function openModule(): Mod {
  let progress = 0;
  let active = false;
  let flowOut = 0;
  let pool: THREE.Mesh | null = null;
  let revealT = -1;
  let camMoved = false;
  return {
    name: 'open',
    enter(c) {
      progress = 0; active = false; flowOut = 0; revealT = -1; camMoved = false;
      c.cam.setShot({
        pos: new THREE.Vector3(0.72, 0.9, 2.3),
        look: new THREE.Vector3(0.7, 0.28, 0.9),
        fov: 42,
      });
      c.audio.voice('なかを みてみよう。せんを なぞってね');
      // ガイド線 (職人が両手で引き開くのを、なぞって手伝う)
      const g = c.world.guideLine;
      g.visible = true;
      g.position.copy(POS.plate).setY(0.5);
      // 流出プール (袋の手前側へ広がる)
      if (!pool) {
        pool = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), c.stage.mats.cream);
        pool.scale.setScalar(0.001);
        c.stage.scene.add(pool);
        // こぼれた細いチーズ
        const spilled = makeRibbon(c.stage.mats.mozz, 42, 0.5);
        spilled.scale.set(0.5, 0.9, 0.35);
        spilled.position.y = 0.25;
        spilled.name = 'spilled';
        pool.add(spilled);
      }
      pool.visible = true;
      pool.scale.setScalar(0.001);
      pool.position.copy(POS.plate).add(new THREE.Vector3(0.24, 0.045, 0.3));
      c.stage.creamStream.width = 2.4;
      c.audio.startChannel('flow');
    },
    exit(c) {
      c.world.guideLine.visible = false;
      c.audio.stopChannel('flow');
      c.stage.creamStream.level = 0;
      c.stage.creamStream.width = 1;
      if (pool) pool.visible = false;
    },
    down(c, p) {
      active = nearScreen(c, c.world.guideLine.position, 240);
    },
    move(c, p) {
      if (!active || progress >= 1) return;
      const bag = c.world.bag;
      const add = Math.abs(p.dx) / (Math.min(window.innerWidth, window.innerHeight) * 0.55);
      if (add <= 0) return;
      if (progress === 0 && Math.abs(p.dx) > 0.5) {
        c.craft.openDir = p.dx > 0 ? 0 : Math.PI;
        bag.params.openDir = Math.PI / 2; // 前後に開く(カメラへ見えるように)
      }
      progress = clamp(progress + add, 0, 1);
      bag.params.open = progress;
      bag.params.knot = Math.max(0, 1 - progress * 1.6);
      bag.dirty = true;
      // 流出はプレイヤーの開く速さに応じる
      flowOut = clamp(flowOut + add * 1.6, 0, 1.4);
      if (progress > 0.2) c.audio.tear();
      if (progress >= 1 && revealT < 0) {
        revealT = 0;
        c.audio.voice('トロ〜ッ');
      }
    },
    up() { active = false; },
    update(c, dt) {
      const bag = c.world.bag;
      const g = c.world.guideLine;
      const mouth = bag.group.position.clone().add(new THREE.Vector3(0, 0.42 - progress * 0.1, 0));
      g.position.copy(mouth).add(new THREE.Vector3(0, 0.08, 0));
      g.visible = progress < 0.95;
      // 職人の両手が口の両側をつまみ、進行に応じて引き開く
      const spread = 0.16 + progress * 0.22;
      c.stage.chef.setHands(
        mouth.clone().add(new THREE.Vector3(-spread, 0.1, -0.05)),
        mouth.clone().add(new THREE.Vector3(spread, 0.1, -0.05)),
      );
      c.stage.chef.look(bag.group.position);
      // 低い接写へ (開き始めたらゆっくり寄る、カットしない)
      if (!camMoved && progress > 0.15) {
        camMoved = true;
        c.cam.setShot({
          pos: new THREE.Vector3(0.72, 0.85, 1.9),
          look: new THREE.Vector3(0.7, 0.28, 0.88),
          fov: 40,
        });
      }
      // 中身の流出 (開いている間はトロトロと流れ続ける)
      flowOut = Math.max(0, flowOut - dt * 0.3);
      const flowing = progress > 0.25 ? clamp(flowOut, 0.3, 1) : 0;
      c.stage.creamStream.level = damp(c.stage.creamStream.level, flowing, 6, dt);
      c.stage.creamStream.from.copy(bag.group.position).add(new THREE.Vector3(0.19, 0.33, 0.22));
      c.stage.creamStream.to.copy(pool ? pool.position : bag.group.position).setY(0.05);
      c.audio.setChannel('flow', flowing * 0.8);
      if (pool && flowing > 0) {
        const s = Math.min(0.3, pool.scale.x + dt * 0.07 * flowing);
        pool.scale.set(s, s * 0.28, s * 0.8);
      }
      if (revealT >= 0) {
        revealT += dt;
        if (revealT > 1.6) {
          // 少し引いて完成を見せる
          c.cam.setShot({
            pos: new THREE.Vector3(0.5, 1.0, 2.3),
            look: new THREE.Vector3(0.68, 0.2, 0.8),
            fov: 42,
          });
          c.audio.voice('できあがり！ いただきます');
          c.complete(bag.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)));
          revealT = -1;
        }
      }
    },
    hint(c) {
      const g = c.world.guideLine.position;
      return {
        path: [
          g.clone().add(new THREE.Vector3(-0.25, 0, 0)),
          g.clone().add(new THREE.Vector3(0.25, 0, 0)),
        ],
        dur: 1.3,
      };
    },
    marker(c) {
      if (progress >= 0.95) return null;
      return { pos: c.world.guideLine.position.clone().add(new THREE.Vector3(-0.22, 0, 0)), r: 0.12 };
    },
  };
}

/** Module 13: 再プレイ — 絵で選ぶ */
export function replayModule(): Mod {
  return {
    name: 'replay',
    enter(c) {
      c.cam.setShot({
        pos: new THREE.Vector3(0.2, 1.3, 3.0),
        look: new THREE.Vector3(0.4, 0.35, 0.3),
        fov: 44,
      });
      c.save.finishedOnce = true;
      saveSave(c.save);
      c.ui.showReplay(choice => {
        if (choice === 'restart') c.goto(0);
        else if (choice === 'stretch') c.goto(3);
        else c.goto(7);
      });
      c.stage.chef.look(new THREE.Vector3(0, 0.6, 3));
    },
    exit(c) {
      c.ui.hideReplay();
    },
    update(c, dt) {
      // 職人が皿を紹介
      c.stage.chef.setHands(
        null,
        POS.plate.clone().add(new THREE.Vector3(-0.2, 0.5, -0.2)),
      );
      if (Math.random() < dt * 0.5 && !c.stage.reduceMotion) {
        c.stage.sparkle.spawn(
          POS.plate.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.3, (Math.random() - 0.5) * 0.5)),
          new THREE.Vector3(0, 0.3, 0), 1.2, 0.06, 0.01, 0.3,
        );
      }
    },
    hint: () => null,
  };
}
