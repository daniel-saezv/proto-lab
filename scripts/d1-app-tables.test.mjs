import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertAppDatabase, assertLabMigrations } from "./table-sql.mjs";
import {
  ACCOUNT_SECRET,
  D1_TOKEN_SECRET,
  dropTableSql,
  labHistoryErrors,
  planAppChanges,
  readD1Bindings,
  runTableWorkflow,
} from "./d1-app-tables.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ACCOUNT = "a".repeat(32);
const demoSql = `CREATE TABLE IF NOT EXISTS demo__notas (
  nombre TEXT NOT NULL,
  puntos INTEGER NOT NULL,
  PRIMARY KEY (nombre)
);`;
const demoQueries = {
  top10: { sql: "SELECT nombre, puntos FROM demo__notas ORDER BY puntos DESC LIMIT 10", params: [] },
};

function demoApp() {
  const dir = mkdtempSync(join(tmpdir(), "d1-app-"));
  mkdirSync(join(dir, "db"));
  writeFileSync(join(dir, "db", "0001_notas.sql"), demoSql);
  writeFileSync(join(dir, "db", "queries.json"), JSON.stringify(demoQueries));
  const database = assertAppDatabase("demo", dir, ["tables"]);
  const files = Object.fromEntries(database.migrations.map((migration) => [migration.filename, migration.checksum]));
  return { dir, database, files };
}

function memoryD1() {
  const db = new DatabaseSync(":memory:");
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const href = String(url);
    const body = init.body ? JSON.parse(String(init.body)) : {};
    calls.push({ href, sql: body.sql ?? "" });
    if (!href.includes("/d1/database/") || !href.endsWith("/query")) {
      return Response.json({ success: false, errors: [{ message: "not found" }] }, { status: 404 });
    }
    try {
      const params = Array.isArray(body.params) ? body.params : [];
      const statement = db.prepare(body.sql);
      const rows = /^\s*select\b/i.test(body.sql) ? statement.all(...params) : (statement.run(...params), []);
      return Response.json({ success: true, result: [{ results: rows, success: true }] });
    } catch (error) {
      return Response.json(
        { success: false, errors: [{ message: error instanceof Error ? error.message : "sql" }] },
        { status: 400 },
      );
    }
  };
  return { db, fetchImpl, calls };
}

function tables(db) {
  return db
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .all()
    .map((row) => row.name);
}

describe("workflow de tablas D1", () => {
  it("lee los bindings de producción y de preview, y repite el KV", () => {
    const bindings = readD1Bindings(readFileSync(join(root, "wrangler.toml"), "utf8"));
    expect(bindings.production).toMatchObject({
      binding: "DB",
      database_name: "proto-lab-shared",
      database_id: "7f6608b2-bb75-44ba-b240-60d6cff51794",
    });
    expect(bindings.preview).toMatchObject({
      binding: "DB",
      database_name: "proto-lab-shared-preview",
      database_id: "797b147d-e5c7-4198-a20e-fe378758217a",
    });
    expect(bindings.previewKv).toMatchObject({
      binding: "PROPOSALS",
      id: "80ac94ce81e8459fb3882e9fe2a68330",
    });
  });

  it("planifica altas y bajas, y no borra tablas del lab", () => {
    const plan = planAppChanges(
      { demo: { files: { "0001_notas.sql": "aaa" } }, queda: { files: { "0001_notas.sql": "bbb" } } },
      { queda: { files: { "0001_notas.sql": "bbb" } }, nueva: { files: { "0001_notas.sql": "ccc" } } },
    );
    expect(plan.drop).toEqual(["demo"]);
    expect(plan.apply).toEqual(["nueva"]);
    expect(plan.errors).toEqual([]);
    const edited = planAppChanges(
      { demo: { files: { "0001_notas.sql": "aaa" } } },
      { demo: { files: { "0001_notas.sql": "zzz" } } },
    );
    expect(edited.errors.join("\n")).toMatch(/0001_notas.sql/);
    expect(() => dropTableSql("demo", "lab_shared_entries")).toThrow(/reservada|no se puede/);
    expect(() => dropTableSql("demo", "proto_lab_migrations")).toThrow(/reservada|no se puede/);
    expect(() => dropTableSql("demo", "otra__notas")).toThrow(/no se puede/);
    expect(dropTableSql("demo", "demo__notas")).toBe('DROP TABLE IF EXISTS "demo__notas"');
  });

  it("avisa y sale en cero si falta el secreto, la cuenta o la base", async () => {
    const { fetchImpl, calls } = memoryD1();
    const missing = await runTableWorkflow({
      repo: root,
      target: "preview",
      token: "",
      fetchImpl,
      labMigrations: [],
      after: {},
    });
    expect(missing.exitCode).toBe(0);
    expect(missing.status).toBe("skipped");
    expect(missing.message).toContain(D1_TOKEN_SECRET);
    expect(missing.message).toContain("D1 → Edit");
    expect(calls).toHaveLength(0);

    const denied = await runTableWorkflow({
      repo: root,
      target: "preview",
      token: "token",
      accountId: ACCOUNT,
      wranglerToml: readFileSync(join(root, "wrangler.toml"), "utf8"),
      labMigrations: [],
      after: {},
      fetchImpl: async () => Response.json({ success: false, errors: [{ message: "auth" }] }, { status: 403 }),
    });
    expect(denied.exitCode).toBe(0);
    expect(denied.message).toContain(D1_TOKEN_SECRET);

    const absent = await runTableWorkflow({
      repo: root,
      target: "production",
      token: "token",
      accountId: ACCOUNT,
      wranglerToml: readFileSync(join(root, "wrangler.toml"), "utf8"),
      labMigrations: assertLabMigrations(root),
      after: {},
      fetchImpl: async () => Response.json({ success: false, errors: [{ message: "database not found" }] }, { status: 404 }),
    });
    expect(absent.exitCode).toBe(0);
    expect(absent.message).toContain("proto-lab-shared");
    expect(absent.message).toContain("no existe");
  });

  it("falla en el cupo gratuito con una sola llamada y sin reintento", async () => {
    const calls = [];
    const result = await runTableWorkflow({
      repo: root,
      target: "preview",
      token: "token",
      accountId: ACCOUNT,
      wranglerToml: readFileSync(join(root, "wrangler.toml"), "utf8"),
      labMigrations: assertLabMigrations(root),
      after: {},
      fetchImpl: async (url) => {
        calls.push(String(url));
        return Response.json(
          { success: false, errors: [{ message: "Your account has exceeded D1's free tier daily row write limit." }] },
          { status: 400 },
        );
      },
    });
    expect(result.exitCode).toBe(1);
    expect(result.status).toBe("quota");
    expect(result.message).toMatch(/no se cobra/);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("797b147d-e5c7-4198-a20e-fe378758217a");
  });

  it("aplica la 0001 y la tabla de la app una sola vez, y borra solo la de la app", async () => {
    const app = demoApp();
    const { db, fetchImpl, calls } = memoryD1();
    const wranglerToml = readFileSync(join(root, "wrangler.toml"), "utf8");
    const lab = assertLabMigrations(root);
    const after = { demo: { files: app.files, database: app.database } };
    const first = await runTableWorkflow({
      repo: root,
      target: "preview",
      token: "token",
      accountId: ACCOUNT,
      wranglerToml,
      labMigrations: lab,
      beforeLab: { "0001_shared_entries.sql": "no-aplicada" },
      after,
      fetchImpl,
      now: "2026-11-03T00:00:00.000Z",
    });
    expect(first.exitCode).toBe(0);
    expect(tables(db)).toEqual(
      expect.arrayContaining(["lab_shared_entries", "demo__notas", "proto_lab_migrations", "proto_lab_app_tables"]),
    );
    const applied = db.prepare("SELECT filename FROM proto_lab_migrations ORDER BY filename").all();
    expect(applied.map((row) => row.filename)).toEqual(["0001_lab_shared_entries.sql", "0001_notas.sql"]);
    const schemaWrites = () =>
      calls.filter((call) => /lab_shared_entries|demo__notas|INSERT INTO proto_lab_migrations/i.test(call.sql)).length;
    const appliedWrites = schemaWrites();

    const second = await runTableWorkflow({
      repo: root,
      target: "preview",
      token: "token",
      accountId: ACCOUNT,
      wranglerToml,
      labMigrations: lab,
      beforeLab: { "0001_lab_shared_entries.sql": lab[0].checksum },
      after,
      fetchImpl,
      now: "2026-11-03T00:00:01.000Z",
    });
    expect(second.exitCode).toBe(0);
    expect(schemaWrites()).toBe(appliedWrites);
    expect(db.prepare("SELECT count(*) AS n FROM proto_lab_migrations").get().n).toBe(2);

    const changed = { ...lab[0], checksum: "f".repeat(64), sql: `${lab[0].sql}\n` };
    const rejected = await runTableWorkflow({
      repo: root,
      target: "preview",
      token: "token",
      accountId: ACCOUNT,
      wranglerToml,
      labMigrations: [changed],
      beforeLab: { "0001_lab_shared_entries.sql": lab[0].checksum },
      after: {},
      fetchImpl,
    });
    expect(rejected.exitCode).toBe(1);
    expect(rejected.message).toMatch(/otra contenido|otro contenido/);
    expect(tables(db)).toContain("lab_shared_entries");

    const dropped = await runTableWorkflow({
      repo: root,
      target: "preview",
      token: "token",
      accountId: ACCOUNT,
      wranglerToml,
      labMigrations: lab,
      before: { demo: { files: app.files } },
      after: {},
      fetchImpl,
    });
    expect(dropped.exitCode).toBe(0);
    expect(tables(db)).not.toContain("demo__notas");
    expect(tables(db)).toContain("lab_shared_entries");
    expect(db.prepare("SELECT count(*) AS n FROM proto_lab_app_tables").get().n).toBe(0);
    rmSync(app.dir, { recursive: true, force: true });
  });

  it("no toca una migración del lab que solo está en la base de preview", () => {
    const applied = new Map([["0002_de_otra_pr.sql", "abc"]]);
    expect(labHistoryErrors({}, [{ filename: "0001_lab_shared_entries.sql", checksum: "def" }], applied)).toEqual([]);
    expect(
      labHistoryErrors({ "0001_lab_shared_entries.sql": "abc" }, [], new Map([["0001_lab_shared_entries.sql", "abc"]])).join(
        "\n",
      ),
    ).toMatch(/ya no está/);
  });

  it("el workflow no crea bases y usa el secreto de D1 Edit", () => {
    const source = readFileSync(join(root, ".github/workflows/d1-app-tables.yml"), "utf8");
    const script = readFileSync(join(root, "scripts/d1-app-tables.mjs"), "utf8");
    expect(source).toContain("pull_request:");
    expect(source).toContain("branches: [main]");
    expect(source).toContain("contents: read");
    expect(source).toContain("cancel-in-progress: false");
    expect(source).toContain("timeout-minutes: 10");
    expect(source).toContain("fetch-depth: 0");
    expect(source).toContain("node-version: 26");
    expect(source).toContain("node scripts/d1-app-tables.mjs");
    expect(source).toContain(`secrets.${D1_TOKEN_SECRET}`);
    expect(source).toContain(`secrets.${ACCOUNT_SECRET}`);
    expect(source).not.toContain("pnpm");
    expect(source).not.toMatch(/d1 create/);
    expect(script).toContain("/d1/database/${databaseId}/query");
    expect(script).not.toMatch(/\/d1\/database["'\s]*[,)]/);
    expect(script).not.toContain("ALLOW_DEV_AUTH");
  });
});
