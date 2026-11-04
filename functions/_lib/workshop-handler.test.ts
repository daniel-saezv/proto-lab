import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installAccessKeysForTests, resetAccessCertsForTests } from "./access";
import { accessClaims, createAccessFixture, type AccessFixture } from "./access-fixture";
import type { KvLike } from "./handler";
import { WORKSHOP_LIMITS, WORKSHOP_MODEL, workshopCallsKey, workshopNeuronsKey, workshopSessionKey, workshopSessionsKey } from "./workshop";
import { handleWorkshop, type WorkshopAi, type WorkshopEnv } from "./workshop-handler";
import { WORKSHOP_UTTERANCE_MAX } from "../../apps/world/src/workshop-view";

const EMAIL = "taller-secreto@example.com";
const OTHER = "otra-persona@example.com";
const NOW = new Date("2026-11-03T12:00:00Z");
const DAY = "2026-11-03";

const proposal = {
  kind: "propuesta",
  title: "Cometa lunar",
  description: "Un juego corto en el que persigues una cometa con el dedo.",
};

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

function reply(speech: string, extra: Record<string, unknown> = {}) {
  return { response: JSON.stringify({ speech, change: null, ready: false, ...extra }) };
}

function changeReply() {
  return {
    response: JSON.stringify({
      speech: "¿Y si deja estela?",
      change: {
        title: "Cometa con estela",
        description: "Persigues una cometa y dejas un rastro de luz.",
        why: "Se ve el camino.",
      },
      ready: false,
    }),
  };
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

describe("POST /api/workshop", () => {
  it("comparte el tope de lo que dice el amigo con el cliente", () => {
    expect(WORKSHOP_UTTERANCE_MAX).toBe(WORKSHOP_LIMITS.utteranceMax);
  });

  it("arranca un turno sin tocar el cupo de propuestas ni llamar a GitHub", async () => {
    const kv = memoryKv();
    const ai = aiOf(changeReply());
    const fetches: string[] = [];
    const response = await handleWorkshop(request({ op: "start", draft: proposal }), envOf(kv, ai), {
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
    expect(body.phase).toBe("turn");
    expect(body.turn).toBe(1);
    expect(JSON.stringify(body)).not.toContain(EMAIL);
    const draft = body.draft as { title: string; kind: string };
    expect(draft.title).toBe(proposal.title);
    expect(draft.kind).toBe("propuesta");
    const change = body.change as { title: string };
    expect(change.title).toBe("Cometa con estela");
    expect(fetches).toEqual([]);
    expect([...kv.store.keys()].some((key) => key.startsWith("proposals:"))).toBe(false);
    expect(kv.store.get(workshopSessionsKey(EMAIL, DAY))).toBe("1");
    expect(kv.ttls.get(workshopSessionsKey(EMAIL, DAY))).toBe(WORKSHOP_LIMITS.quotaTtlSeconds);
    const sessionId = body.sessionId as string;
    expect(kv.ttls.get(workshopSessionKey(sessionId))).toBe(WORKSHOP_LIMITS.sessionTtlSeconds);
    const call = ai.calls[0] as { model: string; input: Record<string, unknown> };
    expect(call.model).toBe(WORKSHOP_MODEL);
    expect(call.input.tools).toBeUndefined();
    expect(call.input.max_tokens).toBe(WORKSHOP_LIMITS.maxTokens);
    expect(ai.calls).toHaveLength(1);
  });

  it("no aplica el cambio hasta que el amigo lo acepta, y el tipo no cambia", async () => {
    const kv = memoryKv();
    const ai = aiOf(changeReply());
    const started = await bodyOf(
      await handleWorkshop(request({ op: "start", draft: proposal }), envOf(kv, ai), { now: NOW }),
    );
    ai.calls.length = 0;
    ai.run = async (model, input) => {
      ai.calls.push({ model, input });
      return reply("¿De qué color es la estela?");
    };
    const accepted = await bodyOf(
      await handleWorkshop(
        request({ op: "turn", sessionId: started.sessionId, decision: "accept" }),
        envOf(kv, ai),
        { now: NOW },
      ),
    );
    expect(accepted.phase).toBe("turn");
    expect((accepted.draft as { title: string; kind: string }).title).toBe("Cometa con estela");
    expect((accepted.draft as { kind: string }).kind).toBe("propuesta");
    expect(accepted.change).toBeNull();
    expect(ai.calls).toHaveLength(1);
  });

  it("un json roto gasta el turno y no pide otro arreglo", async () => {
    const kv = memoryKv();
    const ai = aiOf({ response: "no es json" });
    const body = await bodyOf(
      await handleWorkshop(request({ op: "start", draft: proposal }), envOf(kv, ai), { now: NOW }),
    );
    expect(body.phase).toBe("turn");
    expect(body.turn).toBe(1);
    expect(body.change).toBeNull();
    expect(String(body.speech)).toContain("liado");
    expect(ai.calls).toHaveLength(1);
    expect(kv.store.get(workshopCallsKey(EMAIL, DAY))).toBe("1");
  });

  it("aísla la sesión por persona y la borra al abandonar", async () => {
    const kv = memoryKv();
    const ai = aiOf(reply("¿Por dónde empezamos?"));
    const started = await bodyOf(
      await handleWorkshop(request({ op: "start", draft: proposal }), envOf(kv, ai), { now: NOW }),
    );
    const foreign = await handleWorkshop(
      request({ op: "turn", sessionId: started.sessionId, decision: "stop" }, OTHER),
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

  it("para en el cupo sin llamar al modelo y sin sumar la sesión", async () => {
    const kv = memoryKv();
    kv.store.set(workshopSessionsKey(EMAIL, DAY), "3");
    const ai = aiOf(reply("no debería"));
    const response = await handleWorkshop(request({ op: "start", draft: proposal }), envOf(kv, ai), { now: NOW });
    expect(response.status).toBe(429);
    const body = await bodyOf(response);
    expect(body.restore).toBe(true);
    expect(ai.calls).toHaveLength(0);
    expect(kv.store.get(workshopSessionsKey(EMAIL, DAY))).toBe("3");
  });

  it("frena las neuronas globales antes de la llamada", async () => {
    const kv = memoryKv();
    kv.store.set(workshopNeuronsKey(DAY), "7990");
    const ai = aiOf(reply("no debería"));
    const response = await handleWorkshop(request({ op: "start", draft: proposal }), envOf(kv, ai), { now: NOW });
    expect(response.status).toBe(429);
    expect(ai.calls).toHaveLength(0);
    expect(kv.store.has(workshopSessionsKey(EMAIL, DAY))).toBe(false);
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
    const ai: WorkshopAi & { calls: unknown[] } = {
      calls: [],
      async run() {
        throw new Error("caída");
      },
    };
    const response = await handleWorkshop(request({ op: "start", draft: proposal }), envOf(kv, ai), { now: NOW });
    expect(response.status).toBe(502);
    const body = await bodyOf(response);
    expect(body.restore).toBe(false);
    expect(typeof body.sessionId).toBe("string");
    const stored = JSON.parse(kv.store.get(workshopSessionKey(String(body.sessionId))) ?? "{}") as { turn: number };
    expect(stored.turn).toBe(0);
    expect(kv.store.get(workshopCallsKey(EMAIL, DAY))).toBe("1");
  });

  it("la espera del modelo no cuenta como CPU del worker", async () => {
    const kv = memoryKv();
    const ai: WorkshopAi = {
      async run() {
        await new Promise((resolve) => setTimeout(resolve, 200));
        return reply("¿Y si la estela es azul?");
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
