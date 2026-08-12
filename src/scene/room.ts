import * as THREE from 'three';
import type { ShelfTheme, WeatherKind } from '../game/types.ts';
import { FLOOR_Y, ROOM_HALF_DEPTH, ROOM_HALF_WIDTH, WALL_HEIGHT } from './constants.ts';
import { roundedBoxGeometry, woodBlockGeometry } from './geometry.ts';
import { createFabricWeaveTexture, createWoodGrainTexture } from './materials/textures.ts';
import { PALETTE } from './palette.ts';

export interface RoomHandles {
  group: THREE.Group;
  windowGlass: THREE.Mesh;
  windowGlassMaterial: THREE.MeshPhysicalMaterial;
  floorMaterial: THREE.MeshStandardMaterial;
  wallBackMaterial: THREE.MeshStandardMaterial;
  wallSideMaterial: THREE.MeshStandardMaterial;
  rainGroup: THREE.Group;
  cloudGroup: THREE.Group;
  setWeather: (weather: WeatherKind) => void;
}

function buildShelfDecor(theme: ShelfTheme): THREE.Group {
  const group = new THREE.Group();
  const colors =
    theme === 'blocks'
      ? [PALETTE.coral, PALETTE.mint, PALETTE.sky, PALETTE.butter]
      : theme === 'plants'
        ? [0x6fae6a, 0x8fd6c0, 0x4f8a52]
        : [PALETTE.coral, PALETTE.sky, PALETTE.butter, PALETTE.woodDark];

  if (theme === 'blocks') {
    for (let i = 0; i < 4; i++) {
      const geo = woodBlockGeometry(0.09);
      const mat = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.6 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(-0.18 + i * 0.12, 0.045, 0);
      group.add(mesh);
    }
  } else if (theme === 'plants') {
    for (let i = 0; i < 2; i++) {
      const potGeo = roundedBoxGeometry({ width: 0.12, height: 0.1, depth: 0.12, cornerRadius: 0.02 });
      const potMat = new THREE.MeshStandardMaterial({ color: PALETTE.woodDark, roughness: 0.7 });
      const pot = new THREE.Mesh(potGeo, potMat);
      pot.position.set(-0.15 + i * 0.3, 0.05, 0);
      group.add(pot);
      const leafMat = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.7 });
      for (let l = 0; l < 3; l++) {
        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.14, 6), leafMat);
        leaf.position.set(pot.position.x + Math.cos((l / 3) * Math.PI * 2) * 0.02, 0.16, pot.position.z + Math.sin((l / 3) * Math.PI * 2) * 0.02);
        leaf.rotation.z = Math.cos((l / 3) * Math.PI * 2) * 0.25;
        group.add(leaf);
      }
    }
  } else {
    for (let i = 0; i < 5; i++) {
      const geo = roundedBoxGeometry({ width: 0.03, height: 0.14, depth: 0.1, cornerRadius: 0.006 });
      const mat = new THREE.MeshStandardMaterial({ color: colors[i % colors.length], roughness: 0.65 });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(-0.2 + i * 0.045, 0.07, 0);
      mesh.rotation.z = (Math.random() - 0.5) * 0.05;
      group.add(mesh);
    }
  }
  return group;
}

export function buildRoom(shelfTheme: ShelfTheme): RoomHandles {
  const group = new THREE.Group();
  group.name = 'room';

  const woodTex = createWoodGrainTexture(PALETTE.woodLight, 512, 11);
  const floorTex = createWoodGrainTexture(PALETTE.floor, 512, 22);
  floorTex.repeat.set(3, 3);
  const fabricTex = createFabricWeaveTexture(PALETTE.cream, 256, 3);
  void fabricTex;

  // Floor slab.
  const floorMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, map: floorTex, roughness: 0.85, metalness: 0 });
  const floorGeo = roundedBoxGeometry({
    width: ROOM_HALF_WIDTH * 2,
    height: 0.06,
    depth: ROOM_HALF_DEPTH * 2,
    cornerRadius: 0.02,
    bevelSize: 0.015,
  });
  const floor = new THREE.Mesh(floorGeo, floorMaterial);
  floor.position.y = FLOOR_Y - 0.03;
  floor.receiveShadow = false;
  group.add(floor);

  // Back wall.
  const wallBackMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.wallBack, roughness: 0.95 });
  const wallBack = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_HALF_WIDTH * 2, WALL_HEIGHT), wallBackMaterial);
  wallBack.position.set(0, WALL_HEIGHT / 2, -ROOM_HALF_DEPTH);
  group.add(wallBack);

  // Side wall (left).
  const wallSideMaterial = new THREE.MeshStandardMaterial({ color: PALETTE.wallSide, roughness: 0.95 });
  const wallSide = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_HALF_DEPTH * 2, WALL_HEIGHT), wallSideMaterial);
  wallSide.position.set(-ROOM_HALF_WIDTH, WALL_HEIGHT / 2, 0);
  wallSide.rotation.y = Math.PI / 2;
  group.add(wallSide);

  // Window (on the back wall), frame + glass.
  const windowW = 0.95;
  const windowH = 0.85;
  const windowY = 1.15;
  const frameMat = new THREE.MeshStandardMaterial({ color: PALETTE.windowFrame, map: woodTex, roughness: 0.7 });
  const frameGeo = roundedBoxGeometry({ width: windowW + 0.12, height: windowH + 0.12, depth: 0.06, cornerRadius: 0.03, bevelSize: 0.012 });
  const frame = new THREE.Mesh(frameGeo, frameMat);
  frame.position.set(0.55, windowY, -ROOM_HALF_DEPTH + 0.02);
  group.add(frame);

  // Window cross-mullions for a cozy nursery look.
  const mullionMat = frameMat;
  const mullionV = new THREE.Mesh(roundedBoxGeometry({ width: 0.03, height: windowH, depth: 0.05, cornerRadius: 0.01 }), mullionMat);
  mullionV.position.copy(frame.position);
  mullionV.position.z += 0.02;
  group.add(mullionV);
  const mullionH = new THREE.Mesh(roundedBoxGeometry({ width: windowW, height: 0.03, depth: 0.05, cornerRadius: 0.01 }), mullionMat);
  mullionH.position.copy(frame.position);
  mullionH.position.z += 0.02;
  group.add(mullionH);

  const windowGlassMaterial = new THREE.MeshPhysicalMaterial({
    color: PALETTE.window,
    transparent: true,
    opacity: 0.55,
    roughness: 0.15,
    metalness: 0,
    transmission: 0.25,
    side: THREE.DoubleSide,
  });
  const windowGlass = new THREE.Mesh(new THREE.PlaneGeometry(windowW, windowH), windowGlassMaterial);
  windowGlass.position.copy(frame.position);
  windowGlass.position.z += 0.005;
  group.add(windowGlass);

  // Weather decoration groups (rain streaks / cloud puffs), toggled by setWeather.
  const rainGroup = new THREE.Group();
  rainGroup.visible = false;
  const rainMat = new THREE.MeshBasicMaterial({ color: 0xbfe0f2, transparent: true, opacity: 0.55 });
  for (let i = 0; i < 10; i++) {
    const drop = new THREE.Mesh(new THREE.PlaneGeometry(0.006, 0.05), rainMat);
    drop.position.set(frame.position.x - windowW / 2 + Math.random() * windowW, windowY - windowH / 2 + Math.random() * windowH, frame.position.z + 0.01);
    drop.rotation.z = 0.25;
    rainGroup.add(drop);
  }
  group.add(rainGroup);

  const cloudGroup = new THREE.Group();
  cloudGroup.visible = false;
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 });
  for (let i = 0; i < 3; i++) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(0.06 + Math.random() * 0.02, 8, 8), cloudMat);
    puff.position.set(frame.position.x - 0.2 + i * 0.18, windowY + 0.15, frame.position.z + 0.01);
    cloudGroup.add(puff);
  }
  group.add(cloudGroup);

  function setWeather(weather: WeatherKind): void {
    rainGroup.visible = weather === 'lightRain';
    cloudGroup.visible = weather === 'clouds';
  }

  // Shelf against the side wall.
  const shelfMat = new THREE.MeshStandardMaterial({ color: PALETTE.woodDark, map: woodTex, roughness: 0.6 });
  const shelfGeo = roundedBoxGeometry({ width: 0.55, height: 0.04, depth: 0.22, cornerRadius: 0.015, bevelSize: 0.01 });
  const shelf = new THREE.Mesh(shelfGeo, shelfMat);
  shelf.position.set(-ROOM_HALF_WIDTH + 0.13, 0.95, -0.7);
  shelf.rotation.y = Math.PI / 2;
  group.add(shelf);
  const shelfSupportGeo = roundedBoxGeometry({ width: 0.04, height: 0.9, depth: 0.04, cornerRadius: 0.015 });
  const supportA = new THREE.Mesh(shelfSupportGeo, shelfMat);
  supportA.position.set(-ROOM_HALF_WIDTH + 0.13, 0.48, -0.58);
  group.add(supportA);
  const supportB = supportA.clone();
  supportB.position.z = -0.82;
  group.add(supportB);

  const decor = buildShelfDecor(shelfTheme);
  decor.position.set(shelf.position.x, shelf.position.y + 0.02, shelf.position.z);
  decor.rotation.y = shelf.rotation.y;
  group.add(decor);

  return { group, windowGlass, windowGlassMaterial, floorMaterial, wallBackMaterial, wallSideMaterial, rainGroup, cloudGroup, setWeather };
}
