import { readAccessEmail } from "./access";
import type { KvLike, ProposalEnv } from "./handler";
import { jsonResponse } from "./http";
import { utcDay, validateProposal, type ValidProposal } from "./validate";
import {
  WORKSHOP_COPY,
  WORKSHOP_LIMITS,
  WORKSHOP_MODEL,
  buildWorkshopMessages,
  cleanUtterance,
  draftFromProposal,
  estimateNeurons,
  messageChars,
  parseWorkshopJson,
  strictWorkshopMessages,
  workshopModelText,
  workshopNeuronsKey,
  workshopPayloadShape,
  workshopSessionKey,
  type WorkshopChange,
  type WorkshopDraft,
  type WorkshopMessage,
  type WorkshopSession,
} from "./workshop";

export type WorkshopAi = {
  run(model: string, input: Record<string, unknown>): Promise<unknown>;
};

export type WorkshopEnv = ProposalEnv & {
  AI?: WorkshopAi;
};

export type WorkshopHandlerOptions = {
  knownSlugs?: readonly string[];
  now?: Date;
  fetchImpl?: typeof fetch;
};

type TurnDecision = "accept" | "reject" | "correct" | "reply" | "stop" | "retry";

function json(status: number, body: unknown): Response {
  return jsonResponse(status, body);
}

function fail(status: number, error: string, message: string, extra: Record<string, unknown> = {}): Response {
  return json(status, { ok: false, error, message, ...extra });
}

function restore(status: number, error: string, message: string): Response {
  return fail(status, error, message, { restore: true });
}

async function readCount(kv: KvLike, key: string): Promise<number> {
  const raw = await kv.get(key);
  const value = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

async function addCount(kv: KvLike, key: string, amount: number): Promise<number> {
  const next = (await readCount(kv, key)) + amount;
  await kv.put(key, String(next), { expirationTtl: WORKSHOP_LIMITS.quotaTtlSeconds });
  return next;
}

function newSessionId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error("model"));
      },
    );
  });
}

async function readSession(kv: KvLike, id: string, email: string): Promise<WorkshopSession | null> {
  if (!/^[0-9a-f]{32}$/.test(id)) return null;
  const raw = await kv.get(workshopSessionKey(id));
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const body = parsed as WorkshopSession;
  if (body.email !== email) return null;
  if (!body.original || !body.current) return null;
  body.history = readMemory(body.history);
  return body;
}

function readMemory(value: unknown): WorkshopSession["history"] {
  if (!Array.isArray(value)) return [];
  const turns: WorkshopSession["history"] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const entry = item as WorkshopSession["history"][number];
    if (typeof entry.speech !== "string" || typeof entry.turn !== "number") continue;
    const friend = entry.friend;
    const allowed =
      friend === "accept" || friend === "reject" || friend === "reply" || friend === "correct" || friend === "retry";
    turns.push({
      turn: entry.turn,
      speech: entry.speech,
      proposal: typeof entry.proposal === "string" ? entry.proposal : null,
      friend: allowed ? friend : null,
      said: typeof entry.said === "string" ? entry.said : null,
    });
  }
  return turns;
}

function rememberInventor(session: WorkshopSession, turn: number, speech: string, proposal: string | null): void {
  session.history.push({ turn, speech, proposal, friend: null, said: null });
}

function rememberFriend(
  session: WorkshopSession,
  friend: NonNullable<WorkshopSession["history"][number]["friend"]>,
  said: string | null,
): void {
  const last = session.history.at(-1);
  if (!last || last.friend) {
    session.history.push({ turn: session.turn, speech: "", proposal: null, friend, said });
    return;
  }
  last.friend = friend;
  last.said = said;
}

async function writeSession(kv: KvLike, id: string, session: WorkshopSession): Promise<void> {
  await kv.put(workshopSessionKey(id), JSON.stringify(session), { expirationTtl: WORKSHOP_LIMITS.sessionTtlSeconds });
}

async function deleteSession(kv: KvLike, id: string): Promise<void> {
  await kv.delete?.(workshopSessionKey(id));
}

function publicDraft(draft: WorkshopDraft): WorkshopDraft {
  return {
    kind: draft.kind,
    title: draft.title,
    description: draft.description,
    ...(draft.slug ? { slug: draft.slug } : {}),
  };
}

function turnBody(input: {
  phase: "turn" | "summary";
  sessionId?: string;
  speech: string;
  change: WorkshopChange | null;
  draft: WorkshopDraft;
  original: WorkshopDraft;
  turn: number;
  ready: boolean;
}): Record<string, unknown> {
  return {
    ok: true,
    phase: input.phase,
    ...(input.sessionId ? { sessionId: input.sessionId } : {}),
    speech: input.speech,
    change: input.change,
    draft: publicDraft(input.draft),
    original: publicDraft(input.original),
    turn: input.turn,
    maxTurns: WORKSHOP_LIMITS.maxTurns,
    ready: input.ready,
  };
}

function summaryBody(session: WorkshopSession, speech: string): Record<string, unknown> {
  return turnBody({
    phase: "summary",
    speech,
    change: null,
    draft: session.current,
    original: session.original,
    turn: session.turn,
    ready: true,
  });
}

type ModelRead = {
  parsed: { speech: string; change: WorkshopChange | null; ready: boolean } | null;
  shape: { kind: string; keys: string; response: string };
};

function logWorkshop(event: string, detail: Record<string, string | number>): void {
  console.error(JSON.stringify({ source: "workshop", event, ...detail }));
}

function workshopErrorKind(error: unknown): string {
  if (!(error instanceof Error)) return "throw";
  if (error.message === "timeout") return "timeout";
  if (/json mode/i.test(error.message)) return "json-mode";
  return error.name || "throw";
}

async function callModel(ai: WorkshopAi, messages: WorkshopMessage[], retry: boolean): Promise<ModelRead> {
  const input: Record<string, unknown> = {
    messages,
    max_tokens: WORKSHOP_LIMITS.maxTokens,
    temperature: retry ? 0 : 0.6,
  };
  if (!retry) input.response_format = { type: "json_object" };
  const payload = await withTimeout(ai.run(WORKSHOP_MODEL, input), WORKSHOP_LIMITS.modelTimeoutMs);
  return { parsed: parseWorkshopJson(workshopModelText(payload)), shape: workshopPayloadShape(payload) };
}

function offerChange(
  change: WorkshopChange | null,
  current: WorkshopDraft,
  knownSlugs: readonly string[],
): WorkshopChange | null {
  if (!change) return null;
  const candidate = {
    kind: current.kind,
    title: change.title,
    description: change.description,
    ...(current.slug ? { slug: current.slug } : {}),
  };
  const validated = validateProposal(candidate, knownSlugs);
  if (!validated.ok) return null;
  return {
    title: validated.value.title,
    description: validated.value.description,
    why: change.why,
  };
}

export async function handleWorkshop(
  request: Request,
  env: WorkshopEnv,
  options: WorkshopHandlerOptions = {},
): Promise<Response> {
  if (request.method !== "POST") {
    return fail(405, "method", "Solo se acepta POST.");
  }

  const email = await readAccessEmail(request, env, options.fetchImpl ?? fetch);
  if (!email) {
    return restore(401, "unauthorized", "No hay una sesión de Cloudflare Access.");
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return fail(400, "validation", "La nota tiene que ir en JSON.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(await request.text());
  } catch {
    return fail(400, "validation", "No he podido leer la nota.");
  }
  if (!parsed || typeof parsed !== "object") {
    return fail(400, "validation", "No he podido leer la nota.");
  }
  const body = parsed as Record<string, unknown>;
  const op = body.op;
  const kv = env.PROPOSALS;
  const knownSlugs = options.knownSlugs ?? [];
  const now = options.now ?? new Date();
  const day = utcDay(now);

  if (op === "abandon") {
    if (!kv?.delete) return restore(503, "config", WORKSHOP_COPY.config);
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const session = await readSession(kv, sessionId, email).catch(() => null);
    if (session) await deleteSession(kv, sessionId);
    return json(200, { ok: true });
  }

  if (!kv?.delete || !env.AI) {
    return restore(503, "config", WORKSHOP_COPY.config);
  }

  if (op === "start") {
    const validated = validateProposal(body.draft, knownSlugs);
    if (!validated.ok) return restore(400, "validation", validated.message);
    return startSession(kv, env.AI, email, day, validated.value, knownSlugs);
  }

  if (op === "turn") {
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const decision = body.decision;
    if (
      decision !== "accept" &&
      decision !== "reject" &&
      decision !== "correct" &&
      decision !== "reply" &&
      decision !== "stop" &&
      decision !== "retry"
    ) {
      return fail(400, "validation", "No he entendido qué quieres hacer.");
    }
    const session = await readSession(kv, sessionId, email);
    if (!session) return restore(404, "session", WORKSHOP_COPY.session);
    return continueSession(kv, env.AI, email, day, sessionId, session, decision, body.utterance, knownSlugs);
  }

  return fail(400, "validation", "No he entendido qué quieres hacer.");
}

async function neuronQuota(kv: KvLike, day: string, messages: WorkshopMessage[]): Promise<Response | null> {
  const neurons = await readCount(kv, workshopNeuronsKey(day));
  if (neurons + estimateNeurons(messageChars(messages)) > WORKSHOP_LIMITS.maxNeuronsPerDay) {
    return restore(429, "quota", WORKSHOP_COPY.quotaNeurons);
  }
  return null;
}

async function spendNeurons(kv: KvLike, day: string, messages: WorkshopMessage[]): Promise<void> {
  await addCount(kv, workshopNeuronsKey(day), estimateNeurons(messageChars(messages)));
}

async function startSession(
  kv: KvLike,
  ai: WorkshopAi,
  email: string,
  day: string,
  proposal: ValidProposal,
  knownSlugs: readonly string[],
): Promise<Response> {
  const draft = draftFromProposal(proposal);
  const messages = buildWorkshopMessages({ original: draft, current: draft, turn: 1 });
  const blocked = await neuronQuota(kv, day, messages);
  if (blocked) return blocked;

  await spendNeurons(kv, day, messages);

  const session: WorkshopSession = {
    email,
    original: draft,
    current: draft,
    turn: 0,
    pending: null,
    ready: false,
    rejection: null,
    history: [],
  };
  const sessionId = newSessionId();
  const spoken = await speak(ai, messages, session, knownSlugs, 1, kv, day);
  if (!spoken.ok) {
    await writeSession(kv, sessionId, session);
    return fail(502, "model", WORKSHOP_COPY.model, { restore: false, sessionId, turn: 0 });
  }
  session.turn = spoken.view.turn;
  await writeSession(kv, sessionId, session);
  return json(200, turnBody({ phase: "turn", sessionId, ...spoken.view, draft: session.current, original: session.original }));
}

async function continueSession(
  kv: KvLike,
  ai: WorkshopAi,
  email: string,
  day: string,
  sessionId: string,
  session: WorkshopSession,
  decision: TurnDecision,
  utteranceRaw: unknown,
  knownSlugs: readonly string[],
): Promise<Response> {
  if (decision === "stop") {
    await deleteSession(kv, sessionId);
    return json(200, summaryBody(session, WORKSHOP_COPY.summary));
  }

  const utterance = decision === "reply" || decision === "correct" ? cleanUtterance(utteranceRaw) : "";
  if ((decision === "reply" || decision === "correct") && utterance.length < 1) {
    return fail(400, "validation", "Dime algo, aunque sea corto.");
  }
  rememberFriend(session, decision, utterance || null);

  if (decision === "accept") {
    if (!session.pending) return fail(400, "validation", "No hay un cambio pendiente.");
    session.current = {
      ...session.current,
      title: session.pending.title,
      description: session.pending.description,
    };
    session.pending = null;
    session.rejection = null;
  } else if (decision === "reject") {
    session.rejection = session.pending?.title ?? session.rejection;
    session.pending = null;
  } else if (decision !== "retry") {
    session.rejection = null;
    session.pending = null;
  }

  if (session.turn >= WORKSHOP_LIMITS.maxTurns) {
    await deleteSession(kv, sessionId);
    const speech = utterance ? `${WORKSHOP_COPY.summary} Has dejado esto: «${utterance}».` : WORKSHOP_COPY.summary;
    return json(200, summaryBody(session, speech));
  }

  const nextTurn = session.turn + 1;
  const messages = buildWorkshopMessages({
    original: session.original,
    current: session.current,
    turn: nextTurn,
    history: session.history,
    decision: {
      kind: decision,
      utterance: utterance || undefined,
      rejected: session.rejection ?? undefined,
    },
  });
  const blocked = await neuronQuota(kv, day, messages);
  if (blocked) {
    await deleteSession(kv, sessionId);
    return blocked;
  }
  await spendNeurons(kv, day, messages);
  const spoken = await speak(ai, messages, session, knownSlugs, nextTurn, kv, day);
  if (!spoken.ok) {
    await writeSession(kv, sessionId, session);
    return fail(502, "model", WORKSHOP_COPY.model, { restore: false, sessionId, turn: session.turn });
  }
  session.turn = nextTurn;
  await writeSession(kv, sessionId, session);
  return json(200, turnBody({ phase: "turn", sessionId, ...spoken.view, draft: session.current, original: session.original }));
}

async function speak(
  ai: WorkshopAi,
  messages: WorkshopMessage[],
  session: WorkshopSession,
  knownSlugs: readonly string[],
  turn: number,
  kv: KvLike,
  day: string,
): Promise<{ ok: true; view: { speech: string; change: WorkshopChange | null; turn: number; ready: boolean } } | { ok: false }> {
  let parsed: { speech: string; change: WorkshopChange | null; ready: boolean } | null = null;
  try {
    const first = await callModel(ai, messages, false);
    parsed = first.parsed;
    if (!parsed) {
      logWorkshop("bad-json", { attempt: 1, kind: first.shape.kind, keys: first.shape.keys, response: first.shape.response });
      const retryMessages = strictWorkshopMessages(messages);
      const blocked = await neuronQuota(kv, day, retryMessages);
      if (!blocked) {
        await spendNeurons(kv, day, retryMessages);
        const second = await callModel(ai, retryMessages, true);
        parsed = second.parsed;
        if (!parsed) {
          logWorkshop("bad-json", {
            attempt: 2,
            kind: second.shape.kind,
            keys: second.shape.keys,
            response: second.shape.response,
          });
        }
      }
    }
  } catch (error) {
    logWorkshop("model-error", { kind: workshopErrorKind(error) });
    return { ok: false };
  }
  if (!parsed) {
    session.pending = null;
    session.ready = false;
    rememberInventor(session, turn, WORKSHOP_COPY.badJson, null);
    return {
      ok: true,
      view: { speech: WORKSHOP_COPY.badJson, change: null, turn, ready: false },
    };
  }
  const change = offerChange(parsed.change, session.current, knownSlugs);
  session.pending = change;
  session.ready = false;
  rememberInventor(session, turn, parsed.speech, change?.title ?? null);
  return { ok: true, view: { speech: parsed.speech, change, turn, ready: false } };
}
