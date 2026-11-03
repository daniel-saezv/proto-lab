import { ASSET_LIMITS, assetUrlPath, normalizeAssetPath } from "./asset-limits";

export type AssetRequestMessage = {
  source: "proto-lab";
  type: "asset-request";
  id: number;
  path: string;
};

export type AssetResponseMessage =
  | {
      source: "proto-lab";
      type: "asset-response";
      id: number;
      ok: true;
      path: string;
      mime: string;
      buffer: ArrayBuffer;
    }
  | {
      source: "proto-lab";
      type: "asset-response";
      id: number;
      ok: false;
      error: string;
    };

function isAccessHtml(text: string): boolean {
  return /cloudflareaccess\.com/i.test(text.slice(0, 2000));
}

function mimeBase(contentType: string): string {
  return (contentType.split(";")[0] ?? "application/octet-stream").trim().toLowerCase() || "application/octet-stream";
}

function isJsonFile(path: string): boolean {
  return path.endsWith(".json");
}

async function fetchAssetBytes(
  slug: string,
  normalizedPath: string,
  fetchImpl: typeof fetch,
  pageOrigin: string,
  maxBytes: number,
): Promise<{ mime: string; buffer: ArrayBuffer }> {
  const href = new URL(assetUrlPath(slug, normalizedPath), pageOrigin).href;
  const response = await fetchImpl(href, { credentials: "include", redirect: "follow" });
  if (!response.ok) throw new Error("blocked");
  let finalUrl: URL;
  try {
    finalUrl = new URL(response.url || href);
  } catch {
    throw new Error("blocked");
  }
  if (finalUrl.origin !== pageOrigin) throw new Error("blocked");
  const expectedPrefix = `/protos/${slug}/`;
  if (!finalUrl.pathname.startsWith(expectedPrefix)) throw new Error("blocked");
  let mime = mimeBase(response.headers.get("content-type") ?? "application/octet-stream");
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader != null) {
    const length = Number.parseInt(lengthHeader, 10);
    if (Number.isFinite(length) && length > maxBytes) throw new Error("too-large");
  }
  if (mime === "text/html" || mime === "text/plain" || (isJsonFile(normalizedPath) && (mime === "application/octet-stream" || mime === "text/json"))) {
    const peek = await response.clone().text();
    if (isAccessHtml(peek) || peek.toLowerCase().includes("cloudflare access")) throw new Error("blocked");
    if (mime === "text/html") throw new Error("blocked");
    if (mime === "text/plain" || mime === "application/octet-stream") {
      if (!isJsonFile(normalizedPath)) throw new Error("blocked");
      try {
        JSON.parse(peek);
      } catch {
        throw new Error("blocked");
      }
      mime = "application/json";
    }
    if (mime === "text/json") mime = "application/json";
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new Error("too-large");
  return { mime, buffer };
}

export function createPrototypeAssetHost(options: {
  slug: string;
  allowedPaths: readonly string[];
  fetchImpl?: typeof fetch;
  pageOrigin?: string;
}) {
  const allowed = new Set(options.allowedPaths);
  const fetchImpl = options.fetchImpl ?? fetch;
  const pageOrigin = options.pageOrigin ?? location.origin;
  let requestCount = 0;
  const cache = new Map<string, { mime: string; buffer: ArrayBuffer }>();
  const inflight = new Map<string, Promise<{ mime: string; buffer: ArrayBuffer }>>();

  function rejectResponse(id: number, error: string): AssetResponseMessage {
    return { source: "proto-lab", type: "asset-response", id, ok: false, error };
  }

  async function handleAssetRequest(
    frame: HTMLIFrameElement,
    message: AssetRequestMessage,
  ): Promise<AssetResponseMessage> {
    if (requestCount >= ASSET_LIMITS.maxRequestsPerSession) {
      return rejectResponse(message.id, "rate-limit");
    }
    const normalized = normalizeAssetPath(message.path);
    if (normalized == null || !allowed.has(normalized)) {
      return rejectResponse(message.id, "not-allowed");
    }
    requestCount += 1;
    try {
      let settled = cache.get(normalized);
      if (!settled) {
        let pending = inflight.get(normalized);
        if (!pending) {
          pending = fetchAssetBytes(options.slug, normalized, fetchImpl, pageOrigin, ASSET_LIMITS.maxBytesPerFile).then((result) => {
            cache.set(normalized, result);
            return result;
          });
          inflight.set(normalized, pending);
          // El `finally` rechaza con el mismo error. El `await` de abajo ya lo recoge.
          void pending.finally(() => inflight.delete(normalized)).catch(() => {});
        }
        settled = await pending;
      }
      return {
        source: "proto-lab",
        type: "asset-response",
        id: message.id,
        ok: true,
        path: normalized,
        mime: settled.mime,
        buffer: settled.buffer,
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : "error";
      return rejectResponse(message.id, reason === "too-large" ? "too-large" : "fetch-failed");
    }
  }

  async function onMessage(event: MessageEvent, frame: HTMLIFrameElement | null): Promise<void> {
    if (!frame || event.source !== frame.contentWindow) return;
    const data = event.data as AssetRequestMessage | null;
    if (data?.source !== "proto-lab" || data.type !== "asset-request") return;
    const response = await handleAssetRequest(frame, data);
    // La caché se queda con el buffer. Sin slice y sin transferir: postMessage clona una vez.
    frame.contentWindow?.postMessage(response, "*");
  }

  return {
    onMessage,
    /** Expuesto para tests. */
    stats: () => ({ requestCount }),
    resetForTests: () => {
      requestCount = 0;
      cache.clear();
      inflight.clear();
    },
  };
}
