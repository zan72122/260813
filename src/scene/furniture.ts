import * as THREE from 'three';
import { mergeGeometries, roundedBoxGeometry, roundedPlankGeometry } from './geometry.ts';
import { createWoodGrainTexture } from './materials/textures.ts';
import { PALETTE } from './palette.ts';
import { Easing, TweenManager } from './tween.ts';

export const TABLE_STORED = new THREE.Vector3(0.35, 0, -1.28);
export const TABLE_OUT = new THREE.Vector3(0.15, 0, -0.1);
export const CART_STORED = new THREE.Vector3(1.35, 0, -1.28);
export const CART_OUT = new THREE.Vector3(0.85, 0, -0.05);
export const CHAIR_STACK_POS = new THREE.Vector3(-1.55, 0, -0.55);

export const SEAT_OFFSETS: THREE.Vector3[] = [
  new THREE.Vector3(-0.34, 0, 0.36),
  new THREE.Vector3(0.34, 0, 0.36),
  new THREE.Vector3(-0.34, 0, -0.36),
  new THREE.Vector3(0.34, 0, -0.36),
];

const CHAIR_COLORS = [PALETTE.coral, PALETTE.mint, PALETTE.sky, PALETTE.butter];

function buildChairGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const seat = roundedBoxGeometry({ width: 0.22, height: 0.03, depth: 0.22, cornerRadius: 0.03, bevelSize: 0.01 });
  seat.translate(0, 0.22, 0);
  parts.push(seat);
  const back = roundedBoxGeometry({ width: 0.22, height: 0.22, depth: 0.03, cornerRadius: 0.04, bevelSize: 0.01 });
  back.translate(0, 0.33, -0.095);
  parts.push(back);
  const legPositions: [number, number][] = [
    [-0.09, -0.09],
    [0.09, -0.09],
    [-0.09, 0.09],
    [0.09, 0.09],
  ];
  for (const [x, z] of legPositions) {
    const leg = roundedBoxGeometry({ width: 0.025, height: 0.22, depth: 0.025, cornerRadius: 0.008 });
    leg.translate(x, 0.11, z);
    parts.push(leg);
  }
  return mergeGeometries(parts);
}

function buildCartGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const body = roundedBoxGeometry({ width: 0.32, height: 0.28, depth: 0.22, cornerRadius: 0.02, bevelSize: 0.012 });
  body.translate(0, 0.28, 0);
  parts.push(body);
  const shelf = roundedBoxGeometry({ width: 0.3, height: 0.02, depth: 0.2, cornerRadius: 0.01 });
  shelf.translate(0, 0.16, 0);
  parts.push(shelf);
  const handle = roundedBoxGeometry({ width: 0.28, height: 0.02, depth: 0.02, cornerRadius: 0.008 });
  handle.translate(0, 0.44, -0.11);
  parts.push(handle);
  const wheelPositions: [number, number][] = [
    [-0.13, -0.08],
    [0.13, -0.08],
    [-0.13, 0.08],
    [0.13, 0.08],
  ];
  for (const [x, z] of wheelPositions) {
    const wheel = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10);
    wheel.rotateZ(Math.PI / 2);
    wheel.translate(x, 0.03, z);
    parts.push(wheel);
  }
  return mergeGeometries(parts);
}

export interface FurnitureHandles {
  group: THREE.Group;
  table: THREE.Mesh;
  tableProxy: THREE.Mesh;
  cart: THREE.Mesh;
  cartProxy: THREE.Mesh;
  chairStackProxy: THREE.Mesh;
  chairs: THREE.InstancedMesh;
  trays: THREE.InstancedMesh;
  setTableProgress: (t: number) => void;
  animateTableTo: (target: number, duration: number, onDone?: () => void) => void;
  setCartProgress: (t: number) => void;
  animateCartTo: (target: number, duration: number, onDone?: () => void) => void;
  popChair: (index: number, onDone?: () => void) => void;
  stackChair: (index: number, onDone?: () => void) => void;
  placeTray: (index: number, onDone?: () => void) => void;
  returnTray: (index: number, worldX: number, worldZ: number) => void;
  trayHomePosition: (index: number) => THREE.Vector3;
  seatWorldPosition: (index: number) => THREE.Vector3;
}

export function buildFurniture(tweens: TweenManager): FurnitureHandles {
  const group = new THREE.Group();
  const woodTex = createWoodGrainTexture(PALETTE.woodLight, 512, 55);

  // Table.
  const tableMat = new THREE.MeshStandardMaterial({ color: PALETTE.woodLight, map: woodTex, roughness: 0.55 });
  const tableParts: THREE.BufferGeometry[] = [];
  const top = roundedPlankGeometry(0.85, 0.045, 0.6, 0.05);
  top.translate(0, 0.42, 0);
  tableParts.push(top);
  const legPositions: [number, number][] = [
    [-0.37, -0.25],
    [0.37, -0.25],
    [-0.37, 0.25],
    [0.37, 0.25],
  ];
  for (const [x, z] of legPositions) {
    const leg = roundedBoxGeometry({ width: 0.05, height: 0.4, depth: 0.05, cornerRadius: 0.015 });
    leg.translate(x, 0.2, z);
    tableParts.push(leg);
  }
  const tableGeo = mergeGeometries(tableParts);
  const table = new THREE.Mesh(tableGeo, tableMat);
  table.position.copy(TABLE_STORED);
  group.add(table);

  const tableProxy = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), new THREE.MeshBasicMaterial());
  tableProxy.visible = false;
  tableProxy.position.copy(TABLE_STORED);
  tableProxy.position.y = 0.3;
  group.add(tableProxy);

  // Tray cart.
  const cartMat = new THREE.MeshStandardMaterial({ color: PALETTE.woodDark, map: woodTex, roughness: 0.6 });
  const cart = new THREE.Mesh(buildCartGeometry(), cartMat);
  cart.position.copy(CART_STORED);
  group.add(cart);
  const cartProxy = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshBasicMaterial());
  cartProxy.visible = false;
  cartProxy.position.copy(CART_STORED);
  cartProxy.position.y = 0.4;
  group.add(cartProxy);

  // Chairs (instanced, 4).
  const chairGeo = buildChairGeometry();
  const chairMat = new THREE.MeshStandardMaterial({ roughness: 0.6, vertexColors: false });
  const chairs = new THREE.InstancedMesh(chairGeo, chairMat, 4);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 4; i++) {
    const pos = CHAIR_STACK_POS.clone();
    pos.y = i * 0.26;
    m.compose(pos, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0)), new THREE.Vector3(1, 1, 1));
    chairs.setMatrixAt(i, m);
    chairs.setColorAt(i, new THREE.Color(CHAIR_COLORS[i % CHAIR_COLORS.length]));
  }
  chairs.instanceMatrix.needsUpdate = true;
  if (chairs.instanceColor) chairs.instanceColor.needsUpdate = true;
  group.add(chairs);

  const chairStackProxy = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), new THREE.MeshBasicMaterial());
  chairStackProxy.visible = false;
  chairStackProxy.position.copy(CHAIR_STACK_POS);
  chairStackProxy.position.y = 0.5;
  group.add(chairStackProxy);

  // Trays (instanced, 4) — placemat + bowl + spoon merged.
  const trayParts: THREE.BufferGeometry[] = [];
  const mat = roundedBoxGeometry({ width: 0.18, height: 0.01, depth: 0.14, cornerRadius: 0.02 });
  trayParts.push(mat);
  const bowl = new THREE.CylinderGeometry(0.035, 0.028, 0.025, 12);
  bowl.translate(0, 0.02, 0);
  trayParts.push(bowl);
  const trayGeo = mergeGeometries(trayParts);
  const trayMat = new THREE.MeshStandardMaterial({ color: PALETTE.cream, roughness: 0.5 });
  const trays = new THREE.InstancedMesh(trayGeo, trayMat, 4);
  for (let i = 0; i < 4; i++) {
    const pos = CART_STORED.clone();
    pos.y = 0.32 + i * 0.001;
    m.compose(pos, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
    trays.setMatrixAt(i, m);
    trays.setColorAt(i, new THREE.Color(CHAIR_COLORS[i % CHAIR_COLORS.length]).lerp(new THREE.Color(0xffffff), 0.5));
  }
  trays.instanceMatrix.needsUpdate = true;
  if (trays.instanceColor) trays.instanceColor.needsUpdate = true;
  group.add(trays);

  function setTableProgress(t: number): void {
    table.position.lerpVectors(TABLE_STORED, TABLE_OUT, t);
    tableProxy.position.x = table.position.x;
    tableProxy.position.z = table.position.z;
  }

  function animateTableTo(target: number, duration: number, onDone?: () => void): void {
    const startPos = table.position.clone();
    const targetPos = TABLE_STORED.clone().lerp(TABLE_OUT, target);
    tweens.add(
      duration,
      Easing.cubicInOut,
      (p) => {
        table.position.lerpVectors(startPos, targetPos, p);
        tableProxy.position.x = table.position.x;
        tableProxy.position.z = table.position.z;
      },
      onDone,
    );
  }

  function setCartProgress(t: number): void {
    cart.position.lerpVectors(CART_STORED, CART_OUT, t);
    cartProxy.position.x = cart.position.x;
    cartProxy.position.z = cart.position.z;
  }

  function animateCartTo(target: number, duration: number, onDone?: () => void): void {
    const startPos = cart.position.clone();
    const targetPos = CART_STORED.clone().lerp(CART_OUT, target);
    tweens.add(
      duration,
      Easing.cubicInOut,
      (p) => {
        cart.position.lerpVectors(startPos, targetPos, p);
        cartProxy.position.x = cart.position.x;
        cartProxy.position.z = cart.position.z;
      },
      onDone,
    );
  }

  function seatWorldPosition(index: number): THREE.Vector3 {
    return TABLE_OUT.clone().add(SEAT_OFFSETS[index % SEAT_OFFSETS.length]!);
  }

  function popChair(index: number, onDone?: () => void): void {
    const target = seatWorldPosition(index);
    target.y = 0;
    const start = new THREE.Vector3();
    const startMatrix = new THREE.Matrix4();
    chairs.getMatrixAt(index, startMatrix);
    start.setFromMatrixPosition(startMatrix);
    const rotStart = new THREE.Quaternion().setFromRotationMatrix(startMatrix);
    const facing = Math.atan2(SEAT_OFFSETS[index % SEAT_OFFSETS.length]!.x, SEAT_OFFSETS[index % SEAT_OFFSETS.length]!.z);
    const rotEnd = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, facing + Math.PI, 0));
    tweens.add(
      0.42,
      Easing.backOut,
      (p) => {
        const pos = start.clone().lerp(target, p);
        pos.y = Math.sin(Math.PI * p) * 0.18;
        const rot = rotStart.clone().slerp(rotEnd, p);
        m.compose(pos, rot, new THREE.Vector3(1, 1, 1));
        chairs.setMatrixAt(index, m);
        chairs.instanceMatrix.needsUpdate = true;
      },
      onDone,
    );
  }

  function stackChair(index: number, onDone?: () => void): void {
    const target = CHAIR_STACK_POS.clone();
    target.y = index * 0.26;
    const startMatrix = new THREE.Matrix4();
    chairs.getMatrixAt(index, startMatrix);
    const start = new THREE.Vector3().setFromMatrixPosition(startMatrix);
    const rotStart = new THREE.Quaternion().setFromRotationMatrix(startMatrix);
    const rotEnd = new THREE.Quaternion();
    tweens.add(
      0.4,
      Easing.cubicInOut,
      (p) => {
        const pos = start.clone().lerp(target, p);
        pos.y += Math.sin(Math.PI * p) * 0.14;
        const rot = rotStart.clone().slerp(rotEnd, p);
        m.compose(pos, rot, new THREE.Vector3(1, 1, 1));
        chairs.setMatrixAt(index, m);
        chairs.instanceMatrix.needsUpdate = true;
      },
      onDone,
    );
  }

  function trayHomePosition(index: number): THREE.Vector3 {
    const pos = CART_OUT.clone();
    pos.x += (index - 1.5) * 0.02;
    pos.y = 0.32;
    return pos;
  }

  function placeTray(index: number, onDone?: () => void): void {
    const startMatrix = new THREE.Matrix4();
    trays.getMatrixAt(index, startMatrix);
    const start = new THREE.Vector3().setFromMatrixPosition(startMatrix);
    const target = seatWorldPosition(index);
    target.y = 0.44;
    tweens.add(
      0.4,
      Easing.cubicOut,
      (p) => {
        const pos = start.clone().lerp(target, p);
        pos.y = THREE.MathUtils.lerp(start.y, target.y, p) + Math.sin(Math.PI * p) * 0.05;
        m.compose(pos, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        trays.setMatrixAt(index, m);
        trays.instanceMatrix.needsUpdate = true;
      },
      onDone,
    );
  }

  function returnTray(index: number, worldX: number, worldZ: number): void {
    const home = trayHomePosition(index);
    const start = new THREE.Vector3(worldX, 0.44, worldZ);
    tweens.add(0.35, Easing.cubicOut, (p) => {
      const pos = start.clone().lerp(home, p);
      pos.y = THREE.MathUtils.lerp(start.y, home.y, p) + Math.sin(Math.PI * p) * 0.06;
      m.compose(pos, new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      trays.setMatrixAt(index, m);
      trays.instanceMatrix.needsUpdate = true;
    });
  }

  return {
    group,
    table,
    tableProxy,
    cart,
    cartProxy,
    chairStackProxy,
    chairs,
    trays,
    setTableProgress,
    animateTableTo,
    setCartProgress,
    animateCartTo,
    popChair,
    stackChair,
    placeTray,
    returnTray,
    trayHomePosition,
    seatWorldPosition,
  };
}
