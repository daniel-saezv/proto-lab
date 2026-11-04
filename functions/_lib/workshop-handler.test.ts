import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { installAccessKeysForTests, resetAccessCertsForTests } from "./access";
import { accessClaims, createAccessFixture, type AccessFixture } from "./access-fixture";
import type { KvLike } from "./handler";
import {
  WORKSHOP_COPY,
  WORKSHOP_LIMITS,
  WORKSHOP_MODEL,
  WORKSHOP_STRICT_OPTIONS,
  buildWorkshopRound,
  estimateNeurons,
  messageChars,
  strictWorkshopMessages,
  workshopNeuronsKey,
  workshopSessionKey,
} from "./workshop";
import { handleWorkshop, type WorkshopAi, type WorkshopEnv } from "./workshop-handler";

const EMAIL = "taller-secreto@example.com";
const OTHER = "otra-persona@example.com";
const NOW = new Date("2026-11-03T12:00:00Z");
const DAY = "2026-11-03";

const proposal = {
  kind: "propuesta",
  title: "Cometa lunar",
  description: "Un juego corto en el que persigues una cometa con el dedo.",
};

const finances = {
  kind: "propuesta",
  title: "Una aplicación para llevar mis finanzas",
  description: "Quiero anotar lo que gasto y ver lo que me queda.",
};

const roundA = [
  "¿Y si permitiera guardar tus tarjetas virtuales?",
  "¿Y si pudieras hacer pagos directos desde ella?",
  "¿Y si avisara cuando te pasas de un tope?",
  "¿Y si separara lo fijo de lo que varía cada mes?",
];

const roundB = [
  "¿Y si mostrara lo que queda al cierre del mes?",
  "¿Y si agrupara los gastos por semana?",
  "¿Y si dejaras una nota en cada apunte?",
  "¿Y si vieras solo lo de este mes?",
];

function memoryKv(): KvLike & { store: Map<string, string>; ttls: Map<string, number | undefined> } {
  const store = new Map<string, string>();
  const ttls = new Map<string, number | undefined>();
  return {
    store,
    ttls,
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value, options) {
      store.set(key, value);
      ttls.set(key, options?.expirationTtl);
    },
    async delete(key) {
      store.delete(key);
      ttls.delete(key);
    },
  };
}

function optionsReply(options: string[]) {
  return { response: { options } };
}

let fixture: AccessFixture;
const signed = new Map<string, string>();

beforeAll(async () => {
  fixture = await createAccessFixture();
  installAccessKeysForTests([fixture.publicJwk]);
  for (const email of [EMAIL, OTHER]) signed.set(email, await fixture.sign(accessClaims(email, fixture.aud)));
});

afterAll(() => {
  resetAccessCertsForTests();
});

function request(body: unknown, email = EMAIL): Request {
  return new Request("https://proto-lab.example/api/workshop", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Cf-Access-Jwt-Assertion": signed.get(email) ?? "",
    },
    body: JSON.stringify(body),
  });
}

function aiOf(payload: unknown | ((input: Record<string, unknown>) => unknown)): WorkshopAi & { calls: Record<string, unknown>[] } {
  const calls: Record<string, unknown>[] = [];
  return {
    calls,
    async run(model, input) {
      calls.push({ model, input });
      if (typeof payload === "function") return payload(input);
      return payload;
    },
  };
}

function envOf(kv: KvLike, ai: WorkshopAi | undefined): WorkshopEnv {
  return { CF_ACCESS_AUD: fixture.aud, PROPOSALS: kv, AI: ai };
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

function userText(call: unknown): string {
  const messages = (call as { input: { messages: { content: string }[] } }).input.messages;
  return messages.map((message) => message.content).join("\n");
}

describe("POST /api/workshop", () => {
  it("arranca una ronda de cuatro ideas sin tocar el cupo de propuestas ni llamar a GitHub", async () => {
    const kv = memoryKv();
    const ai = aiOf(optionsReply(roundA));
    const fetches: string[] = [];
    const response = await handleWorkshop(request({ op: "start", draft: finances }), envOf(kv, ai), {
      knownSlugs: [],
      now: NOW,
      fetchImpl: (input) => {
        fetches.push(String(input));
        throw new Error("red");
      },
    });
    expect(response.status).toBe(200);
    const body = await bodyOf(response);
    expect(body.ok).toBe(true);
    expect(body.phase).toBe("pick");
    expect(body.round).toBe(1);
    expect(body.maxRounds).toBe(3);
    expect(body.options).toEqual(roundA);
    expect(JSON.stringify(body)).not.toContain(EMAIL);
    const draft = body.draft as { title: string; kind: string };
    expect(draft.title).toBe(finances.title);
    expect(draft.kind).toBe("propuesta");
    expect(body.change).toBeUndefined();
    expect(fetches).toEqual([]);
    expect([...kv.store.keys()].some((key) => key.startsWith("proposals:"))).toBe(false);
    expect([...kv.store.keys()].some((key) => key.includes(":sessions:") || key.includes(":calls:"))).toBe(false);
    expect(kv.ttls.get(workshopNeuronsKey(DAY))).toBe(WORKSHOP_LIMITS.quotaTtlSeconds);
    const sessionId = body.sessionId as string;
    expect(kv.ttls.get(workshopSessionKey(sessionId))).toBe(WORKSHOP_LIMITS.sessionTtlSeconds);
    const call = ai.calls[0] as { model: string; input: Record<string, unknown> };
    expect(call.model).toBe(WORKSHOP_MODEL);
    expect(call.input.tools).toBeUndefined();
    expect(call.input.max_tokens).toBe(WORKSHOP_LIMITS.maxTokens);
    expect(call.input.response_format).toEqual({ type: "json_object" });
    expect(ai.calls).toHaveLength(1);
  });

  it("en el start lee el objeto response del modo JSON", async () => {
    const kv = memoryKv();
    const ai = aiOf(optionsReply(roundA));
    const body = await bodyOf(
      await handleWorkshop(request({ op: "start", draft: finances }), envOf(kv, ai), { now: NOW }),
    );
    expect(body.phase).toBe("pick");
    expect(body.options).toEqual(roundA);
    expect(body.draft).toEqual(finances);
    expect(ai.calls).toHaveLength(1);
    const call = ai.calls[0] as { input: Record<string, unknown> };
    expect(call.input.response_format).toEqual({ type: "json_object" });
    expect(Number(kv.store.get(workshopNeuronsKey(DAY)))).toBeGreaterThan(0);
    expect([...kv.store.keys()].some((key) => key.includes(":calls:"))).toBe(false);
  });

  it("la ronda siguiente recibe lo elegido y lo descartado, y el cierre solo integra lo elegido", async () => {
    const kv = memoryKv();
    const finalTitle = "Finanzas con tarjetas";
    const finalText = "Anoto lo que gasto, veo lo que me queda y guardo tarjetas virtuales.";
    const ai = aiOf((input: Record<string, unknown>) => {
      const system = ((input.messages as { content: string }[])[0]?.content ?? "");
      if (system.includes("título y un texto")) {
        return { response: { title: finalTitle, description: finalText } };
      }
      const user = (input.messages as { content: string }[]).map((message) => message.content).join("\n");
      return optionsReply(user.includes("tarjetas virtuales") ? roundB : roundA);
    });
    const started = await bodyOf(
      await handleWorkshop(request({ op: "start", draft: finances }), envOf(kv, ai), { now: NOW }),
    );
    expect(started.phase).toBe("pick");
    expect(started.options).toEqual(roundA);
    const next = await bodyOf(
      await handleWorkshop(
        request({ op: "turn", sessionId: started.sessionId, decision: "next", picked: [roundA[0]] }),
        envOf(kv, ai),
        { now: NOW },
      ),
    );
    expect(next.phase).toBe("pick");
    expect(next.round).toBe(2);
    expect(next.options).toEqual(roundB);
    expect(userText(ai.calls[1])).toContain(roundA[0]);
    expect(userText(ai.calls[1])).toContain(roundA[1]);
    expect(userText(ai.calls[1])).toContain("No repitas");
    const stopped = await bodyOf(
      await handleWorkshop(
        request({ op: "turn", sessionId: started.sessionId, decision: "stop", picked: [roundB[0]] }),
        envOf(kv, ai),
        { now: NOW },
      ),
    );
    expect(stopped.phase).toBe("summary");
    expect((stopped.draft as { title: string; description: string; kind: string }).title).toBe(finalTitle);
    expect((stopped.draft as { description: string }).description).toBe(finalText);
    expect((stopped.draft as { kind: string }).kind).toBe("propuesta");
    const closing = userText(ai.calls[2]);
    expect(closing).toContain(roundA[0]);
    expect(closing).toContain(roundB[0]);
    expect(closing).toContain(finances.description);
    expect(closing).not.toContain(roundA[1]);
    expect(closing).not.toContain("descartó");
    expect(kv.store.has(workshopSessionKey(String(started.sessionId)))).toBe(false);
    expect(ai.calls).toHaveLength(3);
  });

  it("un json roto reintenta una sola vez y, si sigue ilegible, guarda la sesión", async () => {
    const kv = memoryKv();
    const ai = aiOf({ response: "no es json" });
    const logged: string[] = [];
    const spy = vi.spyOn(console, "error").mockImplementation((line?: unknown) => {
      logged.push(String(line));
    });
    const response = await handleWorkshop(request({ op: "start", draft: finances }), envOf(kv, ai), { now: NOW });
    spy.mockRestore();
    expect(response.status).toBe(502);
    const body = await bodyOf(response);
    expect(body.restore).toBe(false);
    expect(body.phase).toBeUndefined();
    expect(ai.calls).toHaveLength(2);
    const second = ai.calls[1] as { input: Record<string, unknown> };
    expect(second.input.response_format).toBeUndefined();
    expect(second.input.temperature).toBe(0);
    const messages = second.input.messages as { content: string }[];
    expect(messages.at(-1)?.content).toContain("no era un JSON");
    expect(messages.at(-1)?.content).toBe(WORKSHOP_STRICT_OPTIONS);
    const spent = Number(kv.store.get(workshopNeuronsKey(DAY)));
    expect(spent).toBeGreaterThan(estimateNeurons(0));
    expect(kv.store.has(workshopSessionKey(String(body.sessionId)))).toBe(true);
    expect([...kv.store.keys()].some((key) => key.includes(":calls:"))).toBe(false);
    const log = logged.join("\n");
    expect(log).toContain("bad-json");
    expect(log).not.toContain("finanzas");
    expect(log).not.toContain(EMAIL);
    expect(log).not.toContain("no es json");
  });

  it("el reintento acepta un bloque con valla y no hace una tercera llamada", async () => {
    const kv = memoryKv();
    const payloads = [
      { response: "no es json, lo siento" },
      { response: "```json\n" + JSON.stringify({ options: roundA }) + "\n```\n{\"options\":[\"otra\"]}" },
    ];
    let n = 0;
    const ai = aiOf(() => payloads[n++] ?? { response: "tercera llamada" });
    const body = await bodyOf(
      await handleWorkshop(request({ op: "start", draft: finances }), envOf(kv, ai), { now: NOW }),
    );
    expect(body.phase).toBe("pick");
    expect(body.options).toEqual(roundA);
    expect(body.round).toBe(1);
    expect(ai.calls).toHaveLength(2);
    expect(Number(kv.store.get(workshopNeuronsKey(DAY)))).toBeGreaterThan(estimateNeurons(0));
  });

  it("no reintenta si las neuronas que quedan no cubren la segunda reserva", async () => {
    const kv = memoryKv();
    const draft = { kind: "propuesta" as const, title: finances.title, description: finances.description };
    const messages = buildWorkshopRound({ original: draft, round: 1, chosen: [], rejected: [] });
    const first = estimateNeurons(messageChars(messages));
    kv.store.set(workshopNeuronsKey(DAY), String(WORKSHOP_LIMITS.maxNeuronsPerDay - first));
    const ai = aiOf({ response: "no es json" });
    const response = await handleWorkshop(request({ op: "start", draft: finances }), envOf(kv, ai), { now: NOW });
    expect(response.status).toBe(502);
    expect(ai.calls).toHaveLength(1);
    expect(kv.store.get(workshopNeuronsKey(DAY))).toBe(String(WORKSHOP_LIMITS.maxNeuronsPerDay));
    expect(messageChars(strictWorkshopMessages(messages, WORKSHOP_STRICT_OPTIONS))).toBeGreaterThan(messageChars(messages));
  });

  it("rechaza una decisión del flujo anterior y una idea que no está en la ronda", async () => {
    const kv = memoryKv();
    const ai = aiOf(optionsReply(roundA));
    const started = await bodyOf(
      await handleWorkshop(request({ op: "start", draft: proposal }), envOf(kv, ai), { now: NOW }),
    );
    const old = await handleWorkshop(
      request({ op: "turn", sessionId: started.sessionId, decision: "accept" }),
      envOf(kv, ai),
      { now: NOW },
    );
    expect(old.status).toBe(400);
    const foreignIdea = await handleWorkshop(
      request({ op: "turn", sessionId: started.sessionId, decision: "next", picked: ["¿Y si inventara otra aplicación?"] }),
      envOf(kv, ai),
      { now: NOW },
    );
    expect(foreignIdea.status).toBe(400);
    expect(ai.calls).toHaveLength(1);
    expect(kv.store.has(workshopSessionKey(String(started.sessionId)))).toBe(true);
  });

  it("aísla la sesión por persona y la borra al abandonar", async () => {
    const kv = memoryKv();
    const ai = aiOf(optionsReply(roundA));
    const started = await bodyOf(
      await handleWorkshop(request({ op: "start", draft: proposal }), envOf(kv, ai), { now: NOW }),
    );
    const foreign = await handleWorkshop(
      request({ op: "turn", sessionId: started.sessionId, decision: "stop", picked: [roundA[0]] }, OTHER),
      envOf(kv, ai),
      { now: NOW },
    );
    expect(foreign.status).toBe(404);
    expect(kv.store.has(workshopSessionKey(String(started.sessionId)))).toBe(true);
    const abandoned = await handleWorkshop(
      request({ op: "abandon", sessionId: started.sessionId }),
      envOf(kv, ai),
      { now: NOW },
    );
    expect(abandoned.status).toBe(200);
    expect(kv.store.has(workshopSessionKey(String(started.sessionId)))).toBe(false);
  });

  it("ignora un contador viejo de sesiones o de llamadas", async () => {
    const kv = memoryKv();
    kv.store.set(`workshop:sessions:${encodeURIComponent(EMAIL)}:${DAY}`, "9");
    kv.store.set(`workshop:calls:${encodeURIComponent(EMAIL)}:${DAY}`, "40");
    const ai = aiOf(optionsReply(roundA));
    const response = await handleWorkshop(request({ op: "start", draft: proposal }), envOf(kv, ai), { now: NOW });
    expect(response.status).toBe(200);
    expect(ai.calls).toHaveLength(1);
    expect(kv.store.get(`workshop:sessions:${encodeURIComponent(EMAIL)}:${DAY}`)).toBe("9");
    expect(kv.store.get(`workshop:calls:${encodeURIComponent(EMAIL)}:${DAY}`)).toBe("40");
  });

  it("frena las neuronas globales antes de la llamada y devuelve la nota", async () => {
    const kv = memoryKv();
    kv.store.set(workshopNeuronsKey(DAY), "7990");
    const ai = aiOf(optionsReply(roundA));
    const response = await handleWorkshop(request({ op: "start", draft: proposal }), envOf(kv, ai), { now: NOW });
    expect(response.status).toBe(429);
    const body = await bodyOf(response);
    expect(body.restore).toBe(true);
    expect(body.error).toBe("quota");
    expect(body.message).toBe(WORKSHOP_COPY.quotaNeurons);
    expect(ai.calls).toHaveLength(0);
    expect([...kv.store.keys()].some((key) => key.startsWith("workshop:s:"))).toBe(false);
  });

  it("al llenarse las neuronas a mitad de charla cierra la sesión para volver a la nota", async () => {
    const kv = memoryKv();
    const ai = aiOf(optionsReply(roundA));
    const started = await bodyOf(
      await handleWorkshop(request({ op: "start", draft: finances }), envOf(kv, ai), { now: NOW }),
    );
    kv.store.set(workshopNeuronsKey(DAY), String(WORKSHOP_LIMITS.maxNeuronsPerDay));
    const response = await handleWorkshop(
      request({ op: "turn", sessionId: started.sessionId, decision: "next", picked: [roundA[0]] }),
      envOf(kv, ai),
      { now: NOW },
    );
    expect(response.status).toBe(429);
    const body = await bodyOf(response);
    expect(body.restore).toBe(true);
    expect(body.message).toBe(WORKSHOP_COPY.quotaNeurons);
    expect(kv.store.has(workshopSessionKey(String(started.sessionId)))).toBe(false);
    expect(ai.calls).toHaveLength(1);
  });

  it("si falta el binding no gasta cupo", async () => {
    const kv = memoryKv();
    const response = await handleWorkshop(request({ op: "start", draft: proposal }), envOf(kv, undefined), { now: NOW });
    expect(response.status).toBe(503);
    expect((await bodyOf(response)).restore).toBe(true);
    expect(kv.store.size).toBe(0);
  });

  it("una caída del modelo deja la sesión para probar otra vez", async () => {
    const kv = memoryKv();
    const ai: WorkshopAi & { calls: number } = {
      calls: 0,
      async run() {
        this.calls += 1;
        throw new Error("caída");
      },
    };
    const response = await handleWorkshop(request({ op: "start", draft: proposal }), envOf(kv, ai), { now: NOW });
    expect(response.status).toBe(502);
    const body = await bodyOf(response);
    expect(body.restore).toBe(false);
    expect(typeof body.sessionId).toBe("string");
    const stored = JSON.parse(kv.store.get(workshopSessionKey(String(body.sessionId))) ?? "{}") as { round: number };
    expect(stored.round).toBe(0);
    expect(ai.calls).toBe(1);
    expect(Number(kv.store.get(workshopNeuronsKey(DAY)))).toBeGreaterThan(0);
    expect([...kv.store.keys()].some((key) => key.includes(":calls:"))).toBe(false);
  });

  it("la espera del modelo no cuenta como CPU del worker", async () => {
    const kv = memoryKv();
    const ai: WorkshopAi = {
      async run() {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return optionsReply(roundA);
      },
    };
    const before = process.cpuUsage();
    const start = performance.now();
    const response = await handleWorkshop(request({ op: "start", draft: proposal }), envOf(kv, ai), { now: NOW });
    const cpu = process.cpuUsage(before);
    const wall = performance.now() - start;
    expect(response.status).toBe(200);
    expect(wall).toBeGreaterThan(150);
    const cpuMs = (cpu.user + cpu.system) / 1000;
    expect(cpuMs).toBeLessThan(80);
  });
});
