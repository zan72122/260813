import * as THREE from 'three';

/** Hero materials — チーズ工房の質感セット */
export class Materials {
  /** 温かいモッツァレラ (光沢・湿り) */
  mozz: THREE.MeshPhysicalMaterial;
  /** ぼそぼそのカード (つや控えめ) */
  curd: THREE.MeshStandardMaterial;
  /** クリーム */
  cream: THREE.MeshPhysicalMaterial;
  /** 熱湯 */
  hotWater: THREE.MeshPhysicalMaterial;
  /** 冷水 */
  coldWater: THREE.MeshPhysicalMaterial;
  wood: THREE.MeshStandardMaterial;
  woodDark: THREE.MeshStandardMaterial;
  steel: THREE.MeshStandardMaterial;
  wall: THREE.MeshStandardMaterial;
  robot: THREE.MeshStandardMaterial;
  apron: THREE.MeshStandardMaterial;
  plate: THREE.MeshStandardMaterial;
  accentPink: THREE.MeshStandardMaterial;

  constructor() {
    this.mozz = new THREE.MeshPhysicalMaterial({
      color: 0xfbf2da,
      roughness: 0.24,
      metalness: 0,
      clearcoat: 0.75,
      clearcoatRoughness: 0.28,
      sheen: 0.5,
      sheenColor: new THREE.Color(0xfff0c8),
    });
    this.curd = new THREE.MeshStandardMaterial({
      color: 0xf8f2e2,
      roughness: 0.85,
      metalness: 0,
    });
    this.cream = new THREE.MeshPhysicalMaterial({
      color: 0xf9ecc4,
      roughness: 0.18,
      metalness: 0,
      clearcoat: 0.8,
      clearcoatRoughness: 0.2,
    });
    this.hotWater = new THREE.MeshPhysicalMaterial({
      color: 0xdff0f2,
      roughness: 0.05,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
      clearcoat: 1,
    });
    this.coldWater = new THREE.MeshPhysicalMaterial({
      color: 0xbfe3f0,
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.62,
      clearcoat: 1,
    });
    this.wood = new THREE.MeshStandardMaterial({ color: 0xd9b380, roughness: 0.8 });
    this.woodDark = new THREE.MeshStandardMaterial({ color: 0xb98f5e, roughness: 0.8 });
    this.steel = new THREE.MeshStandardMaterial({ color: 0xcfd6da, roughness: 0.3, metalness: 0.85 });
    this.wall = new THREE.MeshStandardMaterial({ color: 0xfbeed7, roughness: 1 });
    this.robot = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 });
    this.apron = new THREE.MeshStandardMaterial({ color: 0xff9ec6, roughness: 0.8 });
    this.plate = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
    this.accentPink = new THREE.MeshStandardMaterial({ color: 0xffb3d1, roughness: 0.6 });
  }
}

export const APRON_COLORS = [0xff9ec6, 0x9ed1ff, 0xffd166];
export const BOWL_RIMS = [0xffb3d1, 0x8dd7c7, 0xc9a7f5]; // rainbow風は縁の縞で表現
export const PLATE_STYLES = [
  { base: 0xffffff, accent: 0xffb3d1, name: 'はな' },
  { base: 0xfff8e8, accent: 0xffd166, name: 'ほし' },
  { base: 0xf3f9ff, accent: 0x9ed1ff, name: 'にじ' },
];
