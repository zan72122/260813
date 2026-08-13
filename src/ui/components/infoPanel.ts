// じょうほう画面(モーダル): 非公式である旨の明記 + 本格的な「せってい」画面(settings.ts)への入口。
import { el } from "../dom";

export interface InfoPanelDeps {
  onOpenSettings: () => void;
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
  const body = el("p", {
    className: "info-panel__body",
    text:
      "沖縄こどもの国が公開しているゾウの動物福祉の取り組みから着想した非公式の教育的ゲームです。" +
      "沖縄こどもの国の公式ゲームではありません。"
  });
  card.appendChild(heading);
  card.appendChild(body);

  const settingsBtn = el("button", {
    className: "info-panel__settings-link big-btn big-btn--secondary big-btn--medium",
    text: "せってい",
    attrs: { "aria-label": "せっていをひらく" }
  });
  settingsBtn.type = "button";
  settingsBtn.addEventListener("click", () => {
    close(); // せってい画面と二重に開いたままにならないよう、先にじょうほうを閉じてから開く
    deps.onOpenSettings();
  });
  card.appendChild(settingsBtn);

  const closeBtn = el("button", {
    className: "info-panel__close big-btn big-btn--ghost big-btn--medium",
    text: "とじる",
    attrs: { "aria-label": "じょうほうをとじる" }
  });
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
