import { WHITEBOARD_MAX_ROWS } from "./proposals-board-metrics";
import type { BoardFocus, BoardScreenName } from "./proposals-board-session";
import type { ProposalPhase, ProposalStatusItem } from "./proposals-status-api";

const PAGES_HOST = "proto-lab-3k6.pages.dev";

/** Raíz del laboratorio en producción. Coincide con el respaldo de `publicada` en el agregado. */
export const LAB_ROOT_HREF = `https://${PAGES_HOST}/`;

export const PREVIEW_ACTION_LABEL = "Probar la preview";
export const LAB_ACTION_LABEL = "Ver en el lab";
export const BOARD_BACK_LABEL = "Volver al tablón";

export type BoardNavAction =
  | { kind: "preview"; label: typeof PREVIEW_ACTION_LABEL; href: string }
  | { kind: "lab-prototype"; label: typeof LAB_ACTION_LABEL; slug: string }
  | { kind: "lab-root"; label: typeof LAB_ACTION_LABEL; href: string };

const PHASE_DETAIL_LABEL: Record<ProposalPhase, string> = {
  recibida: "Recibida",
  aprobada: "Aprobada",
  en_curso: "En curso",
  pr_abierto: "Cambio en revisión",
  ci_en_curso: "Comprobando",
  ci_correcta: "Comprobaciones en verde",
  ci_con_fallos: "Comprobaciones con fallos",
  preview_lista: "Preview lista",
  publicada: "Publicada",
  cerrada_sin_hacer: "Cerrada",
};

export function phaseDetailLabel(phase: ProposalPhase): string {
  return PHASE_DETAIL_LABEL[phase];
}

export function kindDetailLabel(kind: ProposalStatusItem["kind"]): string {
  return kind === "iteracion" ? "Iteración" : "Propuesta";
}

/** Enlaces https del host de Pages (preview o producción). Rechaza el resto. */
export function pagesPreviewUrl(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  const host = url.hostname;
  if (host !== PAGES_HOST && !host.endsWith(`.${PAGES_HOST}`)) return null;
  return url.toString();
}

/**
 * Acción de navegación dibujada en el detalle.
 * `preview_lista` abre la preview del PR.
 * `publicada` entra al prototipo del laboratorio si el slug está en el catálogo visible;
 * si no, a la raíz del lab. El resto de fases no navega.
 */
export function boardNavAction(
  item: ProposalStatusItem,
  knownSlugs: readonly string[],
): BoardNavAction | null {
  if (item.phase === "preview_lista") {
    const href = pagesPreviewUrl(item.previewUrl);
    if (!href) return null;
    return { kind: "preview", label: PREVIEW_ACTION_LABEL, href };
  }
  if (item.phase === "publicada") {
    const slug = item.slug?.trim().toLowerCase() ?? "";
    if (slug && knownSlugs.some((known) => known.toLowerCase() === slug)) {
      return { kind: "lab-prototype", label: LAB_ACTION_LABEL, slug };
    }
    return { kind: "lab-root", label: LAB_ACTION_LABEL, href: LAB_ROOT_HREF };
  }
  return null;
}

export type BoardUiRow = {
  number: number;
  title: string;
  phaseLabel: string;
};

export type BoardUiDetail = {
  number: number;
  title: string;
  phaseLabel: string;
  kindLabel: string;
  meta: string;
  action: BoardNavAction | null;
};

export type BoardUiSnapshot = {
  interactive: boolean;
  moving: boolean;
  screen: BoardScreenName;
  selectedNumber: number | null;
  focus: BoardFocus | null;
  rows: BoardUiRow[];
  detail: BoardUiDetail | null;
};

export function visibleBoardItems(items: readonly ProposalStatusItem[]): ProposalStatusItem[] {
  return items.slice(0, WHITEBOARD_MAX_ROWS);
}

export function buildBoardUi(input: {
  interactive: boolean;
  moving: boolean;
  screen: BoardScreenName;
  selectedNumber: number | null;
  focus: BoardFocus | null;
  items: readonly ProposalStatusItem[];
  knownSlugs: readonly string[];
}): BoardUiSnapshot {
  const visible = visibleBoardItems(input.items);
  const rows = visible.map((item) => ({
    number: item.number,
    title: item.title,
    phaseLabel: phaseDetailLabel(item.phase),
  }));
  let detail: BoardUiDetail | null = null;
  if (input.screen === "detail" && input.selectedNumber != null) {
    const item = visible.find((row) => row.number === input.selectedNumber);
    if (item) {
      const date = formatBoardDate(item.updatedAt);
      detail = {
        number: item.number,
        title: item.title,
        phaseLabel: phaseDetailLabel(item.phase),
        kindLabel: kindDetailLabel(item.kind),
        meta: [kindDetailLabel(item.kind), date].filter((part) => part && part.length > 0).join(" · "),
        action: boardNavAction(item, input.knownSlugs),
      };
    }
  }
  return {
    interactive: input.interactive,
    moving: input.moving,
    screen: input.screen,
    selectedNumber: input.selectedNumber,
    focus: input.focus,
    rows,
    detail,
  };
}

export function formatBoardDate(iso: string): string | null {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}
