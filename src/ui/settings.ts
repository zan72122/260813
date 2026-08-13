// せってい画面(モーダル): じょうほう(i)から開く。音オン/オフ、環境音量、うごきをへらす、
// ひかりをよわく、がしつ、データをリセット(二段階確認)。すべて64px+のタッチ対象で、即時反映+保存。
import type { Quality } from "../core/types";
import type { AppContext } from "./context";
import { el } from "./dom";

export interface SettingsPanel {
  readonly node: HTMLElement;
  open(): void;
  close(): void;
  dispose(): void;
}

function iconCanvas(size: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D | null } {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;
  return { canvas, ctx: canvas.getContext("2d") };
}

function drawSoundIcon(size: number, on: boolean): HTMLCanvasElement {
  const { canvas, ctx } = iconCanvas(size);
  if (!ctx) return canvas;
  const cy = size * 0.5;
  ctx.fillStyle = "#5a4a3a";
  ctx.beginPath();
  ctx.moveTo(size * 0.16, size * 0.38);
  ctx.lineTo(size * 0.32, size * 0.38);
  ctx.lineTo(size * 0.5, size * 0.2);
  ctx.lineTo(size * 0.5, size * 0.8);
  ctx.lineTo(size * 0.32, size * 0.62);
  ctx.lineTo(size * 0.16, size * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = on ? "#ff8a70" : "#c9bcae";
  ctx.lineWidth = Math.max(2, size * 0.06);
  ctx.lineCap = "round";
  if (on) {
    ctx.beginPath();
    ctx.arc(size * 0.58, cy, size * 0.14, -0.6, 0.6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(size * 0.58, cy, size * 0.26, -0.7, 0.7);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(size * 0.58, size * 0.32);
    ctx.lineTo(size * 0.82, size * 0.68);
    ctx.moveTo(size * 0.82, size * 0.32);
    ctx.lineTo(size * 0.58, size * 0.68);
    ctx.stroke();
  }
  return canvas;
}

function drawMotionIcon(size: number, reduced: boolean): HTMLCanvasElement {
  const { canvas, ctx } = iconCanvas(size);
  if (!ctx) return canvas;
  ctx.strokeStyle = reduced ? "#c9bcae" : "#ff8a70";
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(size * 0.3, size * 0.28, size * 0.1, 0, Math.PI * 2);
  ctx.fillStyle = ctx.strokeStyle;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(size * 0.3, size * 0.4);
  ctx.lineTo(size * 0.34, size * 0.62);
  ctx.lineTo(size * 0.58, size * 0.7);
  ctx.moveTo(size * 0.34, size * 0.62);
  ctx.lineTo(size * 0.2, size * 0.84);
  ctx.moveTo(size * 0.3, size * 0.46);
  ctx.lineTo(size * 0.56, size * 0.4);
  ctx.stroke();
  if (!reduced) {
    ctx.strokeStyle = "#ffd66e";
    ctx.beginPath();
    ctx.moveTo(size * 0.62, size * 0.3);
    ctx.lineTo(size * 0.78, size * 0.24);
    ctx.moveTo(size * 0.64, size * 0.44);
    ctx.lineTo(size * 0.82, size * 0.42);
    ctx.stroke();
  }
  return canvas;
}

function drawLightIcon(size: number, dim: boolean): HTMLCanvasElement {
  const { canvas, ctx } = iconCanvas(size);
  if (!ctx) return canvas;
  const cx = size * 0.5;
  const cy = size * 0.52;
  ctx.fillStyle = dim ? "#d8c39a" : "#ffd66e";
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.22, 0, Math.PI * 2);
  ctx.fill();
  const rayCount = dim ? 4 : 8;
  ctx.strokeStyle = dim ? "#d8c39a" : "#ffd66e";
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.lineCap = "round";
  for (let i = 0; i < rayCount; i++) {
    const a = (i / rayCount) * Math.PI * 2;
    const r1 = size * 0.3;
    const r2 = size * 0.4;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
    ctx.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
    ctx.stroke();
  }
  return canvas;
}

function drawGaugeIcon(size: number): HTMLCanvasElement {
  const { canvas, ctx } = iconCanvas(size);
  if (!ctx) return canvas;
  const cx = size * 0.5;
  const cy = size * 0.62;
  ctx.strokeStyle = "#5a4a3a";
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.32, Math.PI, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "#ff8a70";
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + size * 0.2, cy - size * 0.24);
  ctx.stroke();
  return canvas;
}

function drawTrashIcon(size: number): HTMLCanvasElement {
  const { canvas, ctx } = iconCanvas(size);
  if (!ctx) return canvas;
  ctx.strokeStyle = "#a35a4a";
  ctx.lineWidth = Math.max(2, size * 0.07);
  ctx.lineCap = "round";
  ctx.strokeRect(size * 0.28, size * 0.36, size * 0.44, size * 0.42);
  ctx.beginPath();
  ctx.moveTo(size * 0.2, size * 0.3);
  ctx.lineTo(size * 0.8, size * 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(size * 0.4, size * 0.24);
  ctx.lineTo(size * 0.6, size * 0.24);
  ctx.stroke();
  return canvas;
}

function iconRow(label: string): { row: HTMLElement; iconSlot: HTMLElement } {
  const row = el("div", { className: "settings-row" });
  const iconSlot = el("div", { className: "settings-row__icon" });
  row.appendChild(iconSlot);
  const textWrap = el("div", { className: "settings-row__text" });
  textWrap.appendChild(el("p", { className: "settings-row__label", text: label }));
  row.appendChild(textWrap);
  return { row, iconSlot };
}

/** 大きなON/OFFトグル(64px+のタップ範囲、押すたびに即時反映+保存)。 */
function createToggle(
  label: string,
  initial: boolean,
  drawIcon: (size: number, value: boolean) => HTMLCanvasElement,
  onChange: (v: boolean) => void
): HTMLElement {
  const { row, iconSlot } = iconRow(label);
  row.classList.add("settings-row--toggle");
  let value = initial;
  const btn = el("button", { className: "settings-toggle", attrs: { role: "switch", "aria-checked": String(value), "aria-label": label } });
  btn.type = "button";
  const knob = el("span", { className: "settings-toggle__knob" });
  btn.appendChild(knob);
  function render(): void {
    iconSlot.replaceChildren(drawIcon(40, value));
    btn.classList.toggle("settings-toggle--on", value);
    btn.setAttribute("aria-checked", String(value));
  }
  render();
  btn.addEventListener("click", () => {
    value = !value;
    render();
    onChange(value);
  });
  row.appendChild(btn);
  return row;
}

function createSlider(label: string, initialPct: number, onChange: (pct: number) => void): HTMLElement {
  const { row, iconSlot } = iconRow(label);
  row.classList.add("settings-row--slider");
  iconSlot.replaceChildren(drawSoundIcon(40, true));
  const wrap = el("div", { className: "settings-row__control" });
  const slider = el("input", {
    className: "settings-slider",
    attrs: { type: "range", min: "0", max: "100", step: "5", "aria-label": label }
  }) as HTMLInputElement;
  slider.value = String(Math.round(initialPct));
  const readout = el("span", { className: "settings-slider__value", text: `${Math.round(initialPct)}%` });
  slider.addEventListener("input", () => {
    readout.textContent = `${slider.value}%`;
    onChange(Number(slider.value));
  });
  wrap.appendChild(slider);
  wrap.appendChild(readout);
  row.appendChild(wrap);
  return row;
}

const QUALITY_OPTIONS: Array<{ value: Quality | "auto"; label: string }> = [
  { value: "low", label: "ひくい" },
  { value: "medium", label: "ふつう" },
  { value: "high", label: "たかい" },
  { value: "auto", label: "おまかせ" }
];

function createQualityPicker(initial: Quality | "auto", onChange: (v: Quality | "auto") => void): HTMLElement {
  const { row, iconSlot } = iconRow("がしつ");
  row.classList.add("settings-row--quality");
  iconSlot.replaceChildren(drawGaugeIcon(40));
  const group = el("div", { className: "settings-segmented", attrs: { role: "radiogroup", "aria-label": "がしつ" } });
  let current = initial;
  const buttons: HTMLButtonElement[] = [];
  for (const opt of QUALITY_OPTIONS) {
    const btn = el("button", {
      className: "settings-segmented__btn",
      text: opt.label,
      attrs: { role: "radio", "aria-checked": String(opt.value === current), "aria-label": `がしつ ${opt.label}` }
    }) as HTMLButtonElement;
    btn.type = "button";
    btn.classList.toggle("settings-segmented__btn--on", opt.value === current);
    btn.addEventListener("click", () => {
      if (current === opt.value) return;
      current = opt.value;
      for (const b of buttons) {
        const on = b === btn;
        b.classList.toggle("settings-segmented__btn--on", on);
        b.setAttribute("aria-checked", String(on));
      }
      onChange(current);
    });
    buttons.push(btn);
    group.appendChild(btn);
  }
  row.appendChild(group);
  return row;
}

function createResetSection(ctx: AppContext): HTMLElement {
  const wrap = el("div", { className: "settings-reset" });
  const { row, iconSlot } = iconRow("データをリセット");
  row.classList.add("settings-row--reset");
  iconSlot.replaceChildren(drawTrashIcon(40));
  const askBtn = el("button", { className: "settings-reset-btn", text: "リセット", attrs: { "aria-label": "データをリセットする" } });
  askBtn.type = "button";
  row.appendChild(askBtn);
  wrap.appendChild(row);

  const confirmBox = el("div", { className: "settings-reset-confirm" });
  confirmBox.style.display = "none";
  confirmBox.appendChild(el("p", { className: "settings-reset-confirm__label", text: "ほんとうに ぜんぶ けしますか？" }));
  const confirmButtons = el("div", { className: "settings-reset-confirm__buttons" });
  const yesBtn = el("button", { className: "big-btn big-btn--primary big-btn--medium", text: "けす", attrs: { "aria-label": "データをけす" } });
  yesBtn.type = "button";
  const cancelBtn = el("button", { className: "big-btn big-btn--secondary big-btn--medium", text: "やめる", attrs: { "aria-label": "リセットをやめる" } });
  cancelBtn.type = "button";
  confirmButtons.appendChild(yesBtn);
  confirmButtons.appendChild(cancelBtn);
  confirmBox.appendChild(confirmButtons);
  wrap.appendChild(confirmBox);

  askBtn.addEventListener("click", () => {
    row.style.display = "none";
    confirmBox.style.display = "flex";
  });
  cancelBtn.addEventListener("click", () => {
    confirmBox.style.display = "none";
    row.style.display = "";
  });
  yesBtn.addEventListener("click", () => {
    ctx.resetSaveData();
  });

  return wrap;
}

export function createSettingsPanel(ctx: AppContext): SettingsPanel {
  const overlay = el("div", { className: "modal-overlay" });
  const card = el("div", { className: "modal-card settings-card card" });
  overlay.appendChild(card);

  card.appendChild(el("p", { className: "settings-title", text: "せってい" }));

  const list = el("div", { className: "settings-list" });
  card.appendChild(list);

  list.appendChild(
    createToggle("おと", ctx.save.settings.muted === false, drawSoundIcon, (on) => {
      ctx.applySettings({ muted: !on });
    })
  );
  list.appendChild(
    createSlider("かんきょうおん", ctx.save.settings.ambienceVolume * 100, (pct) => {
      ctx.applySettings({ ambienceVolume: pct / 100 });
    })
  );
  list.appendChild(
    createToggle("うごきをへらす", ctx.save.settings.reducedMotion, drawMotionIcon, (on) => {
      ctx.applySettings({ reducedMotion: on });
    })
  );
  list.appendChild(
    createToggle("ひかりをよわく", ctx.save.settings.dimLight, drawLightIcon, (on) => {
      ctx.applySettings({ dimLight: on });
    })
  );
  list.appendChild(
    createQualityPicker(ctx.save.settings.quality, (v) => {
      ctx.applySettings({ quality: v });
    })
  );
  list.appendChild(createResetSection(ctx));

  const closeBtn = el("button", { className: "settings-close big-btn big-btn--secondary big-btn--medium", text: "とじる", attrs: { "aria-label": "せっていをとじる" } });
  closeBtn.type = "button";
  card.appendChild(closeBtn);
  closeBtn.addEventListener("click", () => close());
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) close();
  });

  function open(): void {
    overlay.classList.add("modal-overlay--open");
  }
  function close(): void {
    overlay.classList.remove("modal-overlay--open");
  }

  return {
    node: overlay,
    open,
    close,
    dispose(): void {
      overlay.remove();
    }
  };
}
