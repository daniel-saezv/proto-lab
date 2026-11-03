import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/** Cupos de las tablas de una aplicación. La Function repite los de ejecución. */
export const TABLE_LIMITS = {
  maxMigrations: 16,
  maxMigrationBytes: 16 * 1024,
  maxStatementsPerMigration: 24,
  maxTables: 8,
  maxIndexes: 16,
  maxQueries: 32,
  maxQueryNameLength: 40,
  maxSqlBytes: 2048,
  maxParams: 8,
  maxParamNameLength: 32,
  maxStringBytes: 2048,
  maxRows: 50,
  maxOffset: 500,
  maxResultBytes: 32 * 1024,
  maxBodyBytes: 48 * 1024,
};

export const LAB_MIGRATION_LIMITS = {
  maxFiles: 32,
  maxBytes: 16 * 1024,
};

const MIGRATION_FILE = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const QUERY_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const PARAM_NAME = /^[A-Za-z][A-Za-z0-9_]*$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ASCII = /^[\t\n\r\x20-\x7E]*$/;

const FORBIDDEN = new Set([
  "attach",
  "detach",
  "pragma",
  "drop",
  "vacuum",
  "reindex",
  "analyze",
  "analyse",
  "begin",
  "commit",
  "rollback",
  "savepoint",
  "release",
  "explain",
  "trigger",
  "view",
  "virtual",
  "temp",
  "temporary",
  "recursive",
  "replace",
  "load_extension",
  "readfile",
  "writefile",
  "database",
]);

const CLAUSE = new Set([
  "where",
  "join",
  "left",
  "right",
  "full",
  "inner",
  "outer",
  "cross",
  "on",
  "group",
  "order",
  "limit",
  "offset",
  "union",
  "except",
  "intersect",
  "returning",
  "set",
  "having",
  "natural",
  "using",
  "indexed",
  "and",
  "or",
  "window",
]);

function fail(message) {
  throw new Error(message);
}

/** Prefijo de las tablas de una app: el slug con `-` cambiado por `_`, y `__`. */
export function tablePrefix(slug) {
  if (!SLUG.test(slug)) fail(`slug no válido (${slug})`);
  return `${slug.replaceAll("-", "_")}__`;
}

export function isOwnTable(name, slug) {
  const prefix = tablePrefix(slug);
  return name.startsWith(prefix) && name.length > prefix.length && name.length <= 64 && /^[a-z][a-z0-9_]*$/.test(name);
}

export function checksumSql(sql) {
  return createHash("sha256").update(String(sql).replace(/\r\n/g, "\n")).digest("hex");
}

function isLabTable(name) {
  return /^lab_[a-z][a-z0-9_]*$/.test(name) && !name.includes("__") && name.length <= 64;
}

function stripComments(sql) {
  let out = "";
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "'") {
      out += "'";
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'") {
          out += "'";
          i += 1;
          if (sql[i] === "'") {
            out += "'";
            i += 1;
            continue;
          }
          break;
        }
        out += sql[i];
        i += 1;
      }
      continue;
    }
    if (sql[i] === "-" && sql[i + 1] === "-") {
      while (i < sql.length && sql[i] !== "\n") i += 1;
      out += " ";
      continue;
    }
    if (sql[i] === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end < 0) fail("comentario sin cerrar");
      i = end + 2;
      out += " ";
      continue;
    }
    out += sql[i];
    i += 1;
  }
  return out;
}

export function splitSqlStatements(sql) {
  const stripped = stripComments(sql);
  const parts = [];
  let current = "";
  let i = 0;
  while (i < stripped.length) {
    if (stripped[i] === "'") {
      current += "'";
      i += 1;
      while (i < stripped.length) {
        current += stripped[i];
        if (stripped[i] === "'") {
          i += 1;
          if (stripped[i] === "'") {
            current += "'";
            i += 1;
            continue;
          }
          break;
        }
        i += 1;
      }
      if (i >= stripped.length && !current.endsWith("'")) fail("cadena sin cerrar");
      continue;
    }
    if (stripped[i] === ";") {
      if (current.trim()) parts.push(current.trim());
      current = "";
      i += 1;
      continue;
    }
    current += stripped[i];
    i += 1;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function tokenize(sql) {
  if (!ASCII.test(sql)) fail("el SQL tiene que ser ASCII");
  const tokens = [];
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i += 1;
      continue;
    }
    if (c === "'") {
      let value = "";
      i += 1;
      while (i < sql.length) {
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") {
            value += "'";
            i += 2;
            continue;
          }
          i += 1;
          tokens.push({ type: "string", value });
          break;
        }
        value += sql[i];
        i += 1;
      }
      if (tokens.at(-1)?.type !== "string" || tokens.at(-1)?.value !== value) fail("cadena sin cerrar");
      continue;
    }
    if (c === "?") {
      let j = i + 1;
      if (!/[0-9]/.test(sql[j] ?? "")) fail("el parámetro tiene que ser ?1, ?2, …");
      while (/[0-9]/.test(sql[j] ?? "")) j += 1;
      tokens.push({ type: "param", value: sql.slice(i, j) });
      i = j;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i + 1;
      while (/[0-9]/.test(sql[j] ?? "")) j += 1;
      if (sql[j] === "." && /[0-9]/.test(sql[j + 1] ?? "")) {
        j += 2;
        while (/[0-9]/.test(sql[j] ?? "")) j += 1;
      }
      if (/[A-Za-z_]/.test(sql[j] ?? "")) fail("número pegado a un identificador");
      tokens.push({ type: "number", value: sql.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i + 1;
      while (/[A-Za-z0-9_]/.test(sql[j] ?? "")) j += 1;
      tokens.push({ type: "word", value: sql.slice(i, j) });
      i = j;
      continue;
    }
    const two = sql.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>" || two === "!=" || two === "||" || two === "==") {
      tokens.push({ type: "punct", value: two });
      i += 2;
      continue;
    }
    if ("(),;.*<>=!+-/%|".includes(c)) {
      tokens.push({ type: "punct", value: c });
      i += 1;
      continue;
    }
    fail(`carácter no admitido (${c})`);
  }
  return tokens;
}

function wordOf(token) {
  return token?.type === "word" ? token.value.toLowerCase() : "";
}

function previousWord(tokens, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const word = wordOf(tokens[i]);
    if (word) return word;
  }
  return "";
}

function nextWord(tokens, index) {
  for (let i = index + 1; i < tokens.length; i += 1) {
    const word = wordOf(tokens[i]);
    if (word) return word;
  }
  return "";
}

function assertSafeIdent(name, mode, slug) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) fail(`identificador no válido (${name})`);
  const lower = name.toLowerCase();
  if (
    lower === "shared_entries" ||
    lower.startsWith("sqlite_") ||
    lower.startsWith("proto_lab_") ||
    lower.startsWith("d1_") ||
    lower.startsWith("_cf_")
  ) {
    fail(`identificador reservado (${name})`);
  }
  if (mode === "app" && lower.startsWith("lab_") && !lower.startsWith(tablePrefix(slug))) {
    fail(`la tabla del laboratorio no se toca desde la app (${name})`);
  }
}

function assertTableName(name, mode, slug) {
  assertSafeIdent(name, mode, slug);
  if (mode === "lab") {
    if (!isLabTable(name)) fail(`la tabla del lab tiene que llamarse lab_* (${name})`);
    return;
  }
  if (!isOwnTable(name, slug)) fail(`la tabla tiene que llevar el prefijo ${tablePrefix(slug)} (${name})`);
}

function assertForbidden(tokens) {
  for (const token of tokens) {
    if (token.type !== "word") continue;
    if (FORBIDDEN.has(token.value.toLowerCase())) fail(`SQL no permitido (${token.value})`);
    assertSafeIdent(token.value, "scan", "");
  }
}

function assertMigrationWords(tokens) {
  for (let i = 0; i < tokens.length; i += 1) {
    const word = wordOf(tokens[i]);
    if (word === "select" || word === "insert") fail("la migración no lee ni escribe filas");
    if (word === "delete" || word === "update") {
      const prev = previousWord(tokens, i);
      const next = nextWord(tokens, i);
      if (prev !== "on" || !["cascade", "restrict", "set", "no"].includes(next)) {
        fail("DELETE y UPDATE en una migración solo valen como ON DELETE u ON UPDATE");
      }
    }
  }
}

function collectReferences(tokens, mode, slug) {
  for (let i = 0; i < tokens.length; i += 1) {
    if (wordOf(tokens[i]) !== "references") continue;
    const name = tokens[i + 1];
    if (name?.type !== "word") fail("REFERENCES sin tabla");
    assertTableName(name.value, mode, slug);
  }
}

function parseCreate(tokens, mode, slug) {
  let i = 1;
  if (wordOf(tokens[i]) === "unique") i += 1;
  const kind = wordOf(tokens[i]);
  if (kind !== "table" && kind !== "index") fail("solo CREATE TABLE o CREATE INDEX");
  if (kind === "table" && wordOf(tokens[1]) === "unique") fail("CREATE UNIQUE TABLE no vale");
  i += 1;
  if (wordOf(tokens[i]) !== "if" || wordOf(tokens[i + 1]) !== "not" || wordOf(tokens[i + 2]) !== "exists") {
    fail("CREATE tiene que llevar IF NOT EXISTS");
  }
  i += 3;
  const name = tokens[i];
  if (name?.type !== "word") fail("falta el nombre");
  assertTableName(name.value, mode, slug);
  i += 1;
  if (kind === "table") {
    if (tokens[i]?.value !== "(") fail("faltan las columnas");
    collectReferences(tokens, mode, slug);
    assertMigrationWords(tokens);
    return { tables: [name.value], indexes: [] };
  }
  if (wordOf(tokens[i]) !== "on") fail("el índice tiene que decir ON tabla");
  const table = tokens[i + 1];
  if (table?.type !== "word") fail("falta la tabla del índice");
  assertTableName(table.value, mode, slug);
  if (tokens.some((token) => wordOf(token) === "where")) fail("el índice no lleva WHERE");
  assertMigrationWords(tokens);
  return { tables: [], indexes: [name.value] };
}

function parseAlter(tokens, mode, slug) {
  if (wordOf(tokens[1]) !== "table") fail("solo ALTER TABLE");
  const name = tokens[2];
  if (name?.type !== "word") fail("falta la tabla");
  assertTableName(name.value, mode, slug);
  if (wordOf(tokens[3]) !== "add" || wordOf(tokens[4]) !== "column") fail("solo ALTER TABLE … ADD COLUMN");
  if (tokens[5]?.type !== "word") fail("falta la columna");
  assertSafeIdent(tokens[5].value, mode, slug);
  collectReferences(tokens, mode, slug);
  assertMigrationWords(tokens);
  return { tables: [], indexes: [] };
}

function assertLimit(tokens) {
  let found = false;
  for (let i = 0; i < tokens.length; i += 1) {
    if (wordOf(tokens[i]) !== "limit") continue;
    const amount = tokens[i + 1];
    if (amount?.type !== "number" || !/^[0-9]+$/.test(amount.value)) fail("LIMIT tiene que ser un entero literal");
    const n = Number(amount.value);
    if (n < 1 || n > TABLE_LIMITS.maxRows) fail(`LIMIT máximo ${TABLE_LIMITS.maxRows}`);
    if (tokens[i + 2]?.value === ",") fail("usa LIMIT n, no LIMIT offset, n");
    if (wordOf(tokens[i + 2]) === "offset") {
      const offset = tokens[i + 3];
      if (offset?.type !== "number" || !/^[0-9]+$/.test(offset.value)) fail("OFFSET tiene que ser un entero literal");
      const o = Number(offset.value);
      if (o > TABLE_LIMITS.maxOffset) fail(`OFFSET máximo ${TABLE_LIMITS.maxOffset}`);
    }
    found = true;
  }
  if (!found) fail("SELECT tiene que llevar LIMIT");
}

function readTableList(tokens, start, slug, aliases) {
  let i = start;
  if (tokens[i]?.value === "(") return;
  while (i < tokens.length) {
    const name = tokens[i];
    if (name?.type !== "word") fail("falta la tabla");
    assertTableName(name.value, "app", slug);
    aliases.add(name.value.toLowerCase());
    i += 1;
    if (tokens[i]?.value === ".") {
      if (tokens[i + 1]?.type !== "word") fail("falta la columna");
      assertSafeIdent(tokens[i + 1].value, "app", slug);
      i += 2;
    }
    if (wordOf(tokens[i]) === "as") {
      const alias = tokens[i + 1];
      if (alias?.type !== "word") fail("falta el alias");
      assertSafeIdent(alias.value, "app", slug);
      aliases.add(alias.value.toLowerCase());
      i += 2;
    } else if (tokens[i]?.type === "word" && !CLAUSE.has(wordOf(tokens[i]))) {
      assertSafeIdent(tokens[i].value, "app", slug);
      aliases.add(tokens[i].value.toLowerCase());
      i += 1;
    }
    if (tokens[i]?.value === ",") {
      i += 1;
      continue;
    }
    break;
  }
}

function collectQueryTables(tokens, slug, aliases) {
  for (let i = 0; i < tokens.length; i += 1) {
    const word = wordOf(tokens[i]);
    if (word === "from" || word === "join" || word === "into" || word === "references") {
      readTableList(tokens, i + 1, slug, aliases);
    }
  }
}

function assertQualifiers(tokens, slug, aliases) {
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i]?.value !== ".") continue;
    const prev = tokens[i - 1];
    if (prev?.type !== "word") fail("calificador no válido");
    const lower = prev.value.toLowerCase();
    if (lower === "excluded" || aliases.has(lower) || isOwnTable(prev.value, slug)) continue;
    fail(`calificador no permitido (${prev.value})`);
  }
}

function assertParams(tokens, params) {
  if (!Array.isArray(params)) fail("params tiene que ser una lista");
  if (params.length > TABLE_LIMITS.maxParams) fail("demasiados parámetros");
  const names = new Set();
  for (const name of params) {
    if (typeof name !== "string" || name.length > TABLE_LIMITS.maxParamNameLength || !PARAM_NAME.test(name)) {
      fail("nombre de parámetro no válido");
    }
    if (names.has(name)) fail(`parámetro duplicado (${name})`);
    names.add(name);
  }
  const used = new Set();
  for (const token of tokens) {
    if (token.type === "param") used.add(token.value);
  }
  for (let index = 1; index <= params.length; index += 1) {
    if (!used.has(`?${index}`)) fail(`falta ?${index}`);
  }
  for (const marker of used) {
    const n = Number(marker.slice(1));
    if (!Number.isInteger(n) || n < 1 || n > params.length) fail(`el parámetro ${marker} no está declarado`);
  }
}

function parseQuery(tokens, params, slug) {
  const first = wordOf(tokens[0]);
  const aliases = new Set();
  if (first === "select") {
    if (tokens.some((token) => wordOf(token) === "into")) fail("SELECT no puede llevar INTO");
    assertLimit(tokens);
    collectQueryTables(tokens, slug, aliases);
  } else if (first === "insert") {
    if (wordOf(tokens[1]) !== "into") fail("hace falta INSERT INTO");
    collectQueryTables(tokens, slug, aliases);
  } else if (first === "update") {
    if (!tokens.some((token) => wordOf(token) === "where")) fail("UPDATE tiene que llevar WHERE");
    const table = tokens[1];
    if (table?.type !== "word") fail("falta la tabla");
    assertTableName(table.value, "app", slug);
    aliases.add(table.value.toLowerCase());
    if (wordOf(tokens[2]) !== "set") fail("hace falta UPDATE tabla SET");
    collectQueryTables(tokens, slug, aliases);
  } else if (first === "delete") {
    if (wordOf(tokens[1]) !== "from") fail("hace falta DELETE FROM");
    if (!tokens.some((token) => wordOf(token) === "where")) fail("DELETE tiene que llevar WHERE");
    collectQueryTables(tokens, slug, aliases);
  } else {
    fail("sentencia no admitida");
  }
  assertQualifiers(tokens, slug, aliases);
  assertParams(tokens, params);
}

function parseMigrationStatement(statement, mode, slug) {
  const tokens = tokenize(statement);
  if (tokens.length === 0) fail("sentencia vacía");
  assertForbidden(tokens);
  for (const token of tokens) {
    if (token.type === "word") assertSafeIdent(token.value, mode, slug);
  }
  const first = wordOf(tokens[0]);
  if (first === "create") return parseCreate(tokens, mode, slug);
  if (first === "alter") return parseAlter(tokens, mode, slug);
  fail("la migración solo puede crear tablas o índices, o añadir una columna");
}

function parseMigration(sql, mode, slug) {
  const statements = splitSqlStatements(sql);
  if (statements.length === 0) fail("la migración está vacía");
  if (statements.length > (mode === "lab" ? 24 : TABLE_LIMITS.maxStatementsPerMigration)) fail("demasiadas sentencias");
  const tables = [];
  const indexes = [];
  for (const statement of statements) {
    const parsed = parseMigrationStatement(statement, mode, slug);
    tables.push(...parsed.tables);
    indexes.push(...parsed.indexes);
  }
  return { statements, tables, indexes };
}

function parseQueries(slug, raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail(`${slug}: queries.json no es JSON`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) fail(`${slug}: queries.json tiene que ser un objeto`);
  const names = Object.keys(parsed);
  if (names.length < 1 || names.length > TABLE_LIMITS.maxQueries) fail(`${slug}: número de consultas`);
  const queries = {};
  for (const name of names) {
    if (name.length > TABLE_LIMITS.maxQueryNameLength || !QUERY_NAME.test(name)) fail(`${slug}: nombre de consulta ${name}`);
    const entry = parsed[name];
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) fail(`${slug}: consulta ${name}`);
    const keys = Object.keys(entry);
    if (keys.some((key) => key !== "sql" && key !== "params")) fail(`${slug}: la consulta ${name} tiene campos de más`);
    if (typeof entry.sql !== "string" || entry.sql.length === 0 || Buffer.byteLength(entry.sql) > TABLE_LIMITS.maxSqlBytes) {
      fail(`${slug}: SQL de ${name}`);
    }
    const statements = splitSqlStatements(entry.sql);
    if (statements.length !== 1) fail(`${slug}: ${name} tiene que ser una sola sentencia`);
    const tokens = tokenize(statements[0]);
    assertForbidden(tokens);
    for (const token of tokens) {
      if (token.type === "word") assertSafeIdent(token.value, "app", slug);
    }
    parseQuery(tokens, entry.params ?? [], slug);
    queries[name] = { sql: statements[0], params: [...(entry.params ?? [])] };
  }
  return queries;
}

/**
 * Valida `protos/<slug>/db/` si la app declara `tables`.
 * Sin esa capacidad, la carpeta no puede existir.
 */
export function assertAppDatabase(slug, protoDir, capabilities) {
  const dbDir = join(protoDir, "db");
  const exists = existsSync(dbDir) && statSync(dbDir).isDirectory();
  const wants = Array.isArray(capabilities) && capabilities.includes("tables");
  if (!wants && !exists) return null;
  if (!wants) fail(`${slug}: db/ solo puede existir si capabilities incluye tables`);
  if (!exists) fail(`${slug}: tables exige protos/${slug}/db/`);
  const names = readdirSync(dbDir).sort();
  if (names.some((name) => name.startsWith("."))) fail(`${slug}: db/ no admite ficheros ocultos`);
  const sqlFiles = names.filter((name) => name.endsWith(".sql"));
  const other = names.filter((name) => name !== "queries.json" && !name.endsWith(".sql"));
  if (other.length > 0) fail(`${slug}: db/ solo admite queries.json y migraciones NNNN_nombre.sql`);
  if (!names.includes("queries.json")) fail(`${slug}: falta db/queries.json`);
  if (sqlFiles.length < 1 || sqlFiles.length > TABLE_LIMITS.maxMigrations) fail(`${slug}: número de migraciones`);
  const migrations = [];
  const seen = new Set();
  for (const filename of sqlFiles) {
    if (!MIGRATION_FILE.test(filename)) fail(`${slug}: migración mal nombrada (${filename})`);
    const number = filename.slice(0, 4);
    if (seen.has(number)) fail(`${slug}: número de migración repetido (${number})`);
    seen.add(number);
    const sql = readFileSync(join(dbDir, filename), "utf8");
    if (Buffer.byteLength(sql) > TABLE_LIMITS.maxMigrationBytes) fail(`${slug}: ${filename} pasa del cupo`);
    let parsed;
    try {
      parsed = parseMigration(sql, "app", slug);
    } catch (error) {
      fail(`${slug}: ${filename}: ${error instanceof Error ? error.message : "SQL no válido"}`);
    }
    migrations.push({ filename, sql, checksum: checksumSql(sql), ...parsed });
  }
  const tables = migrations.flatMap((migration) => migration.tables);
  const indexes = migrations.flatMap((migration) => migration.indexes);
  if (new Set(tables).size !== tables.length) fail(`${slug}: tabla repetida`);
  if (tables.length > TABLE_LIMITS.maxTables) fail(`${slug}: demasiadas tablas`);
  if (indexes.length > TABLE_LIMITS.maxIndexes) fail(`${slug}: demasiados índices`);
  let queries;
  try {
    queries = parseQueries(slug, readFileSync(join(dbDir, "queries.json"), "utf8"));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(`${slug}:`)) throw error;
    fail(`${slug}: ${error instanceof Error ? error.message : "consultas no válidas"}`);
  }
  return { migrations, queries };
}

/** Migraciones numeradas del laboratorio, en `migrations/`. */
export function assertLabMigrations(repoRoot) {
  const dir = join(repoRoot, "migrations");
  if (!existsSync(dir)) fail("faltan las migraciones del lab");
  const files = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort();
  if (files.length < 1 || files.length > LAB_MIGRATION_LIMITS.maxFiles) fail("número de migraciones del lab");
  const migrations = [];
  for (const filename of files) {
    if (!MIGRATION_FILE.test(filename)) fail(`migración del lab mal nombrada (${filename})`);
    const sql = readFileSync(join(dir, filename), "utf8");
    if (Buffer.byteLength(sql) > LAB_MIGRATION_LIMITS.maxBytes) fail(`${filename} pasa del cupo`);
    let parsed;
    try {
      parsed = parseMigration(sql, "lab", "lab");
    } catch (error) {
      fail(`${filename}: ${error instanceof Error ? error.message : "SQL no válido"}`);
    }
    migrations.push({ filename, sql, checksum: checksumSql(sql), ...parsed });
  }
  return migrations;
}

export function readTableQueries(repoRoot) {
  const protosDir = join(repoRoot, "protos");
  const queries = {};
  if (!existsSync(protosDir)) return queries;
  for (const dirName of readdirSync(protosDir).sort()) {
    const protoDir = join(protosDir, dirName);
    if (!statSync(protoDir).isDirectory()) continue;
    const manifestPath = join(protoDir, "proto.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const capabilities = Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
    if (!capabilities.includes("tables")) continue;
    const database = assertAppDatabase(dirName, protoDir, capabilities);
    if (database) queries[dirName] = database.queries;
  }
  return queries;
}
