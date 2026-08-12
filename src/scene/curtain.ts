import * as THREE from 'three';

export interface CurtainHandles {
  group: THREE.Group;
  proxy: THREE.Mesh;
  setProgress: (closedAmount: number) => void;
  getProgress: () => number;
}

function buildPanelGeometry(width: number, height: number): THREE.BufferGeometry {
  const segsX = 10;
  const segsY = 6;
  const geo = new THREE.PlaneGeometry(width, height, segsX, segsY);
  const pos = geo.attributes['position'] as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const wave = Math.sin((x / width) * Math.PI * 5) * 0.012 + Math.sin((y / height) * Math.PI * 2.2) * 0.006;
    pos.setZ(i, wave);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/** Two sheer panels sliding in from the window's edges toward the center, driven live by drag progress (0 = open, 1 = fully closed). */
export function buildCurtain(windowCenter: THREE.Vector3, windowWidth: number, windowHeight: number): CurtainHandles {
  const group = new THREE.Group();
  const panelWidth = windowWidth * 0.62;
  const geo = buildPanelGeometry(panelWidth, windowHeight + 0.1);
  const material = new THREE.MeshStandardMaterial({
    color: 0xfff6e8,
    transparent: true,
    opacity: 0.72,
    roughness: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
  });

  const left = new THREE.Mesh(geo, material);
  const right = new THREE.Mesh(geo.clone(), material);
  const openX = windowWidth / 2 + panelWidth / 2 + 0.02;
  const closedX = panelWidth / 2 - 0.03;
  left.position.set(windowCenter.x - openX, windowCenter.y, windowCenter.z + 0.03);
  right.position.set(windowCenter.x + openX, windowCenter.y, windowCenter.z + 0.03);
  group.add(left, right);

  const proxy = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial());
  proxy.visible = false;
  proxy.position.set(windowCenter.x + closedX * 0.4, windowCenter.y, windowCenter.z + 0.05);
  group.add(proxy);

  const state = { progress: 0 };

  function setProgress(closedAmount: number): void {
    const t = THREE.MathUtils.clamp(closedAmount, 0, 1);
    state.progress = t;
    left.position.x = THREE.MathUtils.lerp(windowCenter.x - openX, windowCenter.x - closedX, t);
    right.position.x = THREE.MathUtils.lerp(windowCenter.x + openX, windowCenter.x + closedX, t);
    proxy.position.x = THREE.MathUtils.lerp(windowCenter.x + openX * 0.4, windowCenter.x + closedX * 0.6, t);
  }
  setProgress(0);

  return {
    group,
    proxy,
    setProgress,
    getProgress: () => state.progress,
  };
}
