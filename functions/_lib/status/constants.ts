/** Marca HTML que la Function de propuestas inserta al crear la issue. */
export const USER_REQUEST_MARKER = "<!-- proto-lab: peticion-de-usuario -->";

export const OWNER_LOGIN = "daniel-saezv";
export const REPO_OWNER = "daniel-saezv";
export const REPO_NAME = "proto-lab";

export const LABEL_APROBADO = "aprobado";
export const LABEL_EN_CURSO = "en-curso";

/**
 * Clave KV del tablón. El namespace `PROPOSALS` es el mismo en producción y en
 * las previews: la rama entra en la clave para que una preview no reescriba
 * el valor que sirve producción (ni el de otra preview).
 * `v6` no se lee con las claves `v5` de antes, que eran compartidas.
 */
export function statusCacheKey(branch?: string | null): string {
  const raw = typeof branch === "string" ? branch.trim() : "";
  if (raw === "main") return "proposal-status:v6:production";
  if (raw.length === 0) return "proposal-status:v6:local";
  const safe = raw
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `proposal-status:v6:preview:${safe || "rama"}`;
}

/** Sin rama de Pages (tests y local). Producción y cada preview usan otra clave. */
export const STATUS_CACHE_KEY = statusCacheKey();

/** Ventana en la que una respuesta buena se sirve sin volver a GitHub. */
export const STATUS_CACHE_TTL_SECONDS = 120;

/**
 * El valor sigue en KV más tiempo para poder devolver el último tablón bueno
 * si GitHub falla. No se reescribe con un fallo.
 */
export const STATUS_CACHE_STORE_SECONDS = 24 * 60 * 60;

export const STATUS_TITLE_MAX = 80;

export const PRODUCTION_HOST = "proto-lab-3k6.pages.dev";
export const PREVIEW_HOST_SUFFIX = ".proto-lab-3k6.pages.dev";

export const CI_WORKFLOW_FILE = "ci.yml";

export type ProposalPhase =
  | "recibida"
  | "aprobada"
  | "en_curso"
  | "pr_abierto"
  | "ci_en_curso"
  | "ci_correcta"
  | "ci_con_fallos"
  | "preview_lista"
  | "publicada"
  | "cerrada_sin_hacer";

/**
 * Prioridad de fases (mayor = más avanzado). Al calcular la fase visible se elige
 * la señal aplicable con mayor prioridad, salvo `cerrada_sin_hacer`, que gana si
 * la petición quedó descartada (issue cerrada como not_planned o PR cerrado sin merge).
 */
export const PHASE_PRIORITY: Record<ProposalPhase, number> = {
  recibida: 1,
  aprobada: 2,
  en_curso: 3,
  pr_abierto: 4,
  ci_en_curso: 5,
  ci_con_fallos: 6,
  ci_correcta: 7,
  preview_lista: 8,
  publicada: 9,
  cerrada_sin_hacer: 10,
};

export function pickPhase(candidates: ProposalPhase[]): ProposalPhase {
  if (candidates.includes("cerrada_sin_hacer")) return "cerrada_sin_hacer";
  let best: ProposalPhase = "recibida";
  let score = PHASE_PRIORITY.recibida;
  for (const phase of candidates) {
    const value = PHASE_PRIORITY[phase] ?? 0;
    if (value > score) {
      score = value;
      best = phase;
    }
  }
  return best;
}
