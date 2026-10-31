import type { ProposalPhase, ProposalStatusItem } from "./proposals-status-api";

const PHASE_LABELS: Record<ProposalPhase, string> = {
  recibida: "Recibida en el tablón",
  aprobada: "Aprobada por el dueño",
  en_curso: "En curso (agente)",
  pr_abierto: "Pull request abierto",
  ci_en_curso: "CI en curso",
  ci_correcta: "CI correcta",
  ci_con_fallos: "CI con fallos",
  preview_lista: "Preview lista",
  publicada: "Publicada en producción",
  cerrada_sin_hacer: "Cerrada sin hacer",
};

const INTRO =
  "Estas son las peticiones que han llegado desde el laboratorio. El dueño las revisa; cuando marca una como aprobada, un agente abre un pull request con preview.";

const PARTIAL_NOTE = "Algunos datos no se han podido leer del todo; la fase puede estar un poco desfasada.";

const EMPTY = "Todavía no hay propuestas en el tablón, o el taller no puede leerlas ahora.";

const ERROR = "No he podido leer el tablón. Prueba otra vez dentro de un rato.";

function formatKind(item: ProposalStatusItem): string {
  if (item.kind === "iteracion" && item.slug) return `Iteración · ${item.slug}`;
  if (item.kind === "iteracion") return "Iteración";
  return "Propuesta nueva";
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
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
    note.dataset.testid = "board-loading";
    note.textContent = "Leyendo el tablón…";
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
    title.textContent = "Tablón de propuestas";
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

    const intro = document.createElement("p");
    intro.className = "board-intro";
    intro.dataset.testid = "board-intro";
    intro.textContent = INTRO;
    body.append(intro);

    if (partial) {
      const warn = document.createElement("p");
      warn.className = "board-note";
      warn.dataset.testid = "board-partial";
      warn.textContent = PARTIAL_NOTE;
      body.append(warn);
    }

    if (items.length === 0) {
      const empty = document.createElement("p");
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

        const heading = document.createElement("p");
        heading.className = "board-item-title";
        heading.textContent = `#${item.number} · ${item.title}`;

        const meta = document.createElement("p");
        meta.className = "board-item-meta";
        meta.textContent = `${formatKind(item)} · ${PHASE_LABELS[item.phase]} · ${formatDate(item.updatedAt)}`;

        li.append(heading, meta);

        if (item.previewUrl && (item.phase === "preview_lista" || item.phase === "publicada")) {
          const link = document.createElement("a");
          link.className = "board-link";
          link.href = item.previewUrl;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.dataset.testid = `board-preview-${item.number}`;
          link.textContent = item.phase === "publicada" ? "Abrir producción" : "Abrir preview";
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

export { PHASE_LABELS };
