import { LIMITS } from "./limits";

export const WORKSHOP_UI = {
  intro:
    "En tres rondas te propongo ideas para enriquecer la nota. Marca las que te gusten: una, varias o ninguna. Al final la dejo escrita para que la revises antes del {em}tablón{/em}.",
  thinking: "Estoy mirando la nota…",
  summarizing: "Estoy pasando a limpio lo que has elegido.",
  closed: "Esta charla ya se ha cerrado. Tu nota sigue como la dejaste.",
  config: "El escritorio está, pero la máquina no responde. Tu nota sigue igual.",
  failed: "La máquina no ha respondido. Puedes probar otra vez o seguir con tu nota.",
} as const;

export type WorkshopDraftView = {
  kind: "propuesta" | "iteracion";
  title: string;
  description: string;
  slug?: string;
};

export type WorkshopDecision = "next" | "stop" | "retry";

export type WorkshopRequest =
  | { op: "start"; draft: WorkshopDraftView }
  | { op: "turn"; sessionId: string; decision: WorkshopDecision; picked?: string[] }
  | { op: "abandon"; sessionId: string };

export type WorkshopOk = {
  ok: true;
  phase: "pick" | "summary";
  sessionId?: string;
  speech: string;
  options: string[];
  draft: WorkshopDraftView;
  original: WorkshopDraftView;
  round: number;
  maxRounds: number;
};

export type WorkshopFail = {
  ok: false;
  error: string;
  message: string;
  restore?: boolean;
  sessionId?: string;
};

export type WorkshopResult = WorkshopOk | WorkshopFail;

export type WorkshopTrailMark = {
  round: number;
  ideas: string[];
};

export type WorkshopScreen =
  | { kind: "intro" }
  | { kind: "loading"; purpose: "model" | "summary" }
  | { kind: "pick"; speech: string; options: string[]; round: number; maxRounds: number; trail: WorkshopTrailMark[] }
  | { kind: "failed"; message: string }
  | { kind: "summary"; speech: string; round: number; maxRounds: number };

export type WorkshopChoice = {
  id: string;
  label: string;
  /** Sigue en el árbol accesible, sin pintarse en la ronda. */
  quiet?: boolean;
};

export function workshopSpeech(screen: WorkshopScreen): string {
  if (screen.kind === "intro") return WORKSHOP_UI.intro;
  if (screen.kind === "loading") {
    if (screen.purpose === "summary") return WORKSHOP_UI.summarizing;
    return WORKSHOP_UI.thinking;
  }
  if (screen.kind === "failed") return screen.message;
  return screen.speech;
}

export const WORKSHOP_BEGIN_ID = "workshop-begin";

export function workshopTrailLine(ideas: readonly string[]): string {
  const clean = ideas.map((idea) => idea.trim()).filter(Boolean);
  if (clean.length === 0) return "Ninguna";
  return clean.join(" · ");
}

/** Marcas de rondas anteriores, en orden. */
export function workshopTrailBefore(trail: readonly WorkshopTrailMark[], round: number): WorkshopTrailMark[] {
  return trail.filter((mark) => mark.round < round).sort((a, b) => a.round - b.round);
}

export function rememberWorkshopPick(
  trail: readonly WorkshopTrailMark[],
  round: number,
  ideas: readonly string[],
): WorkshopTrailMark[] {
  const next = trail.filter((mark) => mark.round !== round);
  next.push({ round, ideas: [...ideas] });
  next.sort((a, b) => a.round - b.round);
  return next;
}

/** Cierre: una ronda, y cada idea en su propia línea. Vacío si no se marcó ninguna. */
export function workshopSummaryPicks(trail: readonly WorkshopTrailMark[]): Array<{ round: number; ideas: string[] }> {
  return [...trail]
    .sort((a, b) => a.round - b.round)
    .map((mark) => ({
      round: mark.round,
      ideas: mark.ideas.map((idea) => idea.trim()).filter(Boolean),
    }));
}

export function workshopCounter(round: number, maxRounds: number): string {
  return `Ronda ${round} de ${maxRounds}`;
}

export function workshopKindLabel(draft: { kind: "propuesta" | "iteracion"; slug?: string }): string {
  if (draft.kind === "iteracion") return `Iteración de ${draft.slug ?? "este prototipo"}`;
  return "Propuesta nueva";
}

export function workshopDiffLine(
  original: { title: string; description: string },
  current: { title: string; description: string },
): string {
  const title = original.title.trim() === current.title.trim() ? "El título sigue igual." : "El título ha cambiado.";
  const text =
    original.description.trim() === current.description.trim() ? "El texto sigue igual." : "El texto ha cambiado.";
  return `${title} ${text}`;
}

export function workshopSummaryError(title: string, description: string): string | null {
  const cleanTitle = title.trim().replace(/\s+/g, " ");
  const cleanBody = description.trim();
  if (cleanTitle.length < LIMITS.titleMin || cleanTitle.length > LIMITS.titleMax) {
    return "El título tiene que ir entre 3 y 80 caracteres.";
  }
  if (cleanBody.length < LIMITS.descriptionMin || cleanBody.length > LIMITS.descriptionMax) {
    return "El texto tiene que ir entre 10 y 2000 caracteres.";
  }
  return null;
}

export function workshopIntroChoices(): WorkshopChoice[] {
  return [
    { id: WORKSHOP_BEGIN_ID, label: "Empezar" },
    { id: "choice-workshop-back", label: "Volver a mi nota" },
  ];
}

export function workshopPickChoices(): WorkshopChoice[] {
  return [
    { id: "choice-workshop-next", label: "Seguir" },
    { id: "choice-workshop-stop", label: "Así está bien", quiet: true },
    { id: "choice-workshop-back", label: "Volver a mi nota", quiet: true },
  ];
}

export function workshopFailedChoices(): WorkshopChoice[] {
  return [
    { id: "choice-workshop-retry", label: "Probar otra vez" },
    { id: "choice-workshop-back", label: "Seguir con mi nota" },
  ];
}

export function workshopSummaryChoices(): WorkshopChoice[] {
  return [
    { id: "choice-workshop-submit", label: "Envíalo así" },
    { id: "choice-workshop-back", label: "Vuelve a mi nota" },
  ];
}

function isDraft(value: unknown): value is WorkshopDraftView {
  if (!value || typeof value !== "object") return false;
  const body = value as Record<string, unknown>;
  if (body.kind !== "propuesta" && body.kind !== "iteracion") return false;
  if (typeof body.title !== "string" || typeof body.description !== "string") return false;
  if (body.slug !== undefined && typeof body.slug !== "string") return false;
  return true;
}

function readOptions(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length !== 4) return null;
  const options: string[] = [];
  for (const item of value) {
    if (typeof item !== "string" || !item.trim()) return null;
    options.push(item);
  }
  return options;
}

export function readWorkshopResult(data: unknown): WorkshopResult | null {
  if (!data || typeof data !== "object") return null;
  const body = data as Record<string, unknown>;
  if (body.ok === false) {
    if (typeof body.error !== "string" || typeof body.message !== "string") return null;
    return {
      ok: false,
      error: body.error,
      message: body.message,
      ...(body.restore === true ? { restore: true } : {}),
      ...(typeof body.sessionId === "string" ? { sessionId: body.sessionId } : {}),
    };
  }
  if (body.ok !== true) return null;
  if (body.phase !== "pick" && body.phase !== "summary") return null;
  if (typeof body.speech !== "string" || !body.speech.trim()) return null;
  if (!isDraft(body.draft) || !isDraft(body.original)) return null;
  if (typeof body.round !== "number" || typeof body.maxRounds !== "number") return null;
  const options = body.phase === "pick" ? readOptions(body.options) : [];
  if (!options) return null;
  return {
    ok: true,
    phase: body.phase,
    ...(typeof body.sessionId === "string" ? { sessionId: body.sessionId } : {}),
    speech: body.speech,
    options,
    draft: {
      kind: body.draft.kind,
      title: body.draft.title,
      description: body.draft.description,
      ...(body.draft.slug ? { slug: body.draft.slug } : {}),
    },
    original: {
      kind: body.original.kind,
      title: body.original.title,
      description: body.original.description,
      ...(body.original.slug ? { slug: body.original.slug } : {}),
    },
    round: body.round,
    maxRounds: body.maxRounds,
  };
}
