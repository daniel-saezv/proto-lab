import { trackAriaLabel, trackStepVisuals, TRACK_STEP_LABELS } from "./proposals-board-track";
import type { ProposalStatusItem } from "./proposals-status-api";

const PARTIAL_NOTE = "Algunos datos pueden ir un poco desfasados.";

const EMPTY = "Nada activo en el tablón ahora mismo.";

const ERROR = "No he podido leer el tablón. Prueba otra vez dentro de un rato.";

function renderTrack(phase: ProposalStatusItem["phase"]): HTMLElement {
  const track = document.createElement("div");
  track.className = "board-track";
  track.dataset.testid = "board-track";
  track.setAttribute("role", "img");
  track.setAttribute("aria-label", trackAriaLabel(phase));

  const visuals = trackStepVisuals(phase);
  visuals.forEach((visual, index) => {
    const step = document.createElement("div");
    step.className = "board-step";
    step.dataset.visual = visual;
    step.dataset.testid = `board-step-${index}`;

    const dotWrap = document.createElement("span");
    dotWrap.className = "board-dot-wrap";

    const dot = document.createElement("span");
    dot.className = "board-dot";
    if (visual === "active") {
      const pulse = document.createElement("span");
      pulse.className = "board-dot-pulse";
      pulse.setAttribute("aria-hidden", "true");
      dotWrap.append(pulse);
    }
    if (visual === "celebrate") {
      for (let s = 0; s < 3; s += 1) {
        const spark = document.createElement("span");
        spark.className = "board-dot-spark";
        spark.setAttribute("aria-hidden", "true");
        dotWrap.append(spark);
      }
    }
    if (visual === "fail") {
      dot.classList.add("board-dot--fail");
      dot.textContent = "!";
      dot.setAttribute("aria-hidden", "true");
    } else if (visual === "filled" || visual === "celebrate") {
      dot.classList.add("board-dot--done");
      dot.textContent = "✓";
      dot.setAttribute("aria-hidden", "true");
    }

    dotWrap.append(dot);

    const caption = document.createElement("span");
    caption.className = "board-step-label sr-only";
    caption.textContent = TRACK_STEP_LABELS[index];

    step.append(dotWrap, caption);

    if (index < visuals.length - 1) {
      const next = visuals[index + 1];
      const line = document.createElement("span");
      line.className = "board-step-line";
      line.setAttribute("aria-hidden", "true");
      if (next !== "empty") line.dataset.filled = "1";
      step.append(line);
    }

    track.append(step);
  });

  return track;
}

export function createProposalsBoard(options: {
  root: HTMLElement;
  load: () => Promise<{ partial: boolean; items: ProposalStatusItem[] }>;
  onOpen: () => void;
  onClose: () => void;
}) {
  let open = false;

  function renderLoading() {
    options.root.replaceChildren();
    const panel = buildShell();
    const body = panel.querySelector("[data-testid='board-body']")!;
    const note = document.createElement("p");
    note.className = "board-status board-status--loading";
    note.dataset.testid = "board-loading";
    const gem = document.createElement("span");
    gem.className = "board-gem board-gem--pulse";
    gem.setAttribute("aria-hidden", "true");
    note.append(gem, document.createTextNode("Leyendo el tablón…"));
    body.append(note);
    options.root.append(panel);
  }

  function buildShell(): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "board-panel";
    panel.dataset.testid = "proposals-board";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "board-title");

    const header = document.createElement("header");
    header.className = "board-header";
    const title = document.createElement("h2");
    title.id = "board-title";
    title.dataset.testid = "board-title";
    title.textContent = "Tablón";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "text-button";
    close.dataset.testid = "board-close";
    close.textContent = "Cerrar";
    close.addEventListener("click", () => closePanel());
    header.append(title, close);

    const body = document.createElement("div");
    body.className = "board-body";
    body.dataset.testid = "board-body";

    panel.append(header, body);
    return panel;
  }

  function renderContent(partial: boolean, items: ProposalStatusItem[]) {
    options.root.replaceChildren();
    const panel = buildShell();
    const body = panel.querySelector("[data-testid='board-body']")!;

    if (partial) {
      const warn = document.createElement("p");
      warn.className = "board-note";
      warn.dataset.testid = "board-partial";
      const icon = document.createElement("span");
      icon.className = "board-gem board-gem--warn";
      icon.setAttribute("aria-hidden", "true");
      warn.append(icon, document.createTextNode(PARTIAL_NOTE));
      body.append(warn);
    }

    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "board-status";
      empty.dataset.testid = "board-empty";
      empty.textContent = EMPTY;
      body.append(empty);
    } else {
      const list = document.createElement("ul");
      list.className = "board-list";
      list.dataset.testid = "board-list";
      for (const item of items) {
        const li = document.createElement("li");
        li.className = "board-item";
        li.dataset.testid = `board-item-${item.number}`;
        li.dataset.phase = item.phase;

        const heading = document.createElement("p");
        heading.className = "board-item-title";
        heading.textContent = `#${item.number} · ${item.title}`;

        li.append(heading, renderTrack(item.phase));

        if (item.previewUrl && (item.phase === "preview_lista" || item.phase === "publicada")) {
          const link = document.createElement("a");
          link.className = "board-link";
          link.href = item.previewUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.dataset.testid = `board-preview-${item.number}`;
          link.textContent = item.phase === "publicada" ? "Producción" : "Preview";
          li.append(link);
        }

        list.append(li);
      }
      body.append(list);
    }

    options.root.append(panel);
  }

  function renderError() {
    options.root.replaceChildren();
    const panel = buildShell();
    const body = panel.querySelector("[data-testid='board-body']")!;
    const note = document.createElement("p");
    note.className = "board-status board-status--error";
    note.dataset.testid = "board-error";
    note.textContent = ERROR;
    body.append(note);
    options.root.append(panel);
  }

  function closePanel() {
    if (!open) return;
    open = false;
    options.root.hidden = true;
    options.root.replaceChildren();
    document.body.classList.remove("board-open");
    options.onClose();
  }

  async function openPanel() {
    if (open) return;
    open = true;
    options.root.hidden = false;
    document.body.classList.add("board-open");
    options.onOpen();
    renderLoading();
    try {
      const data = await options.load();
      if (!open) return;
      renderContent(data.partial, data.items);
    } catch {
      if (!open) return;
      renderError();
    }
  }

  function handleKey(event: KeyboardEvent): boolean {
    if (!open) return false;
    if (event.key === "Escape") {
      event.preventDefault();
      closePanel();
      return true;
    }
    return false;
  }

  function isOpen(): boolean {
    return open;
  }

  return { open: openPanel, close: closePanel, handleKey, isOpen };
}

export { trackStepVisuals, trackAriaLabel };
