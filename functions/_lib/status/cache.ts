import { STATUS_CACHE_KEY, STATUS_CACHE_TTL_SECONDS } from "./constants";

export type StatusCachePayload = {
  fetchedAt: string;
  partial: boolean;
  items: unknown[];
};

export type KvLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

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
    await kv.put(STATUS_CACHE_KEY, JSON.stringify(payload), { expirationTtl: STATUS_CACHE_TTL_SECONDS });
  } catch {
    // Sin caché no debe tumbar la respuesta.
  }
}

export { STATUS_CACHE_KEY, STATUS_CACHE_TTL_SECONDS };
