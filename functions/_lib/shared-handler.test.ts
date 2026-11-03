import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installAccessKeysForTests, resetAccessCertsForTests } from "./access";
import { accessClaims, createAccessFixture, type AccessFixture } from "./access-fixture";
import { handleShared, type SharedDatabase } from "./shared-handler";
import { D1_BINDING, SHARED_LIMITS, isFreeTierQuota } from "./shared-limits";
import { SHARED_SQL } from "./shared-sql";

const EMAIL = "amigo@example.com";
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const migration = readFileSync(join(root, "migrations/0001_shared_entries.sql"), "utf8");

let fixture: AccessFixture;
let token = "";

beforeAll(async () => {
  fixture = await createAccessFixture();
  installAccessKeysForTests([fixture.publicJwk]);
  token = await fixture.sign(accessClaims(EMAIL, fixture.aud));
});

afterAll(() => {
  resetAccessCertsForTests();
});

function mockDb() {
  const db = new DatabaseSync(":memory:");
  db.exec(migration);
  const queries: string[] = [];
  const bound: unknown[][] = [];
  const database: SharedDatabase = {
    prepare(sql) {
      if (sql !== SHARED_SQL.get && sql !== SHARED_SQL.delete && sql !== SHARED_SQL.upsert) {
        throw new Error("SQL fuera de la lista fija");
      }
      queries.push(sql);
      return {
        bind(...values) {
          bound.push(values);
          return {
            async first() {
              const row = db.prepare(sql).get(...(values as (string | number)[])) as Record<string, unknown> | undefined;
              return row ?? null;
            },
            async run() {
              db.prepare(sql).run(...(values as (string | number)[]));
              return { success: true };
            },
          };
        },
      };
    },
  };
  return { database, db, queries, bound };
}

function failingDb(message: string) {
  const calls = { n: 0 };
  const database: SharedDatabase = {
    prepare() {
      calls.n += 1;
      return {
        bind() {
          return {
            async first() {
              throw new Error(message);
            },
            async run() {
              throw new Error(message);
            },
          };
        },
      };
    },
  };
  return { database, calls };
}

function request(body: unknown, init?: { method?: string; headers?: Record<string, string>; url?: string; raw?: string }): Request {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type") && init?.raw == null) headers.set("content-type", "application/json");
  return new Request(init?.url ?? "https://proto-lab-3k6.pages.dev/api/apps/demo/shared", {
    method: init?.method ?? "POST",
    headers,
    body: init?.method === "GET" ? undefined : (init?.raw ?? JSON.stringify(body)),
  });
}

function authed(extra?: Record<string, string>): Record<string, string> {
  return { "cf-access-jwt-assertion": token, ...extra };
}

const slugs = ["demo", "otra"];

describe("datos compartidos", () => {
  it("exige POST, sesión de Access y el binding DB", async () => {
    const { database } = mockDb();
    const env = { CF_ACCESS_AUD: fixture.aud, DB: database };
    const method = await handleShared(request({}, { method: "GET" }), env, { sharedSlugs: slugs });
    expect(method.status).toBe(405);

    const anonymous = await handleShared(request({ op: "get", key: "mesa" }), { CF_ACCESS_AUD: fixture.aud, DB: database }, { sharedSlugs: slugs });
    expect(anonymous.status).toBe(401);

    const dev = await handleShared(
      request({ op: "get", key: "mesa" }, { headers: { "x-dev-user-email": EMAIL }, url: "http://127.0.0.1:4173/api/apps/demo/shared" }),
      { CF_ACCESS_AUD: fixture.aud, DB: database, ALLOW_DEV_AUTH: "true" } as { CF_ACCESS_AUD: string; DB: SharedDatabase },
      { sharedSlugs: slugs },
    );
    expect(dev.status).toBe(401);

    const missing = await handleShared(request({ op: "get", key: "mesa" }, { headers: authed() }), { CF_ACCESS_AUD: fixture.aud }, { sharedSlugs: slugs });
    expect(missing.status).toBe(503);
    const missingBody = await missing.json();
    expect(missingBody).toMatchObject({ ok: false, error: "config" });
    expect(missingBody.message).toContain(D1_BINDING);
    expect(JSON.stringify(missingBody)).not.toContain(EMAIL);
  });

  it("solo atiende slugs que declaran shared y no acepta SQL ni campos de más", async () => {
    const { database, queries } = mockDb();
    const env = { CF_ACCESS_AUD: fixture.aud, DB: database };
    const headers = authed();
    const forbidden = await handleShared(request({ op: "get", key: "mesa" }, { headers, url: "https://proto-lab-3k6.pages.dev/api/apps/chispa/shared" }), env, { sharedSlugs: slugs });
    expect(forbidden.status).toBe(403);
    expect(queries).toHaveLength(0);

    const extra = await handleShared(request({ op: "get", key: "mesa", sql: "DROP TABLE shared_entries" }, { headers }), env, { sharedSlugs: slugs });
    expect(extra.status).toBe(400);
    expect((await extra.json()).error).toBe("invalid");

    const badKey = await handleShared(request({ op: "set", key: "../otro", value: "x" }, { headers }), env, { sharedSlugs: slugs });
    expect(badKey.status).toBe(400);
    expect(queries).toHaveLength(0);
  });

  it("guarda, lee y borra dentro del slug sin colar la clave en el SQL", async () => {
    const { database, db, queries, bound } = mockDb();
    const env = { CF_ACCESS_AUD: fixture.aud, DB: database };
    const headers = authed();
    const now = new Date("2026-11-03T12:00:00.000Z");
    const evil = "'; DROP TABLE shared_entries;--";

    const missing = await handleShared(request({ op: "get", key: "mesa" }, { headers }), env, { sharedSlugs: slugs, now });
    expect(await missing.json()).toEqual({ ok: true, value: null });

    const saved = await handleShared(request({ op: "set", key: "mesa", value: "norte" }, { headers }), env, { sharedSlugs: slugs, now });
    expect(saved.status).toBe(200);
    expect(saved.headers.get("cache-control")).toBe("no-store");
    expect(await saved.json()).toEqual({ ok: true, value: null });

    const read = await handleShared(request({ op: "get", key: "mesa" }, { headers }), env, { sharedSlugs: slugs, now });
    expect(await read.json()).toEqual({ ok: true, value: "norte" });
    expect(JSON.stringify(await handleShared(request({ op: "get", key: "mesa" }, { headers }), env, { sharedSlugs: slugs, now }).then((response) => response.json()))).not.toContain(EMAIL);

    const other = await handleShared(
      request({ op: "get", key: "mesa" }, { headers, url: "https://proto-lab-3k6.pages.dev/api/apps/otra/shared" }),
      env,
      { sharedSlugs: slugs, now },
    );
    expect(await other.json()).toEqual({ ok: true, value: null });

    const injected = await handleShared(request({ op: "set", key: "nota", value: evil }, { headers }), env, { sharedSlugs: slugs, now });
    expect(injected.status).toBe(200);
    const kept = db.prepare("SELECT value FROM shared_entries WHERE key = ?").get("nota") as { value: string };
    expect(kept.value).toBe(evil);
    expect(db.prepare("SELECT count(*) AS n FROM shared_entries").get()).toMatchObject({ n: 2 });
    expect(queries.every((sql) => sql === SHARED_SQL.get || sql === SHARED_SQL.upsert || sql === SHARED_SQL.delete)).toBe(true);
    expect(queries.some((sql) => sql.includes(evil) || sql.includes("norte"))).toBe(false);
    expect(bound.some((values) => values.includes(evil))).toBe(true);

    const removed = await handleShared(request({ op: "delete", key: "mesa" }, { headers }), env, { sharedSlugs: slugs, now });
    expect(await removed.json()).toEqual({ ok: true, value: null });
    const after = await handleShared(request({ op: "get", key: "mesa" }, { headers }), env, { sharedSlugs: slugs, now });
    expect(await after.json()).toEqual({ ok: true, value: null });
  });

  it("corta por cupo de la aplicación y por el cupo gratuito de D1, sin reintentar", async () => {
    const { database } = mockDb();
    const env = { CF_ACCESS_AUD: fixture.aud, DB: database };
    const headers = authed();
    const now = new Date("2026-11-03T12:00:00.000Z");

    const tooBig = await handleShared(
      request({ op: "set", key: "mesa", value: "x".repeat(SHARED_LIMITS.maxValueBytes + 1) }, { headers }),
      env,
      { sharedSlugs: slugs, now },
    );
    expect(tooBig.status).toBe(400);
    expect((await tooBig.json()).error).toBe("quota");

    for (let index = 0; index < SHARED_LIMITS.maxKeys; index += 1) {
      const saved = await handleShared(request({ op: "set", key: `k${index}`, value: "a" }, { headers }), env, { sharedSlugs: slugs, now });
      expect(saved.status).toBe(200);
    }
    const overflow = await handleShared(request({ op: "set", key: "de-mas", value: "a" }, { headers }), env, { sharedSlugs: slugs, now });
    expect(overflow.status).toBe(400);
    expect((await overflow.json()).error).toBe("quota");
    const updated = await handleShared(request({ op: "set", key: "k0", value: "b" }, { headers }), env, { sharedSlugs: slugs, now });
    expect(updated.status).toBe(200);

    const readLimit = "Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.";
    const reads = failingDb(readLimit);
    const read = await handleShared(
      request({ op: "get", key: "mesa" }, { headers }),
      { CF_ACCESS_AUD: fixture.aud, DB: reads.database },
      { sharedSlugs: slugs },
    );
    expect(read.status).toBe(503);
    const readBody = await read.json();
    expect(readBody).toMatchObject({ ok: false, error: "quota" });
    expect(readBody.message).toContain("no se cobra");
    expect(JSON.stringify(readBody)).not.toContain("Upgrade");
    expect(JSON.stringify(readBody)).not.toContain(readLimit);
    expect(reads.calls.n).toBe(1);

    const cpu = failingDb("D1 DB exceeded its CPU time limit and was reset.");
    const slow = await handleShared(
      request({ op: "get", key: "mesa" }, { headers }),
      { CF_ACCESS_AUD: fixture.aud, DB: cpu.database },
      { sharedSlugs: slugs },
    );
    expect(slow.status).toBe(503);
    expect((await slow.json()).error).toBe("unavailable");
    expect(cpu.calls.n).toBe(1);
    expect(isFreeTierQuota(new Error("Exceeded maximum DB size."))).toBe(true);
  });

  it("la migración fija el tope por valor y no trae datos", () => {
    expect(migration).toContain(`bytes <= ${SHARED_LIMITS.maxValueBytes}`);
    expect(migration).toContain(`length(slug) BETWEEN 1 AND ${SHARED_LIMITS.maxSlugLength}`);
    expect(migration).toContain(`length(key) BETWEEN 1 AND ${SHARED_LIMITS.maxKeyLength}`);
    expect(migration).not.toMatch(/\bINSERT\b/i);
    expect(migration).not.toMatch(/\bATTACH\b/i);
    const source = readFileSync(join(root, "functions/_lib/shared-handler.ts"), "utf8");
    expect(source).not.toMatch(/prepare\(`[^`]*\$\{/);
    expect(source).not.toContain("ALLOW_DEV_AUTH");
    const route = readFileSync(join(root, "functions/api/apps/[slug]/shared.ts"), "utf8");
    expect(route).toContain("shared-slugs.json");
    expect(route).not.toContain("ALLOW_DEV_AUTH");
  });
});
