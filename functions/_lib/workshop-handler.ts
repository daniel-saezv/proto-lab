import { readAccessEmail } from "./access";
import type { KvLike, ProposalEnv } from "./handler";
import { jsonResponse } from "./http";
import { utcDay, validateProposal, type ValidProposal } from "./validate";
import {
  WORKSHOP_COPY,
  WORKSHOP_LIMITS,
  WORKSHOP_MODEL,
  WORKSHOP_STRICT_FINAL,
  WORKSHOP_STRICT_OPTIONS,
  buildWorkshopFinal,
  buildWorkshopRound,
  draftFromProposal,
  estimateNeurons,
  messageChars,
  parseWorkshopFinal,
  parseWorkshopOptions,
  strictWorkshopMessages,
  workshopModelText,
  workshopNeuronsKey,
  workshopPayloadShape,
  workshopRoundSpeech,
  workshopSessionKey,
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

type TurnDecision = "next" | "stop" | "retry";

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

function readList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string").slice(0, WORKSHOP_LIMITS.maxRounds * WORKSHOP_LIMITS.optionCount);
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
  const pending = readList(body.pending);
  body.pending = pending.length === WORKSHOP_LIMITS.optionCount ? pending : null;
  body.chosen = readList(body.chosen);
  body.rejected = readList(body.rejected);
  body.stage = body.stage === "final" ? "final" : "options";
  body.round = typeof body.round === "number" && body.round > 0 ? body.round : 0;
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

function pickBody(session: WorkshopSession, sessionId: string, options: string[]): Record<string, unknown> {
  return {
    ok: true,
    phase: "pick",
    sessionId,
    speech: workshopRoundSpeech(session.round),
    options,
    draft: publicDraft(session.current),
    original: publicDraft(session.original),
    round: session.round,
    maxRounds: WORKSHOP_LIMITS.maxRounds,
  };
}

function summaryBody(session: WorkshopSession): Record<string, unknown> {
  return {
    ok: true,
    phase: "summary",
    speech: WORKSHOP_COPY.summary,
    draft: publicDraft(session.current),
    original: publicDraft(session.original),
    round: session.round,
    maxRounds: WORKSHOP_LIMITS.maxRounds,
  };
}

function logWorkshop(event: string, detail: Record<string, string | number>): void {
  console.error(JSON.stringify({ source: "workshop", event, ...detail }));
}

function workshopErrorKind(error: unknown): string {
  if (!(error instanceof Error)) return "throw";
  if (error.message === "timeout") return "timeout";
  if (/json mode/i.test(error.message)) return "json-mode";
  return error.name || "throw";
}

async function callModel(ai: WorkshopAi, messages: WorkshopMessage[], retry: boolean): Promise<{
  text: string;
  shape: { kind: string; keys: string; response: string };
}> {
  const input: Record<string, unknown> = {
    messages,
    max_tokens: WORKSHOP_LIMITS.maxTokens,
    temperature: retry ? 0 : 0.6,
  };
  if (!retry) input.response_format = { type: "json_object" };
  const payload = await withTimeout(ai.run(WORKSHOP_MODEL, input), WORKSHOP_LIMITS.modelTimeoutMs);
  return { text: workshopModelText(payload), shape: workshopPayloadShape(payload) };
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

async function runModel<T>(
  ai: WorkshopAi,
  kv: KvLike,
  day: string,
  messages: WorkshopMessage[],
  strict: string,
  parse: (text: string) => T | null,
): Promise<{ ok: true; value: T } | { ok: false; thrown: boolean }> {
  try {
    const first = await callModel(ai, messages, false);
    const parsed = parse(first.text);
    if (parsed) return { ok: true, value: parsed };
    logWorkshop("bad-json", { attempt: 1, kind: first.shape.kind, keys: first.shape.keys, response: first.shape.response });
    const retryMessages = strictWorkshopMessages(messages, strict);
    const blocked = await neuronQuota(kv, day, retryMessages);
    if (blocked) return { ok: false, thrown: false };
    await spendNeurons(kv, day, retryMessages);
    const second = await callModel(ai, retryMessages, true);
    const again = parse(second.text);
    if (again) return { ok: true, value: again };
    logWorkshop("bad-json", { attempt: 2, kind: second.shape.kind, keys: second.shape.keys, response: second.shape.response });
    return { ok: false, thrown: false };
  } catch (error) {
    logWorkshop("model-error", { kind: workshopErrorKind(error) });
    return { ok: false, thrown: true };
  }
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
    return startSession(kv, env.AI, email, day, validated.value);
  }

  if (op === "turn") {
    const sessionId = typeof body.sessionId === "string" ? body.sessionId : "";
    const decision = body.decision;
    if (decision !== "next" && decision !== "stop" && decision !== "retry") {
      return fail(400, "validation", "No he entendido qué quieres hacer.");
    }
    const session = await readSession(kv, sessionId, email);
    if (!session) return restore(404, "session", WORKSHOP_COPY.session);
    return continueSession(kv, env.AI, email, day, sessionId, session, decision, body.picked, knownSlugs);
  }

  return fail(400, "validation", "No he entendido qué quieres hacer.");
}

async function startSession(
  kv: KvLike,
  ai: WorkshopAi,
  email: string,
  day: string,
  proposal: ValidProposal,
): Promise<Response> {
  const draft = draftFromProposal(proposal);
  const session: WorkshopSession = {
    email,
    original: draft,
    current: draft,
    round: 0,
    stage: "options",
    pending: null,
    chosen: [],
    rejected: [],
  };
  const sessionId = newSessionId();
  const offered = await offerRound(ai, kv, day, session, 1);
  if (!offered.ok) {
    if (offered.blocked) return offered.blocked;
    await writeSession(kv, sessionId, session);
    return fail(502, "model", WORKSHOP_COPY.model, { restore: false, sessionId, round: session.round });
  }
  await writeSession(kv, sessionId, session);
  return json(200, pickBody(session, sessionId, offered.options));
}

function readPicked(raw: unknown, pending: readonly string[]): string[] | null {
  if (raw == null) return [];
  if (!Array.isArray(raw)) return null;
  const wanted = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") return null;
    const match = pending.find((option) => option === item);
    if (!match) return null;
    wanted.add(match);
  }
  return pending.filter((option) => wanted.has(option));
}

function applyPicks(session: WorkshopSession, picked: readonly string[]): void {
  const chosen = new Set(picked);
  for (const option of picked) session.chosen.push(option);
  for (const option of session.pending ?? []) {
    if (!chosen.has(option)) session.rejected.push(option);
  }
  session.pending = null;
}

async function continueSession(
  kv: KvLike,
  ai: WorkshopAi,
  email: string,
  day: string,
  sessionId: string,
  session: WorkshopSession,
  decision: TurnDecision,
  pickedRaw: unknown,
  knownSlugs: readonly string[],
): Promise<Response> {
  if (decision === "retry") {
    if (session.stage === "final") return finishSession(kv, ai, email, day, sessionId, session, knownSlugs);
    const round = session.round > 0 ? session.round : 1;
    const offered = await offerRound(ai, kv, day, session, round);
    if (!offered.ok) return roundFailed(kv, sessionId, session, round, offered.blocked);
    await writeSession(kv, sessionId, session);
    return json(200, pickBody(session, sessionId, offered.options));
  }

  if (session.stage === "final" || !session.pending) {
    return fail(400, "validation", "No hay ideas que elegir.");
  }
  const picked = readPicked(pickedRaw, session.pending);
  if (!picked) return fail(400, "validation", "Elige solo entre las ideas de esta ronda.");
  applyPicks(session, picked);

  if (decision === "stop" || session.round >= WORKSHOP_LIMITS.maxRounds) {
    session.stage = "final";
    return finishSession(kv, ai, email, day, sessionId, session, knownSlugs);
  }

  const offered = await offerRound(ai, kv, day, session, session.round + 1);
  if (!offered.ok) return roundFailed(kv, sessionId, session, session.round + 1, offered.blocked);
  await writeSession(kv, sessionId, session);
  return json(200, pickBody(session, sessionId, offered.options));
}

async function roundFailed(
  kv: KvLike,
  sessionId: string,
  session: WorkshopSession,
  round: number,
  blocked: Response | null,
): Promise<Response> {
  if (blocked) {
    await deleteSession(kv, sessionId);
    return blocked;
  }
  session.round = round;
  session.stage = "options";
  session.pending = null;
  await writeSession(kv, sessionId, session);
  return fail(502, "model", WORKSHOP_COPY.model, { restore: false, sessionId, round });
}

async function offerRound(
  ai: WorkshopAi,
  kv: KvLike,
  day: string,
  session: WorkshopSession,
  round: number,
): Promise<{ ok: true; options: string[] } | { ok: false; blocked: Response | null }> {
  const messages = buildWorkshopRound({
    original: session.original,
    round,
    chosen: session.chosen,
    rejected: session.rejected,
  });
  const blocked = await neuronQuota(kv, day, messages);
  if (blocked) return { ok: false, blocked };
  await spendNeurons(kv, day, messages);
  const avoid = [...session.chosen, ...session.rejected];
  const spoken = await runModel(ai, kv, day, messages, WORKSHOP_STRICT_OPTIONS, (text) => parseWorkshopOptions(text, avoid));
  if (!spoken.ok) return { ok: false, blocked: null };
  session.round = round;
  session.stage = "options";
  session.pending = spoken.value;
  return { ok: true, options: spoken.value };
}

async function finishSession(
  kv: KvLike,
  ai: WorkshopAi,
  _email: string,
  day: string,
  sessionId: string,
  session: WorkshopSession,
  knownSlugs: readonly string[],
): Promise<Response> {
  const messages = buildWorkshopFinal({ original: session.original, chosen: session.chosen });
  const blocked = await neuronQuota(kv, day, messages);
  if (blocked) {
    await deleteSession(kv, sessionId);
    return blocked;
  }
  await spendNeurons(kv, day, messages);
  const spoken = await runModel(ai, kv, day, messages, WORKSHOP_STRICT_FINAL, (text) =>
    parseWorkshopFinal(text, session.original, knownSlugs),
  );
  if (!spoken.ok) {
    session.stage = "final";
    await writeSession(kv, sessionId, session);
    return fail(502, "model", WORKSHOP_COPY.model, { restore: false, sessionId, round: session.round });
  }
  session.current = { ...session.current, title: spoken.value.title, description: spoken.value.description };
  await deleteSession(kv, sessionId);
  return json(200, summaryBody(session));
}
