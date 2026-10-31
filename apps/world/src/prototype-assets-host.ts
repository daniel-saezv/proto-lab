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
  const contentType = (response.headers.get("content-type") ?? "application/octet-stream").split(";")[0]?.trim() ?? "application/octet-stream";
  if (contentType.includes("text/html") || contentType.includes("text/plain")) {
    const peek = await response.clone().text();
    if (isAccessHtml(peek) || peek.toLowerCase().includes("cloudflare access")) throw new Error("blocked");
    throw new Error("blocked");
  }
  const lengthHeader = response.headers.get("content-length");
  if (lengthHeader != null) {
    const length = Number.parseInt(lengthHeader, 10);
    if (Number.isFinite(length) && length > maxBytes) throw new Error("too-large");
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) throw new Error("too-large");
  return { mime: contentType, buffer };
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
      let pending = inflight.get(normalized);
      if (!pending) {
        pending = fetchAssetBytes(options.slug, normalized, fetchImpl, pageOrigin, ASSET_LIMITS.maxBytesPerFile);
        inflight.set(normalized, pending);
        void pending.finally(() => inflight.delete(normalized));
      }
      const { mime, buffer } = await pending;
      const payload = buffer.slice(0);
      return {
        source: "proto-lab",
        type: "asset-response",
        id: message.id,
        ok: true,
        path: normalized,
        mime,
        buffer: payload,
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
    frame.contentWindow?.postMessage(response, "*", response.ok ? [response.buffer] : []);
  }

  return {
    onMessage,
    /** Expuesto para tests. */
    stats: () => ({ requestCount }),
    resetForTests: () => {
      requestCount = 0;
      inflight.clear();
    },
  };
}

/** Script clásico incrustado en el iframe junto al puente de vida/cierre. */
export const IFRAME_ASSET_BRIDGE = `<script>
(function(){
  var pending=new Map();
  var blobUrls=new Map();
  var nextId=1;
  function settle(id,payload){
    var entry=pending.get(id);
    if(!entry)return;
    pending.delete(id);
    if(payload.ok){
      var bytes=payload.buffer.slice(0);
      var blob=new Blob([bytes],{type:payload.mime||"application/octet-stream"});
      var url=URL.createObjectURL(blob);
      blobUrls.set(entry.path,url);
      entry.resolve({buffer:bytes,mime:payload.mime,blobUrl:url});
    }else{
      entry.reject(new Error(payload.error||"asset-error"));
    }
  }
  window.addEventListener("message",function(event){
    if(event.source!==parent)return;
    var data=event.data;
    if(!data||data.source!=="proto-lab"||data.type!=="asset-response")return;
    settle(data.id,data);
  });
  function request(path){
    return new Promise(function(resolve,reject){
      var id=nextId++;
      pending.set(id,{resolve:resolve,reject:reject,path:path});
      parent.postMessage({source:"proto-lab",type:"asset-request",id:id,path:path},"*");
    });
  }
  window.__protoLabAssets={
    getArrayBuffer:function(path){return request(path).then(function(r){return r.buffer;});},
    getBlobUrl:function(path){return request(path).then(function(r){return r.blobUrl;});},
    getMime:function(path){return request(path).then(function(r){return r.mime;});},
    revokeAll:function(){
      blobUrls.forEach(function(url){URL.revokeObjectURL(url);});
      blobUrls.clear();
    }
  };
})();
</script>`;
