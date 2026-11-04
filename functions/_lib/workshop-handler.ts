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
  workshopCallsKey,
  workshopModelText,
  workshopNeuronsKey,
  workshopSessionKey,
  workshopSessionsKey,
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
  return body;
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

async function callModel(
  ai: WorkshopAi,
  messages: WorkshopMessage[],
): Promise<{ speech: string; change: WorkshopChange | null; ready: boolean } | null> {
  const payload = await withTimeout(
    ai.run(WORKSHOP_MODEL, {
      messages,
      max_tokens: WORKSHOP_LIMITS.maxTokens,
      temperature: 0.6,
      response_format: { type: "json_object" },
    }),
    WORKSHOP_LIMITS.modelTimeoutMs,
  );
  return parseWorkshopJson(workshopModelText(payload));
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

async function quotaBlock(kv: KvLike, email: string, day: string, messages: WorkshopMessage[]): Promise<Response | null> {
  const sessions = await readCount(kv, workshopSessionsKey(email, day));
  if (sessions >= WORKSHOP_LIMITS.maxSessionsPerDay) {
    return restore(429, "quota", WORKSHOP_COPY.quotaSessions);
  }
  const calls = await readCount(kv, workshopCallsKey(email, day));
  if (calls >= WORKSHOP_LIMITS.maxCallsPerDay) {
    return restore(429, "quota", WORKSHOP_COPY.quotaCalls);
  }
  const neurons = await readCount(kv, workshopNeuronsKey(day));
  const estimate = estimateNeurons(messageChars(messages));
  if (neurons + estimate > WORKSHOP_LIMITS.maxNeuronsPerDay) {
    return restore(429, "quota", WORKSHOP_COPY.quotaNeurons);
  }
  return null;
}

async function spendCall(kv: KvLike, email: string, day: string, messages: WorkshopMessage[]): Promise<void> {
  await addCount(kv, workshopCallsKey(email, day), 1);
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
  const blocked = await quotaBlock(kv, email, day, messages);
  if (blocked) return blocked;

  await addCount(kv, workshopSessionsKey(email, day), 1);
  await spendCall(kv, email, day, messages);

  const session: WorkshopSession = {
    email,
    original: draft,
    current: draft,
    turn: 0,
    pending: null,
    ready: false,
    rejection: null,
  };
  const sessionId = newSessionId();
  const spoken = await speak(ai, messages, session, knownSlugs, 1);
  if (!spoken.ok) {
    await writeSession(kv, sessionId, session);
    return fail(502, "model", WORKSHOP_COPY.model, { restore: false, sessionId, turn: 0 });
  }
  session.turn = spoken.view.turn;
  await writeSession(kv, sessionId, session);
  if (spoken.view.ready && !spoken.view.change) {
    await deleteSession(kv, sessionId);
    return json(200, summaryBody(session, spoken.view.speech));
  }
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

  if (decision === "accept") {
    if (!session.pending) return fail(400, "validation", "No hay un cambio pendiente.");
    session.current = {
      ...session.current,
      title: session.pending.title,
      description: session.pending.description,
    };
    session.pending = null;
    session.rejection = null;
    if (session.ready || session.turn >= WORKSHOP_LIMITS.maxTurns) {
      await deleteSession(kv, sessionId);
      return json(200, summaryBody(session, WORKSHOP_COPY.summary));
    }
  } else if (decision === "reject") {
    session.rejection = session.pending?.title ?? session.rejection;
    session.pending = null;
    if (session.ready || session.turn >= WORKSHOP_LIMITS.maxTurns) {
      await deleteSession(kv, sessionId);
      return json(200, summaryBody(session, WORKSHOP_COPY.summary));
    }
  } else if (decision === "retry") {
    if (session.turn >= WORKSHOP_LIMITS.maxTurns && session.pending == null && session.ready) {
      await deleteSession(kv, sessionId);
      return json(200, summaryBody(session, WORKSHOP_COPY.summary));
    }
  } else {
    const utterance = cleanUtterance(utteranceRaw);
    if (utterance.length < 1) return fail(400, "validation", "Dime algo, aunque sea corto.");
    if (session.turn >= WORKSHOP_LIMITS.maxTurns) {
      await deleteSession(kv, sessionId);
      return json(200, summaryBody(session, WORKSHOP_COPY.summary));
    }
    session.rejection = null;
    session.pending = null;
    const nextTurn = session.turn + 1;
    const messages = buildWorkshopMessages({
      original: session.original,
      current: session.current,
      turn: nextTurn,
      decision: { kind: decision, utterance },
    });
    const blocked = await callQuota(kv, email, day, messages);
    if (blocked) {
      await deleteSession(kv, sessionId);
      return blocked;
    }
    await spendCall(kv, email, day, messages);
    const spoken = await speak(ai, messages, session, knownSlugs, nextTurn);
    if (!spoken.ok) {
      await writeSession(kv, sessionId, session);
      return fail(502, "model", WORKSHOP_COPY.model, { restore: false, sessionId, turn: session.turn });
    }
    session.turn = nextTurn;
    await writeSession(kv, sessionId, session);
    if (spoken.view.ready && !spoken.view.change) {
      await deleteSession(kv, sessionId);
      return json(200, summaryBody(session, spoken.view.speech));
    }
    return json(200, turnBody({ phase: "turn", sessionId, ...spoken.view, draft: session.current, original: session.original }));
  }

  const nextTurn = session.turn + 1;
  const messages = buildWorkshopMessages({
    original: session.original,
    current: session.current,
    turn: nextTurn,
    decision: {
      kind: decision === "reject" ? "reject" : decision === "retry" ? "retry" : "accept",
      rejected: session.rejection ?? undefined,
    },
  });
  const blocked = await callQuota(kv, email, day, messages);
  if (blocked) {
    await deleteSession(kv, sessionId);
    return blocked;
  }
  await spendCall(kv, email, day, messages);
  const spoken = await speak(ai, messages, session, knownSlugs, nextTurn);
  if (!spoken.ok) {
    await writeSession(kv, sessionId, session);
    return fail(502, "model", WORKSHOP_COPY.model, { restore: false, sessionId, turn: session.turn });
  }
  session.turn = nextTurn;
  await writeSession(kv, sessionId, session);
  if (spoken.view.ready && !spoken.view.change) {
    await deleteSession(kv, sessionId);
    return json(200, summaryBody(session, spoken.view.speech));
  }
  return json(200, turnBody({ phase: "turn", sessionId, ...spoken.view, draft: session.current, original: session.original }));
}

async function callQuota(kv: KvLike, email: string, day: string, messages: WorkshopMessage[]): Promise<Response | null> {
  const calls = await readCount(kv, workshopCallsKey(email, day));
  if (calls >= WORKSHOP_LIMITS.maxCallsPerDay) return restore(429, "quota", WORKSHOP_COPY.quotaCalls);
  const neurons = await readCount(kv, workshopNeuronsKey(day));
  if (neurons + estimateNeurons(messageChars(messages)) > WORKSHOP_LIMITS.maxNeuronsPerDay) {
    return restore(429, "quota", WORKSHOP_COPY.quotaNeurons);
  }
  return null;
}

async function speak(
  ai: WorkshopAi,
  messages: WorkshopMessage[],
  session: WorkshopSession,
  knownSlugs: readonly string[],
  turn: number,
): Promise<{ ok: true; view: { speech: string; change: WorkshopChange | null; turn: number; ready: boolean } } | { ok: false }> {
  let parsed: { speech: string; change: WorkshopChange | null; ready: boolean } | null = null;
  let down = false;
  try {
    parsed = await callModel(ai, messages);
  } catch {
    down = true;
  }
  if (down) return { ok: false };
  const forcedReady = turn >= WORKSHOP_LIMITS.maxTurns;
  if (!parsed) {
    session.pending = null;
    session.ready = forcedReady;
    return {
      ok: true,
      view: { speech: WORKSHOP_COPY.badJson, change: null, turn, ready: forcedReady },
    };
  }
  const change = offerChange(parsed.change, session.current, knownSlugs);
  const ready = forcedReady || parsed.ready;
  session.pending = change;
  session.ready = ready;
  return { ok: true, view: { speech: parsed.speech, change, turn, ready } };
}
