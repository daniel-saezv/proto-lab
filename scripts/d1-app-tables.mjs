import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assertAppDatabase, assertLabMigrations, checksumSql, isOwnTable, tablePrefix } from "./table-sql.mjs";

export const D1_TOKEN_SECRET = "CLOUDFLARE_D1_TOKEN";
export const ACCOUNT_SECRET = "CLOUDFLARE_ACCOUNT_ID";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const IDENT = /^[a-z][a-z0-9_]*$/;

export const BOOKKEEPING_SQL = [
  `CREATE TABLE IF NOT EXISTS proto_lab_migrations (
  scope TEXT NOT NULL,
  filename TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  PRIMARY KEY (scope, filename)
)`,
  `CREATE TABLE IF NOT EXISTS proto_lab_app_tables (
  slug TEXT NOT NULL,
  table_name TEXT NOT NULL,
  PRIMARY KEY (slug, table_name)
)`,
];

const FREE_TIER = /exceeded D1's free tier|exceeded D1's maximum account storage|Exceeded maximum DB size|maximum response size limit/i;

export function readD1Bindings(toml) {
  const blocks = [];
  let current = null;
  for (const raw of String(toml).split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const header = /^\[\[([A-Za-z0-9_.]+)\]\]$/.exec(line);
    if (header) {
      current = { name: header[1], values: {} };
      blocks.push(current);
      continue;
    }
    const pair = /^([A-Za-z0-9_]+)\s*=\s*"([^"]*)"$/.exec(line);
    if (pair && current) current.values[pair[1]] = pair[2];
  }
  const take = (name) => blocks.find((block) => block.name === name)?.values ?? null;
  const production = take("d1_databases");
  const preview = take("env.preview.d1_databases");
  const previewKv = take("env.preview.kv_namespaces");
  if (!production?.database_id || !production.database_name || production.binding !== "DB") {
    throw new Error("wrangler.toml no tiene el binding DB de producción");
  }
  if (!preview?.database_id || !preview.database_name || preview.binding !== "DB") {
    throw new Error("wrangler.toml no tiene el binding DB de preview");
  }
  return { production, preview, previewKv };
}

export function isZeroSha(sha) {
  return !sha || /^0+$/.test(sha);
}

/**
 * @param {Record<string, { files: Record<string, string> }>} before
 * @param {Record<string, { files: Record<string, string> }>} after
 */
/**
 * Una migración del lab ya aplicada no se reescribe.
 * Una fila de otra PR, en la base de preview compartida, se deja.
 * Borrar un archivo que la base git ya tenía aplicado sí es un error.
 * @param {Record<string, string>} beforeLab
 * @param {{ filename: string, checksum: string }[]} lab
 * @param {Map<string, string>} applied
 */
export function labHistoryErrors(beforeLab, lab, applied) {
  const errors = [];
  const byName = new Map(lab.map((migration) => [migration.filename, migration]));
  for (const [filename, previous] of Object.entries(beforeLab)) {
    const recorded = applied.get(filename);
    if (!recorded) continue;
    const next = byName.get(filename);
    if (!next || next.checksum !== recorded || previous !== recorded) {
      errors.push(
        next
          ? `${filename} ya está aplicada con otro contenido. Añade una migración nueva.`
          : `${filename} ya está aplicada y ya no está en migrations/. La tabla del lab no se borra.`,
      );
    }
  }
  for (const migration of lab) {
    const recorded = applied.get(migration.filename);
    if (recorded && recorded !== migration.checksum) {
      errors.push(`${migration.filename} ya está aplicada con otro contenido. Añade una migración nueva.`);
    }
  }
  return errors;
}

export function planAppChanges(before, after) {
  const errors = [];
  const drop = [];
  const apply = [];
  for (const [slug, prev] of Object.entries(before)) {
    if (!after[slug]) drop.push(slug);
  }
  for (const [slug, next] of Object.entries(after)) {
    const prev = before[slug];
    if (!prev) {
      apply.push(slug);
      continue;
    }
    let added = false;
    for (const [name, checksum] of Object.entries(prev.files)) {
      if (!(name in next.files)) {
        errors.push(`${slug}: no quites la migración ${name}. Añade un archivo nuevo.`);
      } else if (next.files[name] !== checksum) {
        errors.push(`${slug}: ${name} ha cambiado. Añade una migración nueva; no edites la que ya está.`);
      }
    }
    for (const name of Object.keys(next.files)) {
      if (!(name in prev.files)) added = true;
    }
    if (added) apply.push(slug);
  }
  return { drop, apply, errors };
}

export function dropTableSql(slug, tableName) {
  if (!IDENT.test(tableName) || !isOwnTable(tableName, slug)) {
    throw new Error(`no se puede borrar ${tableName}`);
  }
  if (tableName === "lab_shared_entries" || tableName.startsWith("proto_lab_") || tableName.startsWith("sqlite_") || tableName.startsWith("d1_")) {
    throw new Error(`tabla reservada ${tableName}`);
  }
  return `DROP TABLE IF EXISTS "${tableName}"`;
}

function git(repo, args) {
  return execFileSync("git", args, {
    cwd: repo,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function capabilitiesOf(raw) {
  try {
    const manifest = JSON.parse(raw);
    return Array.isArray(manifest.capabilities) ? manifest.capabilities : [];
  } catch {
    return [];
  }
}

export function fingerprintsFromFiles(files) {
  const out = {};
  for (const [name, sql] of Object.entries(files)) out[name] = checksumSql(sql);
  return out;
}

export function loadAppFingerprintsFromDisk(repo) {
  const protos = join(repo, "protos");
  const apps = {};
  if (!existsSync(protos)) return apps;
  for (const slug of readdirSync(protos).sort()) {
    const protoDir = join(protos, slug);
    if (!statSync(protoDir).isDirectory() || !SLUG.test(slug)) continue;
    const manifestPath = join(protoDir, "proto.json");
    if (!existsSync(manifestPath)) continue;
    if (!capabilitiesOf(readFileSync(manifestPath, "utf8")).includes("tables")) continue;
    const database = assertAppDatabase(slug, protoDir, ["tables"]);
    const files = {};
    for (const migration of database.migrations) files[migration.filename] = migration.checksum;
    apps[slug] = { files, database };
  }
  return apps;
}

export function loadLabFingerprintsFromGit(repo, ref) {
  const files = {};
  let listing = "";
  try {
    listing = git(repo, ["ls-tree", "--name-only", ref, "migrations"]);
  } catch {
    return files;
  }
  for (const path of listing.split("\n").map((item) => item.trim()).filter(Boolean)) {
    if (!path.endsWith(".sql")) continue;
    const filename = path.slice(path.lastIndexOf("/") + 1);
    files[filename] = checksumSql(git(repo, ["show", `${ref}:${path}`]));
  }
  return files;
}

export function loadAppFingerprintsFromGit(repo, ref) {
  const apps = {};
  let listing = "";
  try {
    listing = git(repo, ["ls-tree", "-d", "--name-only", ref, "protos"]);
  } catch {
    return apps;
  }
  for (const line of listing.split("\n").map((item) => item.trim()).filter(Boolean)) {
    const slug = line.replace(/^protos\//, "");
    if (!SLUG.test(slug)) continue;
    let manifest = "";
    try {
      manifest = git(repo, ["show", `${ref}:protos/${slug}/proto.json`]);
    } catch {
      continue;
    }
    if (!capabilitiesOf(manifest).includes("tables")) continue;
    let dbListing = "";
    try {
      dbListing = git(repo, ["ls-tree", "--name-only", ref, `protos/${slug}/db`]);
    } catch {
      dbListing = "";
    }
    const files = {};
    for (const path of dbListing.split("\n").map((item) => item.trim()).filter(Boolean)) {
      if (!path.endsWith(".sql")) continue;
      const filename = path.slice(path.lastIndexOf("/") + 1);
      const sql = git(repo, ["show", `${ref}:${path}`]);
      files[filename] = checksumSql(sql);
    }
    apps[slug] = { files };
  }
  return apps;
}

function queryUrl(accountId, databaseId) {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
}

async function d1Query(fetchImpl, accountId, databaseId, token, sql, params) {
  const response = await fetchImpl(queryUrl(accountId, databaseId), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ sql, params }),
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  if (response.status === 401 || response.status === 403) {
    const error = new Error("auth");
    error.code = "auth";
    throw error;
  }
  const message = Array.isArray(body.errors) ? body.errors.map((item) => item?.message ?? "").join("; ") : "";
  if (!response.ok || body.success === false) {
    const error = new Error(message || `HTTP ${response.status}`);
    if (response.status === 404 || /not found|does not exist|invalid database/i.test(message)) error.code = "missing";
    else if (FREE_TIER.test(message)) error.code = "quota";
    throw error;
  }
  const first = Array.isArray(body.result) ? body.result[0] : null;
  return Array.isArray(first?.results) ? first.results : [];
}

async function resolveAccountId(fetchImpl, token, explicit) {
  if (explicit && /^[a-f0-9]{32}$/i.test(explicit)) return explicit;
  const response = await fetchImpl("https://api.cloudflare.com/client/v4/accounts?per_page=20", {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) {
    const error = new Error("auth");
    error.code = "auth";
    throw error;
  }
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  const accounts = Array.isArray(body.result) ? body.result : [];
  if (accounts.length === 1 && typeof accounts[0]?.id === "string") return accounts[0].id;
  const error = new Error("account");
  error.code = "account";
  throw error;
}

function skip(message) {
  return { exitCode: 0, status: "skipped", message };
}

async function appliedMap(query, scope) {
  const rows = await query("SELECT filename, checksum FROM proto_lab_migrations WHERE scope = ?1", [scope]);
  const map = new Map();
  for (const row of rows) {
    if (typeof row.filename === "string" && typeof row.checksum === "string") map.set(row.filename, row.checksum);
  }
  return map;
}

async function applyFile(query, scope, migration, now) {
  const applied = await appliedMap(query, scope);
  const current = applied.get(migration.filename);
  if (current === migration.checksum) return "same";
  if (current) {
    throw new Error(`${migration.filename} ya está aplicada con otro contenido. Añade una migración nueva.`);
  }
  for (const statement of migration.statements) {
    await query(statement, []);
  }
  await query(
    "INSERT INTO proto_lab_migrations (scope, filename, checksum, applied_at) VALUES (?1, ?2, ?3, ?4)",
    [scope, migration.filename, migration.checksum, now],
  );
  return "applied";
}

/**
 * Aplica migraciones del lab y de las apps, y borra las tablas de una app eliminada.
 * No crea bases ni bindings. Si falta el secreto o la base, sale con 0.
 */
export async function runTableWorkflow(input) {
  const log = input.log ?? (() => {});
  const repo = input.repo;
  const target = input.target;
  if (!target) return skip("Este evento no aplica migraciones.");
  let lab;
  let after;
  try {
    lab = input.labMigrations ?? assertLabMigrations(repo);
    after = input.after ?? loadAppFingerprintsFromDisk(repo);
  } catch (error) {
    return { exitCode: 1, status: "invalid", message: error instanceof Error ? error.message : "SQL no válido" };
  }
  const before = input.allowDrop === false ? {} : (input.before ?? {});
  const plan = planAppChanges(
    Object.fromEntries(Object.entries(before).map(([slug, value]) => [slug, { files: value.files }])),
    Object.fromEntries(Object.entries(after).map(([slug, value]) => [slug, { files: value.files }])),
  );
  if (plan.errors.length > 0) {
    return { exitCode: 1, status: "invalid", message: plan.errors.join("\n") };
  }
  const token = (input.token ?? "").trim();
  if (!token) {
    return skip(
      [
        `No está el secreto ${D1_TOKEN_SECRET}. No se ha aplicado ninguna migración.`,
        "Créalo en GitHub → Settings → Secrets and variables → Actions.",
        "Permiso único del token: Account → D1 → Edit, en la cuenta del laboratorio.",
        "Sin Pages, sin Workers y sin ningún otro permiso.",
        "Este workflow no crea las bases ni el binding DB.",
      ].join(" "),
    );
  }
  const bindings = readD1Bindings(input.wranglerToml ?? readFileSync(join(repo, "wrangler.toml"), "utf8"));
  const database = target === "production" ? bindings.production : bindings.preview;
  const fetchImpl = input.fetchImpl ?? fetch;
  let accountId;
  try {
    accountId = await resolveAccountId(fetchImpl, token, input.accountId ?? "");
  } catch (error) {
    if (error?.code === "auth") {
      return skip(
        `Cloudflare ha rechazado ${D1_TOKEN_SECRET}. El token tiene que tener solo el permiso Account → D1 → Edit. No se ha cambiado nada.`,
      );
    }
    return skip(
      `No se ha podido saber la cuenta de Cloudflare. Añade el secreto ${ACCOUNT_SECRET} (el identificador de la cuenta, el mismo de la limpieza de previews; no es un permiso del token). No se ha cambiado nada.`,
    );
  }
  const query = (sql, params) => d1Query(fetchImpl, accountId, database.database_id, token, sql, params);
  const now = input.now ?? new Date().toISOString();
  try {
    for (const statement of BOOKKEEPING_SQL) await query(statement, []);
    const appliedLab = await appliedMap(query, "lab");
    const labErrors = labHistoryErrors(input.beforeLab ?? {}, lab, appliedLab);
    if (labErrors.length > 0) {
      return { exitCode: 1, status: "invalid", message: labErrors.join("\n") };
    }
    for (const migration of lab) {
      const result = await applyFile(query, "lab", migration, now);
      if (result === "applied") log(`lab ${migration.filename} aplicada en ${database.database_name}`);
    }
    for (const slug of Object.keys(after).sort()) {
      const databaseApp = after[slug].database;
      if (!databaseApp) continue;
      for (const migration of databaseApp.migrations) {
        const result = await applyFile(query, `app:${slug}`, migration, now);
        for (const tableName of migration.tables) {
          dropTableSql(slug, tableName);
          await query("INSERT OR IGNORE INTO proto_lab_app_tables (slug, table_name) VALUES (?1, ?2)", [slug, tableName]);
        }
        if (result === "applied") log(`${slug} ${migration.filename} aplicada en ${database.database_name}`);
      }
    }
    for (const slug of plan.drop) {
      const rows = await query("SELECT table_name FROM proto_lab_app_tables WHERE slug = ?1", [slug]);
      for (const row of rows) {
        const tableName = String(row.table_name ?? "");
        let statement;
        try {
          statement = dropTableSql(slug, tableName);
        } catch {
          log(`no se borra ${tableName}: no pertenece a ${slug}`);
          continue;
        }
        await query(statement, []);
        await query("DELETE FROM proto_lab_app_tables WHERE slug = ?1 AND table_name = ?2", [slug, tableName]);
      }
      await query("DELETE FROM proto_lab_migrations WHERE scope = ?1", [`app:${slug}`]);
      log(`tablas de ${slug} borradas en ${database.database_name}`);
    }
  } catch (error) {
    if (error?.code === "missing") {
      return skip(
        `La base D1 «${database.database_name}» no existe o no es visible. Las bases y el binding DB se crean a mano. No se ha cambiado nada.`,
      );
    }
    if (error?.code === "auth") {
      return skip(
        `Cloudflare ha rechazado ${D1_TOKEN_SECRET}. El token tiene que tener solo el permiso Account → D1 → Edit. No se ha cambiado nada.`,
      );
    }
    if (error?.code === "quota") {
      return {
        exitCode: 1,
        status: "quota",
        message: "Se ha alcanzado el cupo gratuito de D1. La migración falla y no se cobra. No se reintenta.",
      };
    }
    return { exitCode: 1, status: "failed", message: error instanceof Error ? error.message : "No se pudo aplicar la migración" };
  }
  const summary = `Migraciones al día en ${database.database_name}. Apps a revisar: ${plan.apply.length}. Apps a borrar: ${plan.drop.length}.`;
  log(summary);
  return { exitCode: 0, status: "ok", message: summary };
}

function resolveTarget(env) {
  if (env.EVENT_NAME === "pull_request") return "preview";
  if (env.EVENT_NAME === "push" && env.GITHUB_REF === "refs/heads/main") return "production";
  return null;
}

function resolveBeforeSha(repo, env) {
  if (env.EVENT_NAME === "pull_request") {
    if (env.PR_BASE_SHA && !isZeroSha(env.PR_BASE_SHA)) return env.PR_BASE_SHA;
    try {
      return git(repo, ["rev-parse", "HEAD^1"]).trim();
    } catch {
      return "";
    }
  }
  return env.BEFORE_SHA ?? "";
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === new URL(`file://${entry}`).href || fileURLToPath(import.meta.url) === entry;
}

if (invokedDirectly()) {
  const repo = dirname(dirname(fileURLToPath(import.meta.url)));
  const env = process.env;
  const target = resolveTarget(env);
  const beforeSha = resolveBeforeSha(repo, env);
  const allowDrop = !isZeroSha(beforeSha);
  let before = {};
  let beforeLab = {};
  if (allowDrop && target) {
    try {
      before = loadAppFingerprintsFromGit(repo, beforeSha);
      beforeLab = loadLabFingerprintsFromGit(repo, beforeSha);
    } catch (error) {
      console.error(error instanceof Error ? error.message : "No se pudo leer el commit base");
      process.exit(1);
    }
  }
  const result = await runTableWorkflow({
    repo,
    target,
    token: env[D1_TOKEN_SECRET] ?? "",
    accountId: env[ACCOUNT_SECRET] ?? "",
    before,
    beforeLab,
    allowDrop,
    now: new Date().toISOString(),
    log: (line) => console.log(line),
  });
  console.log(result.message);
  process.exit(result.exitCode);
}
