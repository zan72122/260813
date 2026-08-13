// 画面下部(縦)/左右どちらかの端(横)に並ぶ、その回の餌一覧。ドラッグ操作の入口。
// このコンポーネントはポインタ座標の受け渡しとゴースト表示のみを担当し、
// 「どのスポットへ吸着するか」の判定はhide screen側(raycast)に委ねる。
import type { FoodKind } from "../../core/types";
import { el, type Orientation } from "../dom";
import { drawFoodIcon, makeIconCanvas } from "../icons";

export interface FoodTrayItem {
  id: string;
  food: FoodKind;
}

export interface FoodTrayCallbacks {
  onDragStart: (item: FoodTrayItem, clientX: number, clientY: number) => void;
  onDragMove: (item: FoodTrayItem, clientX: number, clientY: number) => void;
  /** ドラッグ終了。呼び出し側(hide screen)がスナップ判定し、結果に応じて
   * markPlaced/returnItem を呼び戻す(このコールバック自体は戻り値を返さない)。 */
  onDragEnd: (item: FoodTrayItem, clientX: number, clientY: number) => void;
}

export interface FoodTray {
  readonly node: HTMLElement;
  setOrientation(o: Orientation): void;
  /** ドラッグ中断/スナップ失敗: 元の位置へふわっと戻す。 */
  returnItem(id: string): void;
  /** 仕上げ操作が完了しhide:completeへ寄与した食材を、トレイから見た目上取り除く。 */
  markPlaced(id: string): void;
  dispose(): void;
}

const ICON_SIZE = 76; // 要件64-96pxの大きな絵

export function createFoodTray(items: FoodTrayItem[], callbacks: FoodTrayCallbacks): FoodTray {
  const node = el("div", { className: "food-tray food-tray--portrait" });
  const slotEls = new Map<string, HTMLElement>();

  let dragging: { item: FoodTrayItem; ghost: HTMLElement; slot: HTMLElement } | null = null;

  for (const item of items) {
    const slot = el("div", { className: "food-tray__slot", attrs: { role: "button", "aria-label": item.food } });
    slot.style.touchAction = "none";
    const canvas = makeIconCanvas(ICON_SIZE);
    drawFoodIcon(canvas, item.food, ICON_SIZE);
    slot.appendChild(canvas);
    node.appendChild(slot);
    slotEls.set(item.id, slot);

    slot.addEventListener("pointerdown", (ev) => {
      if (slot.classList.contains("food-tray__slot--placed") || slot.classList.contains("food-tray__slot--dragging")) return;
      ev.preventDefault();
      slot.setPointerCapture(ev.pointerId);
      slot.classList.add("food-tray__slot--dragging");

      const ghost = el("div", { className: "food-tray__ghost" });
      const ghostCanvas = makeIconCanvas(ICON_SIZE * 1.15);
      drawFoodIcon(ghostCanvas, item.food, ICON_SIZE * 1.15);
      ghost.appendChild(ghostCanvas);
      ghost.style.left = `${ev.clientX}px`;
      ghost.style.top = `${ev.clientY}px`;
      document.body.appendChild(ghost);
      dragging = { item, ghost, slot };
      callbacks.onDragStart(item, ev.clientX, ev.clientY);
    });

    slot.addEventListener("pointermove", (ev) => {
      if (!dragging || dragging.item.id !== item.id) return;
      dragging.ghost.style.left = `${ev.clientX}px`;
      dragging.ghost.style.top = `${ev.clientY}px`;
      callbacks.onDragMove(item, ev.clientX, ev.clientY);
    });

    const endDrag = (ev: PointerEvent): void => {
      if (!dragging || dragging.item.id !== item.id) return;
      const { ghost } = dragging;
      dragging = null;
      slot.classList.remove("food-tray__slot--dragging");
      callbacks.onDragEnd(item, ev.clientX, ev.clientY);
      ghost.remove();
    };
    slot.addEventListener("pointerup", endDrag);
    slot.addEventListener("pointercancel", endDrag);
  }

  return {
    node,
    setOrientation(o: Orientation): void {
      node.classList.toggle("food-tray--portrait", o === "portrait");
      node.classList.toggle("food-tray--landscape", o === "landscape");
    },
    returnItem(id: string): void {
      const slot = slotEls.get(id);
      if (!slot) return;
      slot.classList.add("food-tray__slot--bounce");
      setTimeout(() => slot.classList.remove("food-tray__slot--bounce"), 400);
    },
    markPlaced(id: string): void {
      const slot = slotEls.get(id);
      slot?.classList.add("food-tray__slot--placed");
    },
    dispose(): void {
      dragging?.ghost.remove();
      dragging = null;
    }
  };
}
