import { readAccessEmail } from "./access";
import { jsonResponse } from "./http";
import { D1_BINDING, BANNED_SHARED_KEYS, SHARED_KEY, SHARED_LIMITS, isFreeTierQuota } from "./shared-limits";
import { SHARED_SQL } from "./shared-sql";

export type SharedStatement = {
  bind(...values: unknown[]): {
    first(): Promise<Record<string, unknown> | null>;
    run(): Promise<{ success: boolean }>;
  };
};

/** Subconjunto de D1 que usa esta Function. Los tests lo sustituyen por un mock. */
export type SharedDatabase = {
  prepare(sql: string): SharedStatement;
};

export type SharedEnv = {
  CF_ACCESS_AUD?: string;
  DB?: SharedDatabase;
};

export type SharedOptions = {
  sharedSlugs: readonly string[];
  now?: Date;
  fetchImpl?: typeof fetch;
};

const SLUG_IN_PATH = /^\/api\/apps\/([a-z0-9]+(?:-[a-z0-9]+)*)\/shared\/?$/;
const ALLOWED_FIELDS = new Set(["op", "key", "value"]);
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
  const match = SLUG_IN_PATH.exec(pathname);
  const slug = match?.[1];
  if (!slug || slug.length > SHARED_LIMITS.maxSlugLength) return null;
  return slug;
}

function validKey(key: unknown): key is string {
  return (
    typeof key === "string" &&
    key.length > 0 &&
    key.length <= SHARED_LIMITS.maxKeyLength &&
    SHARED_KEY.test(key) &&
    !BANNED_SHARED_KEYS.has(key)
  );
}

async function readJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().includes("application/json")) {
    return { ok: false, message: "El cuerpo tiene que ir en JSON." };
  }
  const declared = Number(request.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > SHARED_LIMITS.maxBodyBytes) {
    return { ok: false, message: "El cuerpo es demasiado grande." };
  }
  const reader = request.body?.getReader();
  let text: string;
  if (!reader) {
    text = await request.text();
    if (new TextEncoder().encode(text).byteLength > SHARED_LIMITS.maxBodyBytes) {
      return { ok: false, message: "El cuerpo es demasiado grande." };
    }
  } else {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > SHARED_LIMITS.maxBodyBytes) {
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

function unavailable(action: "leer" | "guardar" | "borrar"): Response {
  const verb = action === "leer" ? "leer" : action === "guardar" ? "guardar" : "borrar";
  return json(503, { ok: false, error: "unavailable", message: `No he podido ${verb} el dato compartido.` });
}

function quotaOrUnavailable(error: unknown, action: "leer" | "guardar" | "borrar"): Response {
  if (isFreeTierQuota(error)) {
    return json(503, { ok: false, error: "quota", message: FREE_QUOTA_MESSAGE });
  }
  return unavailable(action);
}

/**
 * Lee y escribe datos compartidos de un slug.
 * La identidad sale del JWT de Access. El slug sale de la ruta, no del cuerpo.
 */
export async function handleShared(request: Request, env: SharedEnv, options: SharedOptions): Promise<Response> {
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
  if (!slug || !options.sharedSlugs.includes(slug)) {
    return json(403, { ok: false, error: "forbidden", message: "Esta aplicación no comparte datos." });
  }

  const parsed = await readJson(request);
  if (!parsed.ok) {
    return json(400, { ok: false, error: "invalid", message: parsed.message });
  }
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return json(400, { ok: false, error: "invalid", message: "La petición tiene que ser un objeto." });
  }
  const body = parsed.value as Record<string, unknown>;
  for (const field of Object.keys(body)) {
    if (!ALLOWED_FIELDS.has(field)) {
      return json(400, { ok: false, error: "invalid", message: "La petición tiene campos que no admite." });
    }
  }
  if (body.op !== "get" && body.op !== "set" && body.op !== "delete") {
    return json(400, { ok: false, error: "invalid", message: "La operación no es válida." });
  }
  if (!validKey(body.key)) {
    return json(400, { ok: false, error: "invalid", message: "La clave no es válida." });
  }
  if (body.op !== "set" && "value" in body) {
    return json(400, { ok: false, error: "invalid", message: "La petición tiene campos que no admite." });
  }

  const db = env.DB;
  const key = body.key;

  if (body.op === "get") {
    try {
      const row = await db.prepare(SHARED_SQL.get).bind(slug, key).first();
      const value = row && typeof row.value === "string" ? row.value : null;
      return json(200, { ok: true, value });
    } catch (error) {
      return quotaOrUnavailable(error, "leer");
    }
  }

  if (body.op === "delete") {
    try {
      await db.prepare(SHARED_SQL.delete).bind(slug, key).run();
      return json(200, { ok: true, value: null });
    } catch (error) {
      return quotaOrUnavailable(error, "borrar");
    }
  }

  if (typeof body.value !== "string") {
    return json(400, { ok: false, error: "invalid", message: "El valor tiene que ser un texto." });
  }
  const bytes = utf8Bytes(body.value);
  if (bytes > SHARED_LIMITS.maxValueBytes) {
    return json(400, { ok: false, error: "quota", message: "El valor pasa del cupo de datos compartidos." });
  }

  const updatedAt = (options.now ?? new Date()).toISOString();
  try {
    const row = await db
      .prepare(SHARED_SQL.upsert)
      .bind(slug, key, body.value, bytes, updatedAt, SHARED_LIMITS.maxKeys, SHARED_LIMITS.maxSlugBytes)
      .first();
    if (!row) {
      return json(400, { ok: false, error: "quota", message: "Esa aplicación ya no admite más datos compartidos." });
    }
    return json(200, { ok: true, value: null });
  } catch (error) {
    return quotaOrUnavailable(error, "guardar");
  }
}
