type Settled = {
  buffer: ArrayBuffer;
  mime: string;
  blobUrl: string;
};

type Pending = {
  resolve: (value: Settled) => void;
  reject: (error: Error) => void;
  path: string;
};

/**
 * Cliente del puente que antes inyectaba el laboratorio en el documento blob.
 * asset-lab lo trae consigo: el iframe ya es del mismo origen y no hay script incrustado.
 */
export function installAssetBridge(): { revokeAll(): void } {
  const pending = new Map<number, Pending>();
  const blobUrls = new Map<string, string>();
  let nextId = 1;

  window.addEventListener("message", (event: MessageEvent) => {
    if (event.source !== window.parent) return;
    const data = event.data as { source?: string; type?: string; id?: number; ok?: boolean; buffer?: ArrayBuffer; mime?: string; error?: string } | null;
    if (!data || data.source !== "proto-lab" || data.type !== "asset-response" || data.id == null) return;
    const entry = pending.get(data.id);
    if (!entry) return;
    pending.delete(data.id);
    if (data.ok && data.buffer) {
      const bytes = data.buffer.slice(0);
      const blob = new Blob([bytes], { type: data.mime || "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      blobUrls.set(entry.path, url);
      entry.resolve({ buffer: bytes, mime: data.mime || "application/octet-stream", blobUrl: url });
      return;
    }
    entry.reject(new Error(data.error || "asset-error"));
  });

  function request(path: string): Promise<Settled> {
    return new Promise((resolve, reject) => {
      const id = nextId;
      nextId += 1;
      pending.set(id, { resolve, reject, path });
      window.parent.postMessage({ source: "proto-lab", type: "asset-request", id, path }, "*");
    });
  }

  const api = {
    getArrayBuffer: (path: string) => request(path).then((result) => result.buffer),
    getBlobUrl: (path: string) => request(path).then((result) => result.blobUrl),
    getMime: (path: string) => request(path).then((result) => result.mime),
    revokeAll() {
      for (const url of blobUrls.values()) URL.revokeObjectURL(url);
      blobUrls.clear();
    },
  };
  window.__protoLabAssets = api;
  return api;
}
