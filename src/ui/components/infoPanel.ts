// じょうほう画面(モーダル): 非公式である旨の明記 + かんたんな設定(音/うごきの量)へのリンク。
import { el } from "../dom";
import { loadSave, persistSave } from "../../game/album";
import type { SaveData } from "../../core/types";

export interface InfoPanelDeps {
  onReducedMotionChange: (on: boolean) => void;
  onMutedChange: (on: boolean) => void;
}

export interface InfoPanel {
  readonly node: HTMLElement;
  open(): void;
  close(): void;
  dispose(): void;
}

export function createInfoPanel(deps: InfoPanelDeps): InfoPanel {
  const overlay = el("div", { className: "modal-overlay" });
  const card = el("div", { className: "modal-card info-panel card" });
  overlay.appendChild(card);

  const heading = el("p", { className: "info-panel__title", text: "このゲームについて" });
  const body = el(
    "p",
    {
      className: "info-panel__body",
      text:
        "沖縄こどもの国が公開しているゾウの動物福祉の取り組みから着想した非公式の教育的ゲームです。" +
        "沖縄こどもの国の公式ゲームではありません。"
    }
  );
  card.appendChild(heading);
  card.appendChild(body);

  // 設定へのリンク(簡易インライン設定。本格的な設定画面/保存はS5)。
  const settingsToggle = el("button", { className: "info-panel__settings-link", text: "せってい ▾" });
  settingsToggle.type = "button";
  card.appendChild(settingsToggle);

  const settingsBox = el("div", { className: "info-panel__settings" });
  settingsBox.style.display = "none";
  card.appendChild(settingsBox);

  const save: SaveData = loadSave();

  function toggleRow(labelText: string, initial: boolean, onChange: (v: boolean) => void): HTMLElement {
    const row = el("label", { className: "info-panel__toggle-row" });
    const input = el("input", { attrs: { type: "checkbox" } }) as HTMLInputElement;
    input.checked = initial;
    input.addEventListener("change", () => onChange(input.checked));
    const text = el("span", { text: labelText });
    row.appendChild(input);
    row.appendChild(text);
    return row;
  }

  settingsBox.appendChild(
    toggleRow("うごきをすくなくする", save.settings.reducedMotion, (v) => {
      save.settings.reducedMotion = v;
      persistSave(save);
      deps.onReducedMotionChange(v);
    })
  );
  settingsBox.appendChild(
    toggleRow("おとを消す", save.settings.muted, (v) => {
      save.settings.muted = v;
      persistSave(save);
      deps.onMutedChange(v);
    })
  );

  settingsToggle.addEventListener("click", () => {
    const willShow = settingsBox.style.display === "none";
    settingsBox.style.display = willShow ? "flex" : "none";
    settingsToggle.textContent = willShow ? "せってい ▴" : "せってい ▾";
  });

  const closeBtn = el("button", { className: "info-panel__close big-btn big-btn--secondary big-btn--medium", text: "とじる" });
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
