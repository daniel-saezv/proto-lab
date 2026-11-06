export type HistoryEntry = {
  version: string;
  date: string;
  note: string;
};

export type CatalogEntry = {
  slug: string;
  title: string;
  description: string;
  author: string;
  date: string;
  tags: string[];
  cover: string | null;
  preview: string | null;
  previewHref: string | null;
  version: string;
  history: HistoryEntry[];
  href: string;
  /** Rutas relativas declaradas en proto.json para el puente de recursos privados. */
  assets: string[];
  /** Lista cerrada: `save`, `wasm`, `shared`, `tables` y permisos de dispositivo. */
  capabilities: string[];
  /** Permisos de dispositivo (subconjunto de capabilities). Lista cerrada. */
  permissions: string[];
  /** Plazo en milisegundos para la señal `ready`. */
  readyMs: number;
  /** Si es true, no aparece en selector, pizarra ni fallback (solo build y pruebas). */
  hidden?: boolean;
};

export type CatalogFile = {
  prototypes: CatalogEntry[];
};

export type ProposalDraft = {
  kind: "propuesta" | "iteracion";
  title: string;
  description: string;
  /** Obligatorio al enviar una propuesta nueva; no se usa en iteración. */
  author?: string;
  slug?: string;
};

export type SubmitOutcome =
  | { ok: true; issueUrl?: string }
  | {
      ok: false;
      error: "unauthorized" | "validation" | "limit" | "github" | "config" | "network" | "method";
      message?: string;
    };
