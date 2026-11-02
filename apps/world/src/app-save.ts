/** Cupo del guardado por aplicación. Una sola bolsa JSON por slug. */
export const SAVE_LIMITS = {
  maxKeyLength: 64,
  maxKeys: 32,
  maxValueBytes: 32 * 1024,
  maxSlugBytes: 256 * 1024,
} as const;

export const APP_SAVE_PREFIX = "proto-lab:app:";

const KEY_RE = /^[A-Za-z0-9._-]+$/;
const BANNED_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export type SaveLimits = {
  maxKeyLength: number;
  maxKeys: number;
  maxValueBytes: number;
  maxSlugBytes: number;
};

export type SaveResult =
  | { source: "proto-lab"; type: "save-result"; id: number; ok: true; value: string | null }
  | { source: "proto-lab"; type: "save-result"; id: number; ok: false; error: "invalid" | "quota" };

export function appStorageKey(slug: string): string {
  return `${APP_SAVE_PREFIX}${slug}`;
}

function utf8Bytes(value: string): number {
  return new TextEncoder().encode(value).length;
}

function validKey(key: unknown, limits: SaveLimits): key is string {
  return typeof key === "string" && key.length > 0 && key.length <= limits.maxKeyLength && KEY_RE.test(key) && !BANNED_KEYS.has(key);
}

export type AppSave = {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
};

export function createAppSave(storage: Storage, slug: string, limits: SaveLimits = SAVE_LIMITS): AppSave {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("invalid");
  }
  const storageKey = appStorageKey(slug);

  function read(): Record<string, string> {
    let raw: string | null;
    try {
      raw = storage.getItem(storageKey);
    } catch {
      throw new Error("quota");
    }
    if (!raw) return Object.create(null) as Record<string, string>;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return Object.create(null) as Record<string, string>;
      const out = Object.create(null) as Record<string, string>;
      for (const [key, value] of Object.entries(parsed)) {
        if (validKey(key, limits) && typeof value === "string") out[key] = value;
      }
      return out;
    } catch (error) {
      if (error instanceof Error && error.message === "quota") throw error;
      return Object.create(null) as Record<string, string>;
    }
  }

  function write(bag: Record<string, string>) {
    const payload = JSON.stringify(bag);
    if (utf8Bytes(payload) > limits.maxSlugBytes) throw new Error("quota");
    try {
      storage.setItem(storageKey, payload);
    } catch {
      throw new Error("quota");
    }
  }

  return {
    get(key) {
      if (!validKey(key, limits)) throw new Error("invalid");
      const value = read()[key];
      return typeof value === "string" ? value : null;
    },
    set(key, value) {
      if (!validKey(key, limits)) throw new Error("invalid");
      if (typeof value !== "string") throw new Error("invalid");
      if (utf8Bytes(value) > limits.maxValueBytes) throw new Error("quota");
      const bag = read();
      bag[key] = value;
      if (Object.keys(bag).length > limits.maxKeys) throw new Error("quota");
      write(bag);
    },
    remove(key) {
      if (!validKey(key, limits)) throw new Error("invalid");
      const bag = read();
      if (!(key in bag)) return;
      delete bag[key];
      if (Object.keys(bag).length === 0) {
        try {
          storage.removeItem(storageKey);
        } catch {
          throw new Error("quota");
        }
        return;
      }
      write(bag);
    },
  };
}

function asRecord(data: unknown): Record<string, unknown> | null {
  if (!data || typeof data !== "object") return null;
  return data as Record<string, unknown>;
}

/** Responde a un mensaje `save` del iframe abierto. El slug lo pone el laboratorio. */
export function replyToSave(save: AppSave, data: unknown): SaveResult | null {
  const msg = asRecord(data);
  if (!msg || msg.source !== "proto-lab" || msg.type !== "save") return null;
  if (typeof msg.id !== "number" || !Number.isFinite(msg.id)) return null;
  const id = msg.id;
  try {
    if (msg.op === "get") {
      return { source: "proto-lab", type: "save-result", id, ok: true, value: save.get(msg.key as string) };
    }
    if (msg.op === "set") {
      save.set(msg.key as string, msg.value as string);
      return { source: "proto-lab", type: "save-result", id, ok: true, value: null };
    }
    if (msg.op === "delete") {
      save.remove(msg.key as string);
      return { source: "proto-lab", type: "save-result", id, ok: true, value: null };
    }
    return { source: "proto-lab", type: "save-result", id, ok: false, error: "invalid" };
  } catch (error) {
    const code = error instanceof Error && error.message === "invalid" ? "invalid" : "quota";
    return { source: "proto-lab", type: "save-result", id, ok: false, error: code };
  }
}

export function createSaveBridge(slug: string, storage: Storage) {
  const save = createAppSave(storage, slug);
  return {
    onMessage(event: MessageEvent, frame: HTMLIFrameElement | null) {
      if (!frame || event.source !== frame.contentWindow) return;
      const response = replyToSave(save, event.data);
      if (!response) return;
      frame.contentWindow?.postMessage(response, "*");
    },
  };
}
