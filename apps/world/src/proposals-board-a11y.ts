import type { BoardNavAction, BoardUiSnapshot } from "./proposals-board-actions";

export type BoardA11yHandlers = {
  onRow: (number: number) => void;
  onBack: () => void;
  onAction: (action: BoardNavAction) => void;
};

/** Controles fuera de pantalla: el dibujo está en la pizarra y el teclado llega por aquí. */
export function renderBoardControls(root: HTMLElement, ui: BoardUiSnapshot, handlers: BoardA11yHandlers) {
  root.replaceChildren();
  if (!ui.interactive) {
    root.hidden = true;
    return;
  }
  root.hidden = false;
  if (ui.screen === "detail" && ui.detail) {
    const detail = ui.detail;
    const back = document.createElement("button");
    back.type = "button";
    back.dataset.testid = "board-deselect";
    back.textContent = "Volver al tablón";
    back.tabIndex = ui.focus?.zone === "action" ? -1 : 0;
    back.addEventListener("click", () => handlers.onBack());
    const title = document.createElement("p");
    title.dataset.testid = "board-detail-title";
    title.textContent = `#${detail.number} ${detail.title}`;
    const phase = document.createElement("p");
    phase.dataset.testid = "board-detail-phase";
    phase.textContent = `${detail.kindLabel}. ${detail.phaseLabel}`;
    root.append(back, title, phase);
    if (detail.action) {
      root.append(actionControl(detail.action, ui.focus?.zone === "action", handlers));
    }
    return;
  }
  const list = document.createElement("div");
  list.role = "list";
  for (const row of ui.rows) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.testid = "board-row";
    button.dataset.number = String(row.number);
    button.textContent = `#${row.number} ${row.title}. ${row.phaseLabel}`;
    const focused = ui.focus?.zone === "row" && ui.focus.number === row.number;
    button.tabIndex = focused || (ui.focus == null && row === ui.rows[0]) ? 0 : -1;
    button.addEventListener("click", () => handlers.onRow(row.number));
    list.append(button);
  }
  root.append(list);
}

function actionControl(action: BoardNavAction, focused: boolean, handlers: BoardA11yHandlers): HTMLElement {
  if (action.kind === "lab-prototype") {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.testid = "board-action";
    button.dataset.action = action.kind;
    button.textContent = action.label;
    button.tabIndex = focused ? 0 : -1;
    button.addEventListener("click", () => handlers.onAction(action));
    return button;
  }
  const link = document.createElement("a");
  link.dataset.testid = "board-action";
  link.dataset.action = action.kind;
  link.href = action.href;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = action.label;
  link.tabIndex = focused ? 0 : -1;
  return link;
}
