import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertAppDatabase, assertLabMigrations, isOwnTable, tablePrefix, TABLE_LIMITS } from "./table-sql.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function appDir() {
  const dir = mkdtempSync(join(tmpdir(), "tablas-"));
  mkdirSync(join(dir, "db"));
  return dir;
}

function writeApp(dir, migration, queries, filename = "0001_notas.sql") {
  writeFileSync(join(dir, "db", filename), migration);
  writeFileSync(join(dir, "db", "queries.json"), JSON.stringify(queries));
}

const demoSql = `CREATE TABLE IF NOT EXISTS demo__notas (
  nombre TEXT NOT NULL,
  puntos INTEGER NOT NULL,
  PRIMARY KEY (nombre)
);`;

const demoQueries = {
  top10: {
    sql: "SELECT nombre, puntos FROM demo__notas ORDER BY puntos DESC LIMIT 10",
    params: [],
  },
  guardarPuntuacion: {
    sql: "INSERT INTO demo__notas (nombre, puntos) VALUES (?1, ?2)",
    params: ["nombre", "puntos"],
  },
};

describe("SQL de tablas por aplicación", () => {
  it("exige el prefijo del slug con doble guion bajo", () => {
    expect(tablePrefix("demo")).toBe("demo__");
    expect(tablePrefix("mesa-roja")).toBe("mesa_roja__");
    expect(isOwnTable("mesa_roja__notas", "mesa-roja")).toBe(true);
    expect(isOwnTable("mesa_roja_notas", "mesa-roja")).toBe(false);
    expect(isOwnTable("demo__notas", "otra")).toBe(false);
  });

  it("acepta una migración y las consultas declaradas", () => {
    const dir = appDir();
    writeApp(dir, demoSql, demoQueries);
    const parsed = assertAppDatabase("demo", dir, ["tables"]);
    expect(parsed.migrations).toHaveLength(1);
    expect(parsed.migrations[0].tables).toEqual(["demo__notas"]);
    expect(parsed.queries.top10.params).toEqual([]);
    expect(parsed.queries.guardarPuntuacion.params).toEqual(["nombre", "puntos"]);
    expect(() => assertAppDatabase("demo", dir, [])).toThrow(/tables/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("rechaza tablas ajenas, las del lab y el SQL peligroso", () => {
    const cases = [
      ["CREATE TABLE IF NOT EXISTS otra__notas (nombre TEXT NOT NULL);", "prefijo"],
      ["CREATE TABLE IF NOT EXISTS lab_shared_entries (nombre TEXT NOT NULL);", "laboratorio|prefijo|reservado"],
      ["CREATE TABLE IF NOT EXISTS demo__notas (nombre TEXT NOT NULL); ATTACH DATABASE 'x' AS other;", "no permitido|ATTACH"],
      ["PRAGMA table_info(demo__notas);", "no permitido|PRAGMA"],
      ["DROP TABLE demo__notas;", "no permitido|DROP"],
      ["CREATE TABLE demo__notas (nombre TEXT NOT NULL);", "IF NOT EXISTS"],
      ["CREATE TABLE IF NOT EXISTS demo__notas (nombre TEXT); CREATE TABLE IF NOT EXISTS shared_entries (nombre TEXT);", "reservado|prefijo"],
      ["CREATE TABLE IF NOT EXISTS sqlite_master (nombre TEXT);", "reservado|prefijo"],
      ["CREATE TABLE IF NOT EXISTS proto_lab_migrations (nombre TEXT);", "reservado|prefijo"],
    ];
    for (const [sql, pattern] of cases) {
      const dir = appDir();
      writeApp(dir, sql, demoQueries);
      expect(() => assertAppDatabase("demo", dir, ["tables"])).toThrow(new RegExp(pattern, "i"));
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rechaza consultas que se salen del cupo o no enlazan parámetros", () => {
    const dir = appDir();
    writeApp(dir, demoSql, {
      top10: { sql: "SELECT nombre FROM demo__notas", params: [] },
    });
    expect(() => assertAppDatabase("demo", dir, ["tables"])).toThrow(/LIMIT/);
    writeApp(dir, demoSql, {
      top10: { sql: `SELECT nombre FROM demo__notas LIMIT ${TABLE_LIMITS.maxRows + 1}`, params: [] },
    });
    expect(() => assertAppDatabase("demo", dir, ["tables"])).toThrow(/LIMIT/);
    writeApp(dir, demoSql, {
      top10: { sql: "SELECT nombre FROM demo__notas LIMIT ?1", params: ["limite"] },
    });
    expect(() => assertAppDatabase("demo", dir, ["tables"])).toThrow(/LIMIT/);
    writeApp(dir, demoSql, {
      ver: { sql: "SELECT nombre FROM otra__notas LIMIT 10", params: [] },
    });
    expect(() => assertAppDatabase("demo", dir, ["tables"])).toThrow(/prefijo/);
    writeApp(dir, demoSql, {
      ver: { sql: "SELECT nombre FROM lab_shared_entries LIMIT 10", params: [] },
    });
    expect(() => assertAppDatabase("demo", dir, ["tables"])).toThrow(/laboratorio|prefijo/);
    writeApp(dir, demoSql, {
      borrar: { sql: "DELETE FROM demo__notas", params: [] },
    });
    expect(() => assertAppDatabase("demo", dir, ["tables"])).toThrow(/WHERE/);
    writeApp(dir, demoSql, {
      guardar: { sql: "INSERT INTO demo__notas (nombre, puntos) VALUES (?1, ?2)", params: ["nombre"] },
    });
    expect(() => assertAppDatabase("demo", dir, ["tables"])).toThrow(/\?2/);
    writeApp(dir, demoSql, {
      guardar: {
        sql: "INSERT INTO demo__notas (nombre, puntos) VALUES ('x', 1); DROP TABLE demo__notas",
        params: [],
      },
    });
    expect(() => assertAppDatabase("demo", dir, ["tables"])).toThrow(/una sola sentencia|no permitido/);
    rmSync(dir, { recursive: true, force: true });
  });

  it("corta por número de tablas", () => {
    const dir = appDir();
    const parts = [];
    for (let index = 0; index < TABLE_LIMITS.maxTables + 1; index += 1) {
      parts.push(`CREATE TABLE IF NOT EXISTS demo__t${index} (nombre TEXT NOT NULL);`);
    }
    writeApp(dir, parts.join("\n"), demoQueries);
    expect(() => assertAppDatabase("demo", dir, ["tables"])).toThrow(/demasiadas tablas/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe("migraciones del lab", () => {
  it("la 0001 solo crea lab_shared_entries, mínima y genérica", () => {
    const migrations = assertLabMigrations(root);
    expect(migrations.map((migration) => migration.filename)).toEqual(["0001_lab_shared_entries.sql"]);
    const first = migrations[0];
    expect(first.tables).toEqual(["lab_shared_entries"]);
    expect(first.indexes).toEqual([]);
    expect(first.statements).toHaveLength(1);
    expect(first.sql).toContain("CREATE TABLE IF NOT EXISTS lab_shared_entries");
    expect(first.sql).not.toMatch(/(?<!lab_)shared_entries/);
    expect(first.sql).not.toMatch(/\bCREATE\s+(UNIQUE\s+)?INDEX\b/i);
    expect(first.sql).not.toMatch(/\bDROP\b/i);
    expect(first.sql).not.toMatch(/\bATTACH\b/i);
    expect(first.sql).not.toMatch(/\bPRAGMA\b/i);
    for (const column of ["slug", "key", "value", "bytes", "updated_at"]) {
      expect(first.sql).toContain(column);
    }
    const runtime = readFileSync(join(root, "functions/_lib/table-limits.ts"), "utf8");
    expect(runtime).toContain(`maxStringBytes: ${TABLE_LIMITS.maxStringBytes}`);
    expect(runtime).toContain(`maxRows: ${TABLE_LIMITS.maxRows}`);
    expect(runtime).toContain(`maxParams: ${TABLE_LIMITS.maxParams}`);
    expect(runtime).toContain("maxResultBytes: 32 * 1024");
    expect(runtime).toContain("maxBodyBytes: 48 * 1024");
    expect(TABLE_LIMITS.maxResultBytes).toBe(32 * 1024);
    expect(TABLE_LIMITS.maxBodyBytes).toBe(48 * 1024);
  });
});
