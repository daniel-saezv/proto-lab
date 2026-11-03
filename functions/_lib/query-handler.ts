import { readAccessEmail } from "./access";
import { jsonResponse } from "./http";
import { D1_BINDING, isFreeTierQuota } from "./shared-limits";
import { TABLE_LIMITS } from "./table-limits";

export type DeclaredQuery = {
  sql: string;
  params: string[];
};

export type QueryCatalog = Record<string, Record<string, DeclaredQuery>>;

export type QueryDatabase = {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all(): Promise<Record<string, unknown>[]>;
    };
  };
};

export type QueryEnv = {
  CF_ACCESS_AUD?: string;
  DB?: QueryDatabase;
};

export type QueryOptions = {
  queries: QueryCatalog;
  fetchImpl?: typeof fetch;
};

const SLUG_IN_PATH = /^\/api\/apps\/([a-z0-9]+(?:-[a-z0-9]+)*)\/query\/?$/;
const ALLOWED_FIELDS = new Set(["name", "params"]);
const FREE_QUOTA_MESSAGE = "Se ha alcanzado el cupo gratuito de D1. La petición falla y no se cobra.";

function json(status: number, body: unknown): Response {
  return jsonResponse(status, body);
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function slugFromUrl(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }
  const slug = SLUG_IN_PATH.exec(pathname)?.[1];
  if (!slug || slug.length > 40) return null;
  return slug;
}

async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, message: "El cuerpo tiene que ir en JSON." };
  }
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > TABLE_LIMITS.maxBodyBytes) {
    return { ok: false, message: "El cuerpo es demasiado grande." };
  }
  const reader = request.body?.getReader();
  let text: string;
  if (!reader) {
    text = await request.text();
    if (utf8Bytes(text) > TABLE_LIMITS.maxBodyBytes) return { ok: false, message: "El cuerpo es demasiado grande." };
  } else {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > TABLE_LIMITS.maxBodyBytes) {
        await reader.cancel().catch(() => {});
        return { ok: false, message: "El cuerpo es demasiado grande." };
      }
      chunks.push(value);
    }
    const all = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      all.set(chunk, offset);
      offset += chunk.byteLength;
    }
    text = new TextDecoder().decode(all);
  }
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false, message: "No he podido leer el JSON." };
  }
}

function quotaOrUnavailable(error: unknown): Response {
  if (isFreeTierQuota(error)) {
    return json(503, { ok: false, error: "quota", message: FREE_QUOTA_MESSAGE });
  }
  return json(503, { ok: false, error: "unavailable", message: "No he podido ejecutar la consulta." });
}

function plainCell(value: unknown): { ok: true; value: string | number | boolean | null } | { ok: false } {
  if (value == null) return { ok: true, value: null };
  if (typeof value === "string" || typeof value === "boolean") return { ok: true, value };
  if (typeof value === "number" && Number.isFinite(value)) return { ok: true, value };
  if (typeof value === "bigint") {
    const asNumber = Number(value);
    if (Number.isSafeInteger(asNumber)) return { ok: true, value: asNumber };
  }
  return { ok: false };
}

function plainRows(rows: Record<string, unknown>[]): { ok: true; rows: Record<string, unknown>[] } | { ok: false; reason: "shape" | "rows" | "bytes" } {
  if (rows.length > TABLE_LIMITS.maxRows) return { ok: false, reason: "rows" };
  const plain: Record<string, unknown>[] = [];
  for (const row of rows) {
    if (!row || typeof row !== "object" || Array.isArray(row)) return { ok: false, reason: "shape" };
    const copy: Record<string, unknown> = {};
    const entries = Object.entries(row);
    if (entries.length > 32) return { ok: false, reason: "shape" };
    for (const [key, value] of entries) {
      if (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(key)) return { ok: false, reason: "shape" };
      const cell = plainCell(value);
      if (!cell.ok) return { ok: false, reason: "shape" };
      copy[key] = cell.value;
    }
    plain.push(copy);
  }
  if (utf8Bytes(JSON.stringify(plain)) > TABLE_LIMITS.maxResultBytes) return { ok: false, reason: "bytes" };
  return { ok: true, rows: plain };
}

function bindValue(
  value: unknown,
): { ok: true; value: string | number | null } | { ok: false; error: "invalid" | "quota"; message: string } {
  if (value === null) return { ok: true, value: null };
  if (typeof value === "string") {
    if (utf8Bytes(value) > TABLE_LIMITS.maxStringBytes) {
      return { ok: false, error: "quota", message: "Un parámetro pasa del cupo." };
    }
    return { ok: true, value };
  }
  if (typeof value === "number" && Number.isFinite(value)) return { ok: true, value };
  return { ok: false, error: "invalid", message: "Un parámetro tiene que ser texto, número o null." };
}

/**
 * Ejecuta una consulta declarada por la aplicación.
 * El SQL sale del catálogo generado; el navegador solo manda el nombre y los parámetros.
 * La identidad sale del JWT. El slug sale de la ruta.
 */
export async function handleQuery(request: Request, env: QueryEnv, options: QueryOptions): Promise<Response> {
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "method", message: "Solo se acepta POST." });
  }
  const email = await readAccessEmail(request, { CF_ACCESS_AUD: env.CF_ACCESS_AUD }, options.fetchImpl ?? fetch);
  if (!email) {
    return json(401, { ok: false, error: "unauthorized", message: "No hay una sesión de Cloudflare Access." });
  }
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json(503, {
      ok: false,
      error: "config",
      message: `Falta el binding D1 «${D1_BINDING}» en este despliegue. wrangler.toml lo declara en producción y en preview.`,
    });
  }
  const slug = slugFromUrl(request.url);
  const appQueries = slug ? options.queries[slug] : undefined;
  if (!slug || !appQueries) {
    return json(403, { ok: false, error: "forbidden", message: "Esta aplicación no tiene tablas." });
  }
  const parsed = await readJson(request);
  if (!parsed.ok) return json(400, { ok: false, error: "invalid", message: parsed.message });
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return json(400, { ok: false, error: "invalid", message: "La petición tiene que ser un objeto." });
  }
  const body = parsed.value as Record<string, unknown>;
  for (const field of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(field)) {
      return json(400, { ok: false, error: "invalid", message: "La petición tiene campos que no admite." });
    }
  }
  if (typeof body.name !== "string" || !Object.hasOwn(appQueries, body.name)) {
    return json(400, { ok: false, error: "invalid", message: "La consulta no está declarada." });
  }
  const declared = appQueries[body.name];
  if (!declared) return json(400, { ok: false, error: "invalid", message: "La consulta no está declarada." });
  const params = body.params ?? {};
  if (!params || typeof params !== "object" || Array.isArray(params)) {
    return json(400, { ok: false, error: "invalid", message: "Los parámetros tienen que ser un objeto." });
  }
  const received = params as Record<string, unknown>;
  const names = declared.params;
  if (names.length > TABLE_LIMITS.maxParams) {
    return json(400, { ok: false, error: "invalid", message: "La consulta no es válida." });
  }
  const keys = Object.keys(received);
  if (keys.length !== names.length || names.some((name) => !Object.hasOwn(received, name))) {
    return json(400, { ok: false, error: "invalid", message: "Los parámetros no coinciden con la consulta." });
  }
  const values: Array<string | number | null> = [];
  for (const name of names) {
    const bound = bindValue(received[name]);
    if (!bound.ok) return json(400, { ok: false, error: bound.error, message: bound.message });
    values.push(bound.value);
  }
  try {
    const rows = await env.DB.prepare(declared.sql).bind(...values).all();
    const plain = plainRows(rows);
    if (!plain.ok) {
      const message = plain.reason === "shape" ? "La consulta ha devuelto un dato que no se puede enviar." : "La consulta pasa del cupo de resultados.";
      return json(plain.reason === "shape" ? 503 : 400, {
        ok: false,
        error: plain.reason === "shape" ? "unavailable" : "quota",
        message,
      });
    }
    return json(200, { ok: true, rows: plain.rows });
  } catch (error) {
    return quotaOrUnavailable(error);
  }
}
