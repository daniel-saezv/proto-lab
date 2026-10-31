import { STATUS_CACHE_KEY, STATUS_CACHE_STORE_SECONDS, STATUS_CACHE_TTL_SECONDS } from "./constants";

export type StatusCachePayload = {
  fetchedAt: string;
  partial: boolean;
  items: unknown[];
};

export type KvLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete?(key: string): Promise<void>;
};

export type CacheFreshness = "fresh" | "stale" | "invalid";

/** `fresh` se sirve tal cual. `stale` solo si la lectura nueva de GitHub falla. */
export function cacheFreshness(payload: StatusCachePayload, nowMs: number): CacheFreshness {
  if (!payload || typeof payload.fetchedAt !== "string" || !Array.isArray(payload.items)) return "invalid";
  const fetched = Date.parse(payload.fetchedAt);
  if (Number.isNaN(fetched)) return "invalid";
  const age = nowMs - fetched;
  if (age < 0) return "invalid";
  if (age <= STATUS_CACHE_TTL_SECONDS * 1000) return "fresh";
  if (age <= STATUS_CACHE_STORE_SECONDS * 1000) return "stale";
  return "invalid";
}

export async function readStatusCache(kv: KvLike | undefined): Promise<StatusCachePayload | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(STATUS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StatusCachePayload;
    if (!parsed || typeof parsed !== "object" || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export async function writeStatusCache(kv: KvLike | undefined, payload: StatusCachePayload): Promise<void> {
  if (!kv) return;
  try {
    await kv.put(STATUS_CACHE_KEY, JSON.stringify(payload), { expirationTtl: STATUS_CACHE_STORE_SECONDS });
  } catch {
    // Sin caché no debe tumbar la respuesta.
  }
}

export async function deleteStatusCache(kv: KvLike | undefined): Promise<void> {
  if (!kv?.delete) return;
  try {
    await kv.delete(STATUS_CACHE_KEY);
  } catch {
    // Si no se puede borrar, el TTL fresco sigue acotando lo viejo.
  }
}

export { STATUS_CACHE_KEY, STATUS_CACHE_STORE_SECONDS, STATUS_CACHE_TTL_SECONDS };
