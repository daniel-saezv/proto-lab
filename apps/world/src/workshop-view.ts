import { LIMITS } from "./limits";

/** Tope de lo que dice el amigo en un turno. Igual que el de la Function. */
export const WORKSHOP_UTTERANCE_MAX = 500;

export const WORKSHOP_UI = {
  intro:
    "Esto es para dejar la nota más clara antes del {em}tablón{/em}. Yo te propongo un retoque cada vez, o te pregunto lo que falta, y tú aceptas, rechazas o lo corriges. Como mucho cinco turnos. Cuando te valga, di que así está bien. No la envío hasta que lo digas.",
  thinking: "Estoy mirando la nota…",
  summarizing: "Estoy pasando a limpio el resumen.",
  needWords: "Dime algo, aunque sea corto.",
  closed: "Esta charla ya se ha cerrado. Tu nota sigue como la dejaste.",
  config: "El escritorio está, pero la máquina no responde. Tu nota sigue igual.",
  failed: "La máquina no ha respondido. Puedes probar otra vez o seguir con tu nota.",
} as const;

export type WorkshopChangeView = {
  title: string;
  description: string;
  why: string;
};

export type WorkshopDraftView = {
  kind: "propuesta" | "iteracion";
  title: string;
  description: string;
  slug?: string;
};

export type WorkshopDecision = "accept" | "reject" | "correct" | "reply" | "stop" | "retry";

export type WorkshopRequest =
  | { op: "start"; draft: WorkshopDraftView }
  | { op: "turn"; sessionId: string; decision: WorkshopDecision; utterance?: string }
  | { op: "abandon"; sessionId: string };

export type WorkshopOk = {
  ok: true;
  phase: "turn" | "summary";
  sessionId?: string;
  speech: string;
  change: WorkshopChangeView | null;
  draft: WorkshopDraftView;
  original: WorkshopDraftView;
  turn: number;
  maxTurns: number;
  ready: boolean;
};

export type WorkshopFail = {
  ok: false;
  error: string;
  message: string;
  restore?: boolean;
  sessionId?: string;
};

export type WorkshopResult = WorkshopOk | WorkshopFail;

export type WorkshopScreen =
  | { kind: "loading"; purpose: "model" | "summary" | "intro" }
  | { kind: "turn"; speech: string; change: WorkshopChangeView | null; turn: number; maxTurns: number }
  | { kind: "failed"; message: string }
  | { kind: "summary"; speech: string; turn: number; maxTurns: number };

export type WorkshopChoice = {
  id: string;
  label: string;
};

export function workshopSpeech(screen: WorkshopScreen): string {
  if (screen.kind === "loading") {
    if (screen.purpose === "summary") return WORKSHOP_UI.summarizing;
    if (screen.purpose === "intro") return WORKSHOP_UI.intro;
    return WORKSHOP_UI.thinking;
  }
  if (screen.kind === "failed") return screen.message;
  return screen.speech;
}

export function workshopCounter(turn: number, maxTurns: number): string {
  return `${turn} de ${maxTurns}`;
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

export function workshopTurnChoices(input: { hasChange: boolean }): WorkshopChoice[] {
  if (input.hasChange) {
    return [
      { id: "choice-workshop-accept", label: "Que entre en la nota" },
      { id: "choice-workshop-reject", label: "Que no entre" },
      { id: "choice-workshop-correct", label: "Lo corrijo yo" },
      { id: "choice-workshop-stop", label: "Así está bien" },
      { id: "choice-workshop-back", label: "Volver a mi nota" },
    ];
  }
  return [
    { id: "choice-workshop-say", label: "Contesto" },
    { id: "choice-workshop-stop", label: "Así está bien" },
    { id: "choice-workshop-back", label: "Volver a mi nota" },
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

function readChange(value: unknown): WorkshopChangeView | null | undefined {
  if (value == null) return null;
  if (!value || typeof value !== "object") return undefined;
  const body = value as Record<string, unknown>;
  if (typeof body.title !== "string" || typeof body.description !== "string") return undefined;
  if (body.why !== undefined && typeof body.why !== "string") return undefined;
  return { title: body.title, description: body.description, why: typeof body.why === "string" ? body.why : "" };
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
  if (body.phase !== "turn" && body.phase !== "summary") return null;
  if (typeof body.speech !== "string" || !body.speech.trim()) return null;
  if (!isDraft(body.draft) || !isDraft(body.original)) return null;
  if (typeof body.turn !== "number" || typeof body.maxTurns !== "number" || typeof body.ready !== "boolean") return null;
  const change = readChange(body.change);
  if (change === undefined) return null;
  return {
    ok: true,
    phase: body.phase,
    ...(typeof body.sessionId === "string" ? { sessionId: body.sessionId } : {}),
    speech: body.speech,
    change,
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
    turn: body.turn,
    maxTurns: body.maxTurns,
    ready: body.ready,
  };
}
