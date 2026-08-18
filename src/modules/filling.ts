import * as THREE from 'three';
import { Ctx, Mod, POS } from '../game';
import { clamp, damp } from '../util';
import { nearScreen } from './helpers';
import { Flight } from '../cheese';

/** Module 6: stracciatella — 裂く、注ぐ、混ぜる */
export function stracModule(): Mod {
  let stage: 'tear' | 'cream' | 'stir' = 'tear';
  let tears = 0;
  let tearAcc = 0;
  let tearActive = false;
  let creamHold = false;
  let stirBase = 0;
  let flight: Flight | null = null;
  const stripPos = new THREE.Vector3(-1.15, 0.66, 0.12);
  const pitcherLip = new THREE.Vector3();

  return {
    name: 'strac',
    enter(c) {
      stage = 'tear'; tears = 0; tearAcc = 0; creamHold = false;
      c.cam.setShot({
        pos: new THREE.Vector3(-1.05, 1.15, 1.65),
        look: new THREE.Vector3(-1.1, 0.35, 0.05),
        fov: 42,
      });
      c.audio.voice('ほそく さいて みよう');
      const strip = c.world.strip;
      strip.visible = true;
      strip.position.copy(stripPos);
      strip.scale.set(1, 1, 1);
      c.world.sideRibbons.clear();
      c.world.setSideCream(0);
      if (!flight) {
        const rib = new THREE.Mesh(
          new THREE.CapsuleGeometry(0.03, 0.22, 4, 8),
          c.stage.mats.mozz,
        );
        c.stage.scene.add(rib);
        flight = new Flight(rib);
      }
      c.audio.startChannel('cream');
    },
    exit(c) {
      c.world.strip.visible = false;
      c.audio.stopChannel('cream');
      c.stage.creamStream.level = 0;
      if (flight) flight.mesh.visible = false;
    },
    down(c, p) {
      if (stage === 'tear') {
        tearActive = nearScreen(c, stripPos, 160);
        tearAcc = 0;
      } else if (stage === 'cream') {
        const knob = c.stage.props.pitcher.getObjectByName('creamKnob')!;
        const w = new THREE.Vector3();
        knob.getWorldPosition(w);
        creamHold = nearScreen(c, w, 170) || nearScreen(c, c.stage.props.pitcher.position, 170);
      } else {
        stirBase = p.winding;
      }
    },
    move(c, p) {
      if (stage === 'tear' && tearActive && !flight!.active) {
        tearAcc += Math.max(0, p.dy); // 下方向
        if (tearAcc > window.innerHeight * 0.12) {
          tearAcc = 0;
          tears++;
          c.audio.tear();
          const strip = c.world.strip;
          strip.scale.setY(1 - tears * 0.22);
          strip.position.y = stripPos.y - tears * 0.03;
          // リボンがボウルへ落ちる
          const target = POS.sideBowl.clone().add(new THREE.Vector3(0, 0.2, 0));
          flight!.start(strip.position.clone().add(new THREE.Vector3(0.05, -0.25, 0.05)), target, 0.45, 0.12);
          const seed = tears * 17 + 2;
          flight!.onDone = () => {
            c.world.addSideRibbon(seed);
            c.audio.plop(1.3);
          };
          if (tears >= 3) {
            stage = 'cream';
            c.world.strip.visible = false;
            c.audio.voice('クリームを いれよう');
            // ピッチャーを近くへ
            c.stage.props.pitcher.position.set(-1.5, 0, 0.05);
          }
        }
      }
    },
    up(c, p) {
      tearActive = false;
      creamHold = false;
      if (stage === 'stir') {
        if (Math.abs(p.winding - stirBase) > Math.PI * 1.6) {
          c.audio.voice('まざったね');
          c.complete(POS.sideBowl.clone().add(new THREE.Vector3(0, 0.3, 0)));
        }
      }
    },
    update(c, dt) {
      flight?.update(dt);
      const chef = c.stage.chef;
      if (stage === 'tear') {
        chef.setHands(null, stripPos.clone().add(new THREE.Vector3(0, 0.38, 0)));
        chef.look(stripPos);
      } else if (stage === 'cream') {
        const pitcher = c.stage.props.pitcher;
        pitcherLip.set(-0.16, 0.46, 0);
        pitcher.localToWorld(pitcherLip);
        const pouring = creamHold && c.input.p.down;
        pitcher.rotation.z = damp(pitcher.rotation.z, pouring ? 0.7 : 0, 7, dt);
        chef.setHands(pitcher.position.clone().add(new THREE.Vector3(0, 0.55, 0)), null);
        chef.look(POS.sideBowl);
        c.stage.creamStream.level = damp(c.stage.creamStream.level, pouring ? 0.9 : 0, 8, dt);
        c.stage.creamStream.from.copy(pitcherLip);
        c.stage.creamStream.to.copy(POS.sideBowl.clone().add(new THREE.Vector3(0, 0.16, 0)));
        c.audio.setChannel('cream', pouring ? 0.8 : 0);
        if (pouring) {
          c.world.setSideCream(c.world.sideCreamLevel + dt / 2.0);
          if (c.world.sideCreamLevel >= 0.8) {
            stage = 'stir';
            c.stage.creamStream.level = 0;
            c.audio.setChannel('cream', 0);
            c.audio.voice('おおきく まぜまぜ しよう');
          }
        }
      } else {
        // stir
        chef.setHands(null, null);
        chef.look(POS.sideBowl);
        const p = c.input.p;
        if (p.down) {
          const w = p.winding - stirBase;
          c.world.sideRibbons.rotation.y = w * 0.55;
          c.world.stirSpin = w;
          c.audio.setChannel('cream', clamp(Math.abs(p.vx) / 1500, 0, 0.5));
          if (Math.abs(w) > Math.PI * 2.2) {
            c.audio.voice('まざったね');
            c.complete(POS.sideBowl.clone().add(new THREE.Vector3(0, 0.3, 0)));
          }
        } else {
          c.audio.setChannel('cream', 0);
        }
      }
    },
    hint(c) {
      if (stage === 'tear') {
        return {
          path: [
            stripPos.clone().add(new THREE.Vector3(0, 0.25, 0)),
            stripPos.clone().add(new THREE.Vector3(0.02, -0.35, 0)),
          ],
          dur: 1.3,
        };
      }
      if (stage === 'cream') {
        const knob = c.stage.props.pitcher.getObjectByName('creamKnob')!;
        const w = new THREE.Vector3();
        knob.getWorldPosition(w);
        return { path: [w], hold: true, dur: 1.6 };
      }
      return { path: [POS.sideBowl.clone().add(new THREE.Vector3(0, 0.25, 0))], circle: true, dur: 2.0 };
    },
  };
}

/** Module 7: 袋へ詰める — スプーンで運ぶ + クリーム */
export function fillModule(): Mod {
  let stage: 'scoop' | 'cream' = 'scoop';
  let hasScoop = false;
  let scoops = 0;
  let creamT = 0;
  let creamHold = false;
  let flight: Flight | null = null;
  const spoonTarget = new THREE.Vector3();
  const pitcherLip = new THREE.Vector3();

  return {
    name: 'fill',
    enter(c) {
      stage = 'scoop'; hasScoop = false; scoops = 0; creamT = 0;
      c.craft.fillScoops = 0; c.craft.creamAmount = 0;
      c.cam.setShot({
        pos: new THREE.Vector3(-0.4, 1.5, 2.65),
        look: new THREE.Vector3(-0.55, 0.12, 0.3),
        fov: 47,
      });
      c.audio.voice('トロトロを ふくろへ いれよう');
      const spoon = c.stage.props.spoon;
      spoon.visible = true;
      spoon.position.set(-0.6, 0.35, 0.4);
      spoonTarget.copy(spoon.position);
      c.stage.props.pitcher.position.copy(POS.pitcherWork);
      if (!flight) {
        const blob = new THREE.Mesh(new THREE.SphereGeometry(0.085, 14, 10), c.stage.mats.cream);
        c.stage.scene.add(blob);
        flight = new Flight(blob);
      }
      c.audio.startChannel('cream');
    },
    exit(c) {
      c.stage.props.spoon.visible = false;
      c.audio.stopChannel('cream');
      c.stage.creamStream.level = 0;
      if (flight) flight.mesh.visible = false;
    },
    down(c, p) {
      if (stage === 'cream') {
        const knob = c.stage.props.pitcher.getObjectByName('creamKnob')!;
        const w = new THREE.Vector3();
        knob.getWorldPosition(w);
        creamHold = nearScreen(c, w, 180) || nearScreen(c, c.stage.props.pitcher.position, 180);
      }
    },
    move(c, p) {
      if (stage !== 'scoop' || !p.down) return;
      const hit = c.input.planeHit(c.stage.camera, 0.3);
      hit.x = clamp(hit.x, -1.6, 1.0);
      hit.z = clamp(hit.z, -0.4, 1.1);
      hit.y = 0.32;
      spoonTarget.copy(hit);
      const spoon = c.stage.props.spoon;
      // すくう
      const dBowl = Math.hypot(hit.x - POS.sideBowl.x, hit.z - POS.sideBowl.z);
      if (!hasScoop && dBowl < 0.5 && !flight!.active) {
        hasScoop = true;
        (spoon.getObjectByName('scoopBlob') as THREE.Mesh).visible = true;
        c.audio.squish(1.1);
      }
      // 袋の上で自動的に注ぐ (magnetic)
      const bagPos = c.world.bag.group.position;
      const dBag = Math.hypot(hit.x - bagPos.x, hit.z - bagPos.z);
      if (hasScoop && dBag < 0.42 && !flight!.active) {
        this_drop(c);
      }
    },
    up(c, p) {
      creamHold = false;
      // 袋の近くで離したら磁力で入る
      if (stage === 'scoop' && hasScoop && !flight!.active) {
        const bagPos = c.world.bag.group.position;
        const spoon = c.stage.props.spoon;
        const d = Math.hypot(spoon.position.x - bagPos.x, spoon.position.z - bagPos.z);
        if (d < 0.75) this_drop(c);
      }
    },
    update(c, dt) {
      flight?.update(dt);
      const spoon = c.stage.props.spoon;
      spoon.position.x = damp(spoon.position.x, spoonTarget.x, 10, dt);
      spoon.position.y = damp(spoon.position.y, spoonTarget.y, 10, dt);
      spoon.position.z = damp(spoon.position.z, spoonTarget.z, 10, dt);
      const chef = c.stage.chef;
      if (stage === 'scoop') {
        chef.setHands(null, spoon.position.clone().add(new THREE.Vector3(0.08, 0.3, 0.1)));
        chef.look(c.world.bag.group.position);
      } else {
        // cream
        const pitcher = c.stage.props.pitcher;
        pitcherLip.set(-0.16, 0.46, 0);
        pitcher.localToWorld(pitcherLip);
        const pouring = creamHold && c.input.p.down;
        pitcher.rotation.z = damp(pitcher.rotation.z, pouring ? 0.65 : 0, 7, dt);
        chef.setHands(pitcher.position.clone().add(new THREE.Vector3(0, 0.55, 0)), null);
        chef.look(c.world.bag.group.position);
        const bagMouth = c.world.bag.group.position.clone().add(new THREE.Vector3(0, 0.4, 0));
        c.stage.creamStream.level = damp(c.stage.creamStream.level, pouring ? 0.85 : 0, 8, dt);
        c.stage.creamStream.from.copy(pitcherLip);
        c.stage.creamStream.to.copy(bagMouth.clone().setY(0.25));
        c.audio.setChannel('cream', pouring ? 0.8 : 0);
        if (pouring) {
          creamT += dt;
          const bag = c.world.bag;
          // 入れすぎても失敗しない: 徐々に弱まる
          bag.fill = clamp(bag.fill + dt * 0.12 * (1 - bag.fill * 0.7), 0, 1);
          bag.params.bulge = 0.3 + bag.fill * 0.35;
          bag.wobbleAnim = Math.min(0.5, bag.wobbleAnim + dt);
          bag.dirty = true;
          c.craft.creamAmount = Math.min(1, creamT / 1.5);
          if (creamT >= 1.4) {
            c.audio.voice('ぷっくり してきたね');
            c.complete(c.world.bag.group.position.clone().add(new THREE.Vector3(0, 0.3, 0)));
          }
        }
      }
    },
    hint(c) {
      if (stage === 'scoop') {
        return {
          path: [
            POS.sideBowl.clone().add(new THREE.Vector3(0, 0.3, 0)),
            c.world.bag.group.position.clone().add(new THREE.Vector3(0, 0.35, 0)),
          ],
          dur: 1.8,
        };
      }
      const knob = c.stage.props.pitcher.getObjectByName('creamKnob')!;
      const w = new THREE.Vector3();
      knob.getWorldPosition(w);
      return { path: [w], hold: true, dur: 1.6 };
    },
  };

  /** スプーンから袋へ注ぐ */
  function this_drop(c: Ctx) {
    hasScoop = false;
    const spoon = c.stage.props.spoon;
    (spoon.getObjectByName('scoopBlob') as THREE.Mesh).visible = false;
    const bag = c.world.bag;
    const mouth = bag.group.position.clone().add(new THREE.Vector3(0, 0.35, 0));
    flight!.start(spoon.position.clone(), mouth, 0.4, 0.18);
    flight!.onDone = () => {
      scoops++;
      c.craft.fillScoops = scoops;
      c.audio.plop(1);
      bag.fill = clamp(bag.fill + 0.17 * (1 - bag.fill * 0.5), 0, 1);
      bag.params.bulge = 0.3 + bag.fill * 0.35;
      bag.wobbleAnim = 1;
      bag.dirty = true;
      if (scoops <= 3) c.world.addInnerRibbon(scoops * 11 + 4);
      if (scoops >= 4 && stage === 'scoop') {
        stage = 'cream';
        c.audio.voice('さいごに クリームを すこし');
      }
    };
  }
}
