import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installAccessKeysForTests, resetAccessCertsForTests } from "./access";
import { accessClaims, createAccessFixture, type AccessFixture } from "./access-fixture";
import { handleQuery, type DeclaredQuery, type QueryDatabase } from "./query-handler";
import { D1_BINDING, isFreeTierQuota } from "./shared-limits";
import { TABLE_LIMITS } from "./table-limits";

const EMAIL = "amigo@example.com";
const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const migration = `CREATE TABLE IF NOT EXISTS demo__notas (
  nombre TEXT NOT NULL,
  puntos INTEGER NOT NULL,
  PRIMARY KEY (nombre)
)`;

const queries: Record<string, Record<string, DeclaredQuery>> = {
  demo: {
    top10: {
      sql: "SELECT nombre, puntos FROM demo__notas ORDER BY puntos DESC LIMIT 10",
      params: [],
    },
    guardarPuntuacion: {
      sql: "INSERT INTO demo__notas (nombre, puntos) VALUES (?1, ?2)",
      params: ["nombre", "puntos"],
    },
    borrar: {
      sql: "DELETE FROM demo__notas WHERE nombre = ?1",
      params: ["nombre"],
    },
  },
};

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
  const prepared: string[] = [];
  const database: QueryDatabase = {
    prepare(sql) {
      prepared.push(sql);
      return {
        bind(...values) {
          return {
            async all() {
              return db.prepare(sql).all(...(values as Array<string | number | null>)) as Record<string, unknown>[];
            },
          };
        },
      };
    },
  };
  return { database, db, prepared };
}

function failingDb(message: string) {
  const calls = { n: 0 };
  const database: QueryDatabase = {
    prepare() {
      calls.n += 1;
      return {
        bind() {
          return {
            async all() {
              throw new Error(message);
            },
          };
        },
      };
    },
  };
  return { database, calls };
}

function request(body: unknown, init?: { method?: string; headers?: Record<string, string>; url?: string }): Request {
  const headers = new Headers(init?.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Request(init?.url ?? "https://proto-lab-3k6.pages.dev/api/apps/demo/query", {
    method: init?.method ?? "POST",
    headers,
    body: init?.method === "GET" ? undefined : JSON.stringify(body),
  });
}

function authed(extra?: Record<string, string>): Record<string, string> {
  return { "cf-access-jwt-assertion": token, ...extra };
}

describe("consultas declaradas", () => {
  it("exige POST, sesión y el binding, y no acepta ALLOW_DEV_AUTH", async () => {
    const { database, prepared } = mockDb();
    const env = { CF_ACCESS_AUD: fixture.aud, DB: database };
    expect((await handleQuery(request({}, { method: "GET" }), env, { queries })).status).toBe(405);
    expect((await handleQuery(request({ name: "top10" }), { CF_ACCESS_AUD: fixture.aud, DB: database }, { queries })).status).toBe(401);
    const dev = await handleQuery(
      request({ name: "top10" }, { headers: { "x-dev-user-email": EMAIL }, url: "http://127.0.0.1:4173/api/apps/demo/query" }),
      { CF_ACCESS_AUD: fixture.aud, DB: database, ALLOW_DEV_AUTH: "true" } as { CF_ACCESS_AUD: string; DB: QueryDatabase },
      { queries },
    );
    expect(dev.status).toBe(401);
    const missing = await handleQuery(request({ name: "top10" }, { headers: authed() }), { CF_ACCESS_AUD: fixture.aud }, { queries });
    expect(missing.status).toBe(503);
    const missingBody = await missing.json();
    expect(missingBody).toMatchObject({ ok: false, error: "config" });
    expect(missingBody.message).toContain(D1_BINDING);
    expect(prepared).toHaveLength(0);
    const source = readFileSync(join(root, "functions/_lib/query-handler.ts"), "utf8");
    expect(source).not.toContain("ALLOW_DEV_AUTH");
    expect(source).not.toMatch(/prepare\(`[^`]*\$\{/);
  });

  it("solo ejecuta la consulta declarada, con los parámetros enlazados", async () => {
    const { database, db, prepared } = mockDb();
    const env = { CF_ACCESS_AUD: fixture.aud, DB: database };
    const headers = authed();
    const forbidden = await handleQuery(
      request({ name: "top10" }, { headers, url: "https://proto-lab-3k6.pages.dev/api/apps/chispa/query" }),
      env,
      { queries },
    );
    expect(forbidden.status).toBe(403);
    const injected = await handleQuery(
      request({ name: "top10", sql: "DROP TABLE demo__notas", params: { nombre: "x" } }, { headers }),
      env,
      { queries },
    );
    expect(injected.status).toBe(400);
    expect(prepared).toHaveLength(0);

    const evil = "'); DROP TABLE demo__notas;--";
    const saved = await handleQuery(
      request({ name: "guardarPuntuacion", params: { nombre: evil, puntos: 3 } }, { headers }),
      env,
      { queries },
    );
    expect(saved.status).toBe(200);
    expect(await saved.json()).toEqual({ ok: true, rows: [] });
    const kept = db.prepare("SELECT nombre, puntos FROM demo__notas").get() as { nombre: string; puntos: number };
    expect(kept).toEqual({ nombre: evil, puntos: 3 });
    expect(db.prepare("SELECT count(*) AS n FROM demo__notas").get()).toMatchObject({ n: 1 });

    const listed = await handleQuery(request({ name: "top10", params: {} }, { headers }), env, { queries });
    expect(listed.status).toBe(200);
    const listedBody = await listed.json();
    expect(listedBody).toEqual({ ok: true, rows: [{ nombre: evil, puntos: 3 }] });
    expect(JSON.stringify(listedBody)).not.toContain(EMAIL);
    expect(prepared.every((sql) => sql === queries.demo.top10.sql || sql === queries.demo.guardarPuntuacion.sql)).toBe(true);
    expect(prepared.some((sql) => sql.includes(evil) || sql.includes("DROP"))).toBe(false);
  });

  it("corta por cupo de la app y por el cupo gratuito de D1, sin reintentar", async () => {
    const { database } = mockDb();
    const env = { CF_ACCESS_AUD: fixture.aud, DB: database };
    const headers = authed();
    const huge = await handleQuery(
      request({ name: "guardarPuntuacion", params: { nombre: "a".repeat(TABLE_LIMITS.maxStringBytes + 1), puntos: 1 } }, { headers }),
      env,
      { queries },
    );
    expect(huge.status).toBe(400);
    expect((await huge.json()).error).toBe("quota");

    const readLimit = "Your account has exceeded D1's free tier daily row read limit. Upgrade to a paid plan or wait until tomorrow (midnight UTC) to continue.";
    const reads = failingDb(readLimit);
    const read = await handleQuery(request({ name: "top10" }, { headers }), { CF_ACCESS_AUD: fixture.aud, DB: reads.database }, { queries });
    expect(read.status).toBe(503);
    const body = await read.json();
    expect(body).toMatchObject({ ok: false, error: "quota" });
    expect(body.message).toContain("no se cobra");
    expect(JSON.stringify(body)).not.toContain("Upgrade");
    expect(reads.calls.n).toBe(1);
    expect(isFreeTierQuota(new Error("D1 query result exceeded the maximum response size limit of 50 MB"))).toBe(true);
    expect(TABLE_LIMITS.maxRows).toBe(50);
    expect(TABLE_LIMITS.maxStringBytes).toBe(2048);
    expect(TABLE_LIMITS.maxResultBytes).toBe(32 * 1024);
    expect(TABLE_LIMITS.maxBodyBytes).toBe(48 * 1024);
  });
});
