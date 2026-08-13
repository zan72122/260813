import type { HidingSpot } from "../core/types";

// 座標はdocs/INTERFACES.mdの基準レイアウトに準拠。approachはゾウの立ち位置(anchorへ少し寄せた点)。
export const SPOTS: readonly HidingSpot[] = [
  {
    id: "stone-gap",
    position: { x: -8, y: 0.9, z: -6 },
    approach: { x: -6.4, y: 0, z: -5.2 },
    cameraPreset: "spot:stone-gap",
    acceptedFoodTypes: ["vegetable", "hay-cube"],
    elephantBehavior: "probe-gap",
    difficulty: 2,
    snapRadius: 1.6
  },
  {
    id: "sand",
    position: { x: 0, y: 0.05, z: 4 },
    approach: { x: 0, y: 0, z: 2.6 },
    cameraPreset: "spot:sand",
    acceptedFoodTypes: ["hay-cube", "vegetable"],
    elephantBehavior: "dig-sand",
    difficulty: 1,
    snapRadius: 2.0
  },
  {
    id: "pipe",
    position: { x: 7, y: 0.5, z: -1 },
    approach: { x: 5.4, y: 0, z: -0.6 },
    cameraPreset: "spot:pipe",
    acceptedFoodTypes: ["grass", "hay-cube"],
    elephantBehavior: "reach-pipe",
    difficulty: 3,
    snapRadius: 1.4
  },
  {
    id: "banyan-root",
    position: { x: -6, y: 0.3, z: 3 },
    approach: { x: -4.6, y: 0, z: 2.2 },
    cameraPreset: "spot:banyan-root",
    acceptedFoodTypes: ["banana-stem"],
    elephantBehavior: "peel-banana",
    difficulty: 2,
    snapRadius: 1.6
  },
  {
    id: "high-branch",
    position: { x: 8, y: 3.6, z: -7 },
    approach: { x: 6.6, y: 0, z: -5.6 },
    cameraPreset: "spot:high-branch",
    acceptedFoodTypes: ["branch"],
    elephantBehavior: "break-branch",
    difficulty: 3,
    snapRadius: 1.8
  }
];

export function getSpot(id: (typeof SPOTS)[number]["id"]): HidingSpot {
  const found = SPOTS.find((s) => s.id === id);
  if (!found) {
    throw new Error(`[spots] unknown spot id: ${id}`);
  }
  return found;
}

// D8: ガイド初回は3操作系統(押し込む/かぶせる/届かせる)を体験させるための固定セット。
export const GUIDED_SPOT_IDS = ["stone-gap", "sand", "high-branch"] as const;
