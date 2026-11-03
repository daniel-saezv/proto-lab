/** Cupos de rutas relativas (decisión 4). Deben coincidir con ASSET_LIMITS. */
export const DATA_LIMITS = {
  maxCount: 64,
  maxBytesPerFile: 4 * 1024 * 1024,
  maxBytesTotal: 16 * 1024 * 1024,
  maxRequestsPerSession: 128,
} as const;

export type DataLimits = {
  maxCount: number;
  maxBytesPerFile: number;
  maxBytesTotal: number;
  maxRequestsPerSession: number;
};

export type LoadedFile = {
  mime: string;
  buffer: ArrayBuffer;
};

export type LabData = {
  load(path: string): Promise<LoadedFile>;
  json(path: string): Promise<unknown>;
  blobUrl(path: string): Promise<string>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
  revoke(): void;
};

const EXT_MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".wav": "audio/wav",
  ".mp3": "audio/mpeg",
  ".ogg": "audio/ogg",
  ".m4a": "audio/mp4",
  ".json": "application/json",
};

export function normalizeRelativePath(raw: string): string | null {
  if (typeof raw !== "string") return null;
  let path = raw.trim();
  while (path.startsWith("./")) path = path.slice(2);
  if (path.length === 0 || path.length > 512) return null;
  if (path.includes("\\") || path.startsWith("/") || /^[a-zA-Z]:/.test(path)) return null;
  if (path.includes(":") || path.startsWith("//")) return null;
  const segments = path.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") return null;
  }
  return segments.join("/");
}

function slugOf(pathname: string): string | null {
  const match = pathname.match(/^\/protos\/([a-z0-9-]+)(\/|$)/);
  return match?.[1] ?? null;
}

function directoryOf(page: URL, slug: string): string {
  const prefix = `/protos/${slug}/`;
  if (page.pathname === `/protos/${slug}`) return prefix;
  if (page.pathname.endsWith("/")) return page.pathname;
  return page.pathname.replace(/[^/]*$/, "");
}

/** Resuelve una ruta relativa y exige que siga bajo `/protos/<slug>/`. */
export function resolveAppFile(pageHref: string, raw: string): string | null {
  const normalized = normalizeRelativePath(raw);
  if (!normalized) return null;
  let page: URL;
  try {
    page = new URL(pageHref);
  } catch {
    return null;
  }
  const slug = slugOf(page.pathname);
  if (!slug) return null;
  const prefix = `/protos/${slug}/`;
  const dir = directoryOf(page, slug);
  if (!dir.startsWith(prefix)) return null;
  let resolved: URL;
  try {
    resolved = new URL(normalized, `${page.origin}${dir}`);
  } catch {
    return null;
  }
  return staysInApp(page, resolved) ? resolved.href : null;
}

function staysInApp(page: URL, target: URL): boolean {
  const slug = slugOf(page.pathname);
  if (!slug || target.origin !== page.origin || target.search || target.hash) return false;
  let decoded = target.pathname;
  try {
    decoded = decodeURIComponent(target.pathname);
  } catch {
    return false;
  }
  const prefix = `/protos/${slug}/`;
  return decoded.startsWith(prefix) && !decoded.includes("..") && !decoded.includes("\\");
}

function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot >= 0 ? base.slice(dot).toLowerCase() : "";
}

function looksLikeAccess(bytes: Uint8Array): boolean {
  const sample = new TextDecoder().decode(bytes.subarray(0, 2000)).toLowerCase();
  return sample.includes("cloudflareaccess.com") || sample.includes("cloudflare access");
}

function acceptedMime(header: string, path: string, bytes: Uint8Array): { mime: string } | { error: "blocked" | "mime" } {
  const mime = (header.split(";")[0] ?? "").trim().toLowerCase();
  const ext = extensionOf(path);
  if (mime === "text/html") return { error: "blocked" };
  if ((mime === "text/plain" || mime === "") && looksLikeAccess(bytes)) return { error: "blocked" };
  if (mime.startsWith("image/") || mime.startsWith("audio/")) return { mime };
  if (mime === "application/json" || mime === "text/json") return { mime: "application/json" };
  if (ext === ".json" && (mime === "text/plain" || mime === "application/octet-stream" || mime === "")) {
    try {
      JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      return { error: "blocked" };
    }
    return { mime: "application/json" };
  }
  const fallback = EXT_MIME[ext];
  if ((mime === "application/octet-stream" || mime === "") && fallback && ext !== ".json") return { mime: fallback };
  return { error: "mime" };
}

export function createFileLoader(options: {
  pageHref: string;
  fetchImpl?: typeof fetch;
  limits?: DataLimits;
  createObjectURL?: (blob: Blob) => string;
  revokeObjectURL?: (url: string) => void;
}) {
  const limits = options.limits ?? DATA_LIMITS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const createObjectURL = options.createObjectURL ?? ((blob: Blob) => URL.createObjectURL(blob));
  const revokeObjectURL = options.revokeObjectURL ?? ((url: string) => URL.revokeObjectURL(url));
  const cache = new Map<string, LoadedFile>();
  const blobUrls = new Map<string, string>();
  let requestCount = 0;
  let totalBytes = 0;

  async function load(raw: string): Promise<LoadedFile> {
    if (requestCount >= limits.maxRequestsPerSession) throw new Error("rate-limit");
    const href = resolveAppFile(options.pageHref, raw);
    if (!href) throw new Error("not-allowed");
    requestCount += 1;
    const cached = cache.get(href);
    if (cached) return cached;
    if (cache.size >= limits.maxCount) throw new Error("too-many");
    let response: Response;
    try {
      response = await fetchImpl(href, { credentials: "include", redirect: "follow" });
    } catch {
      throw new Error("blocked");
    }
    if (!response.ok) throw new Error("blocked");
    if (response.url) {
      let finalUrl: URL;
      try {
        finalUrl = new URL(response.url);
      } catch {
        throw new Error("blocked");
      }
      let page: URL;
      try {
        page = new URL(options.pageHref);
      } catch {
        throw new Error("blocked");
      }
      if (!staysInApp(page, finalUrl)) throw new Error("blocked");
    }
    const lengthHeader = response.headers.get("content-length");
    if (lengthHeader != null) {
      const length = Number.parseInt(lengthHeader, 10);
      if (Number.isFinite(length) && length > limits.maxBytesPerFile) throw new Error("too-large");
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength > limits.maxBytesPerFile) throw new Error("too-large");
    if (totalBytes + buffer.byteLength > limits.maxBytesTotal) throw new Error("too-large");
    const classified = acceptedMime(response.headers.get("content-type") ?? "", href, new Uint8Array(buffer));
    if ("error" in classified) throw new Error(classified.error);
    totalBytes += buffer.byteLength;
    const loaded = { mime: classified.mime, buffer };
    cache.set(href, loaded);
    return loaded;
  }

  return {
    async load(raw: string) {
      return load(raw);
    },
    async json(raw: string) {
      const loaded = await load(raw);
      if (loaded.mime !== "application/json") throw new Error("mime");
      try {
        return JSON.parse(new TextDecoder().decode(loaded.buffer)) as unknown;
      } catch {
        throw new Error("blocked");
      }
    },
    async blobUrl(raw: string) {
      const loaded = await load(raw);
      const href = resolveAppFile(options.pageHref, raw);
      if (!href) throw new Error("not-allowed");
      const existing = blobUrls.get(href);
      if (existing) return existing;
      const url = createObjectURL(new Blob([loaded.buffer], { type: loaded.mime }));
      blobUrls.set(href, url);
      return url;
    },
    revoke() {
      for (const url of blobUrls.values()) {
        try {
          revokeObjectURL(url);
        } catch {
          /* La URL ya no está. */
        }
      }
      blobUrls.clear();
    },
  };
}

type SaveTarget = {
  parent: { postMessage(message: unknown, origin: string): void };
  addEventListener(type: "message", listener: (event: MessageEvent) => void): void;
};

/** El laboratorio solo responde si `capabilities` incluye `save`. Si no, la promesa acaba en timeout. */
export function createSaveClient(target: SaveTarget, timeoutMs = 8000) {
  const pending = new Map<number, { resolve: (value: string | null) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  let nextId = 1;

  target.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== target.parent) return;
    const data = event.data as { source?: string; type?: string; id?: number; ok?: boolean; value?: string | null; error?: string } | null;
    if (!data || data.source !== "proto-lab" || data.type !== "save-result" || typeof data.id !== "number") return;
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    clearTimeout(entry.timer);
    if (data.ok) entry.resolve(data.value ?? null);
    else entry.reject(new Error(data.error || "invalid"));
  });

  function request(op: "get" | "set" | "delete", key: string, value?: string): Promise<string | null> {
    const id = nextId;
    nextId += 1;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!pending.has(id)) return;
        pending.delete(id);
        reject(new Error("timeout"));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      const message: { source: "proto-lab"; type: "save"; id: number; op: string; key: string; value?: string } = {
        source: "proto-lab",
        type: "save",
        id,
        op,
        key,
      };
      if (op === "set") message.value = value;
      target.parent.postMessage(message, "*");
    });
  }

  return {
    get: (key: string) => request("get", key),
    set: async (key: string, value: string) => {
      await request("set", key, value);
    },
    remove: async (key: string) => {
      await request("delete", key);
    },
  };
}

declare global {
  interface Window {
    __protoLabData?: LabData;
  }
}

export type LabHost = SaveTarget & {
  location: { href: string };
  fetch: typeof fetch;
  __protoLabData?: LabData;
};

export function installLabData(
  target: LabHost,
  options?: {
    timeoutMs?: number;
    fetchImpl?: typeof fetch;
    limits?: DataLimits;
    createObjectURL?: (blob: Blob) => string;
    revokeObjectURL?: (url: string) => void;
  },
): LabData {
  const files = createFileLoader({
    pageHref: target.location.href,
    fetchImpl: options?.fetchImpl ?? target.fetch.bind(target),
    limits: options?.limits,
    createObjectURL: options?.createObjectURL,
    revokeObjectURL: options?.revokeObjectURL,
  });
  const save = createSaveClient(target, options?.timeoutMs);
  const api: LabData = {
    load: (path) => files.load(path),
    json: (path) => files.json(path),
    blobUrl: (path) => files.blobUrl(path),
    get: (key) => save.get(key),
    set: (key, value) => save.set(key, value),
    remove: (key) => save.remove(key),
    revoke: () => files.revoke(),
  };
  target.__protoLabData = api;
  return api;
}
