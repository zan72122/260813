import type { FoodDef } from "../core/types";

// ラベルはひらがな中心（UIは絵が主、文字は添え物）。colorはART_DIRECTION.mdの系統に準拠。
export const FOODS: readonly FoodDef[] = [
  { kind: "vegetable", label: "やさい", color: "#8fce6e" },
  { kind: "hay-cube", label: "ほしくさ", color: "#e3c876" },
  { kind: "banana-stem", label: "ばななのくき", color: "#b8d48e" },
  { kind: "branch", label: "きのえだ", color: "#7a9a5a" },
  { kind: "grass", label: "くさ", color: "#5aa860" }
];

export function getFood(kind: (typeof FOODS)[number]["kind"]): FoodDef {
  const found = FOODS.find((f) => f.kind === kind);
  if (!found) {
    throw new Error(`[foods] unknown food kind: ${kind}`);
  }
  return found;
}
