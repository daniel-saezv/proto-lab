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
  version: string;
  history: HistoryEntry[];
  href: string;
};

export type CatalogFile = {
  prototypes: CatalogEntry[];
};

export type ProposalDraft = {
  kind: "propuesta" | "iteracion";
  title: string;
  description: string;
  slug?: string;
};

export type SubmitOutcome =
  | { ok: true; issueUrl?: string }
  | {
      ok: false;
      error: "unauthorized" | "validation" | "limit" | "github" | "config" | "network" | "method";
      message?: string;
    };
