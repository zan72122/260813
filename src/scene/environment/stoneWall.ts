// 珊瑚石灰岩の石垣。不揃いなブロックを積み、目地に頂点色AO。stone-gapスポット近くに餌が収まる隙間を1つ明示。
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { getSpot } from "../../game/spots";
import { makeIrregularBlock, seededRandom, standardMaterial } from "./proc";

const WALL_COLOR = new THREE.Color("#d9cfc0");
const WALL_WIDTH = 5.2;
const WALL_HEIGHT = 1.7;
const WALL_DEPTH = 0.9;

export interface StoneWall {
  readonly group: THREE.Group;
  /** 餌がぴったり収まる隙間のワールド座標(anchor)。gate.tsのgapPositionと同様の使い方。 */
  readonly gapPosition: THREE.Vector3;
}

export function createStoneWall(): StoneWall {
  const spot = getSpot("stone-gap");
  const anchor = new THREE.Vector3(spot.position.x, spot.position.y, spot.position.z);

  const group = new THREE.Group();
  group.name = "stone-wall";
  const rng = seededRandom(3131);

  const geoms: THREE.BufferGeometry[] = [];
  const rows = 5;
  const gapRow = 1; // 隙間はやや低め(ゾウの鼻/手が届く高さ)
  const gapColStart = 3;
  const gapColSpan = 2;
  let y = 0;
  for (let row = 0; row < rows; row++) {
    const blockH = WALL_HEIGHT / rows;
    let x = -WALL_WIDTH / 2;
    let col = 0;
    while (x < WALL_WIDTH / 2 - 0.1) {
      const w = 0.55 + rng() * 0.5;
      const isGap = row === gapRow && col >= gapColStart && col < gapColStart + gapColSpan;
      if (!isGap) {
        const d = WALL_DEPTH * (0.85 + rng() * 0.3);
        const h = blockH * (0.82 + rng() * 0.3);
        const size = new THREE.Vector3(w, h, d);
        const block = makeIrregularBlock(size, WALL_COLOR, rng, { aoStrength: 0.42, hueJitter: 0.14 });
        block.rotateY((rng() - 0.5) * 0.12);
        block.translate(x + w / 2 + (rng() - 0.5) * 0.05, y + h / 2, (rng() - 0.5) * 0.08);
        geoms.push(block);
      }
      x += w + 0.04;
      col++;
    }
    y += blockH;
  }

  const merged = mergeGeometries(geoms, false) as THREE.BufferGeometry;
  geoms.forEach((g) => g.dispose());
  const mesh = new THREE.Mesh(merged, standardMaterial({ color: 0xffffff, roughness: 0.98 }));
  mesh.name = "stone-wall-blocks";
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  // 隙間の位置(ワールド座標): gapRow中央、壁ローカルX基準をワールドへ変換。
  const gapLocalX = -WALL_WIDTH / 2 + (gapColStart + gapColSpan / 2) * 0.85;
  const gapLocalY = gapRow * (WALL_HEIGHT / rows) + WALL_HEIGHT / rows / 2;

  group.position.set(anchor.x - gapLocalX, 0, anchor.z);
  group.rotation.y = 0;

  const gapPosition = new THREE.Vector3(anchor.x, gapLocalY, anchor.z);

  return { group, gapPosition };
}
