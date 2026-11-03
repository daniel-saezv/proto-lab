import { describe, expect, it, vi } from "vitest";
import { createAppSave, replyToSave } from "../../../apps/world/src/app-save";
import { DATA_LIMITS, appSlugFromHref, createFileLoader, createQueryClient, createSaveClient, createSharedClient, installLabData, resolveAppFile, type DataLimits } from "./datos";

const page = "http://127.0.0.1:4173/protos/demo/";

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key) {
      return map.get(key) ?? null;
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
    key(index) {
      return [...map.keys()][index] ?? null;
    },
  };
}

function responseFor(body: string, href: string, mime: string, status = 200): Response {
  const bytes = new TextEncoder().encode(body);
  const headers = new Headers({
    "content-type": mime,
    "content-length": String(bytes.byteLength),
  });
  return {
    ok: status >= 200 && status < 300,
    url: href,
    status,
    headers,
    async arrayBuffer() {
      return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    },
    async text() {
      return body;
    },
  } as Response;
}

const small: DataLimits = { maxCount: 2, maxBytesPerFile: 16, maxBytesTotal: 12, maxRequestsPerSession: 3 };

describe("rutas relativas", () => {
  it("resuelve dentro del slug y rechaza salir de él", () => {
    expect(resolveAppFile(page, "media/nota.json")).toBe("http://127.0.0.1:4173/protos/demo/media/nota.json");
    expect(resolveAppFile("http://127.0.0.1:4173/protos/demo/index.html", "./media/nota.json")).toBe(
      "http://127.0.0.1:4173/protos/demo/media/nota.json",
    );
    expect(resolveAppFile(page, "../chispa/index.html")).toBeNull();
    expect(resolveAppFile(page, "/protos/chispa/a.png")).toBeNull();
    expect(resolveAppFile(page, "https://example.com/a.png")).toBeNull();
  });

  it("carga JSON, imagen y audio y reutiliza la caché", async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      if (String(input).endsWith(".json")) return responseFor('{"nota":"laboratorio"}', String(input), "application/json");
      if (String(input).endsWith(".png")) return responseFor("png", String(input), "image/png");
      return responseFor("wav", String(input), "application/octet-stream");
    });
    const created: string[] = [];
    const revoked: string[] = [];
    const loader = createFileLoader({
      pageHref: page,
      fetchImpl: fetchImpl as unknown as typeof fetch,
      createObjectURL: () => {
        const url = `blob:${created.length}`;
        created.push(url);
        return url;
      },
      revokeObjectURL: (url) => revoked.push(url),
    });
    await expect(loader.json("media/nota.json")).resolves.toEqual({ nota: "laboratorio" });
    await expect(loader.json("media/nota.json")).resolves.toEqual({ nota: "laboratorio" });
    const image = await loader.load("media/pixel.png");
    expect(image.mime).toBe("image/png");
    const audio = await loader.blobUrl("media/beep.wav");
    expect(audio).toBe("blob:0");
    await expect(loader.blobUrl("media/beep.wav")).resolves.toBe("blob:0");
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:4173/protos/demo/media/nota.json",
      expect.objectContaining({ credentials: "include" }),
    );
    loader.revoke();
    expect(revoked).toEqual(["blob:0"]);
  });

  it("acepta JSON servido como texto y rechaza HTML", async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      if (String(input).endsWith("plain.json")) return responseFor('{"ok":true}', String(input), "text/plain");
      return responseFor("<html>cloudflare access</html>", String(input), "text/html");
    });
    const loader = createFileLoader({ pageHref: page, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(loader.json("datos/plain.json")).resolves.toEqual({ ok: true });
    await expect(loader.load("login.html")).rejects.toThrow(/blocked/);
  });

  it("aplica cupo de peticiones, archivos y bytes", async () => {
    const fetchImpl = vi.fn(async (input: string) => responseFor("0123456789", String(input), "application/json"));
    const loader = createFileLoader({ pageHref: page, fetchImpl: fetchImpl as unknown as typeof fetch, limits: small });
    await loader.load("a.json");
    await expect(loader.load("b.json")).rejects.toThrow(/too-large/);
    await loader.load("a.json");
    await expect(loader.load("a.json")).rejects.toThrow(/rate-limit/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const crowded = createFileLoader({
      pageHref: page,
      fetchImpl: vi.fn(async (input: string) => responseFor("1", String(input), "application/json")) as unknown as typeof fetch,
      limits: { maxCount: 1, maxBytesPerFile: 8, maxBytesTotal: 20, maxRequestsPerSession: 5 },
    });
    await crowded.load("a.json");
    await expect(crowded.load("b.json")).rejects.toThrow(/too-many/);
  });

  it("no pide la red si la ruta se sale del slug", async () => {
    const fetchImpl = vi.fn();
    const loader = createFileLoader({ pageHref: page, fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(loader.load("../otro/nota.json")).rejects.toThrow(/not-allowed/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("cliente de guardado", () => {
  it("habla con la bolsa del laboratorio", async () => {
    const storage = memoryStorage();
    const save = createAppSave(storage, "demo");
    const listeners: Array<(event: MessageEvent) => void> = [];
    const parent = {
      postMessage(message: unknown) {
        const response = replyToSave(save, message);
        if (!response) return;
        for (const listener of listeners) listener({ source: parent, data: response } as MessageEvent);
      },
    };
    const api = installLabData(
      {
        parent,
        location: { href: page },
        fetch: vi.fn() as unknown as typeof fetch,
        addEventListener(_type, listener) {
          listeners.push(listener);
        },
      },
      { fetchImpl: vi.fn() as unknown as typeof fetch },
    );
    await api.set("partida", "noche-1");
    await expect(api.get("partida")).resolves.toBe("noche-1");
    await api.remove("partida");
    await expect(api.get("partida")).resolves.toBeNull();
    expect(storage.getItem("proto-lab:app:demo")).toBeNull();
  });

  it("ignora una respuesta que no viene del laboratorio y corta por tiempo", async () => {
    const listeners: Array<(event: MessageEvent) => void> = [];
    const parent = { postMessage() {} };
    const client = createSaveClient(
      {
        parent,
        addEventListener(_type, listener) {
          listeners.push(listener);
        },
      },
      20,
    );
    const pending = client.get("partida");
    listeners[0]?.({ source: {}, data: { source: "proto-lab", type: "save-result", id: 1, ok: true, value: "no" } } as MessageEvent);
    await expect(pending).rejects.toThrow(/timeout/);
  });
});

describe("datos compartidos", () => {
  it("pide el slug de la página y no reintenta un cupo", async () => {
    expect(appSlugFromHref("http://127.0.0.1:4173/protos/demo/index.html")).toBe("demo");
    expect(appSlugFromHref("http://127.0.0.1:4173/")).toBeNull();
    const calls: Array<{ href: string; init: RequestInit | undefined }> = [];
    const fetchImpl = vi.fn(async (href: string | URL, init?: RequestInit) => {
      calls.push({ href: String(href), init });
      const key = JSON.parse(String(init?.body)).key as string;
      if (key === "lleno") {
        return new Response(JSON.stringify({ ok: false, error: "quota", message: "cupo" }), { status: 400 });
      }
      return new Response(JSON.stringify({ ok: true, value: key === "mesa" ? "norte" : null }), { status: 200 });
    });
    const client = createSharedClient({ pageHref: "http://127.0.0.1:4173/protos/demo/", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(client.get("mesa")).resolves.toBe("norte");
    await client.set("mesa", "sur");
    await client.remove("mesa");
    expect(calls.map((call) => call.href)).toEqual(["/api/apps/demo/shared", "/api/apps/demo/shared", "/api/apps/demo/shared"]);
    expect(calls[0]?.init?.credentials).toBe("same-origin");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ op: "set", key: "mesa", value: "sur" });
    expect(JSON.parse(String(calls[0]?.init?.body))).not.toHaveProperty("slug");
    await expect(client.set("lleno", "x")).rejects.toThrow("quota");
    expect(calls).toHaveLength(4);
    const outside = createSharedClient({ pageHref: "http://127.0.0.1:4173/", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(outside.get("mesa")).rejects.toThrow("not-allowed");
    expect(calls).toHaveLength(4);
  });
});

describe("consultas de tablas", () => {
  it("manda el nombre y los parámetros, nunca SQL", async () => {
    const calls: Array<{ href: string; init: RequestInit | undefined }> = [];
    const fetchImpl = vi.fn(async (href: string | URL, init?: RequestInit) => {
      calls.push({ href: String(href), init });
      const body = JSON.parse(String(init?.body)) as { name?: string };
      if (body.name === "lleno") {
        return new Response(JSON.stringify({ ok: false, error: "quota", message: "cupo" }), { status: 400 });
      }
      return new Response(JSON.stringify({ ok: true, rows: [{ nombre: "ana", puntos: 3 }] }), { status: 200 });
    });
    const query = createQueryClient({ pageHref: "http://127.0.0.1:4173/protos/demo/", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(query("top10")).resolves.toEqual([{ nombre: "ana", puntos: 3 }]);
    await expect(query("guardarPuntuacion", { nombre: "ana", puntos: 3 })).resolves.toEqual([{ nombre: "ana", puntos: 3 }]);
    expect(calls.map((call) => call.href)).toEqual(["/api/apps/demo/query", "/api/apps/demo/query"]);
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.credentials).toBe("same-origin");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({ name: "top10", params: {} });
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({ name: "guardarPuntuacion", params: { nombre: "ana", puntos: 3 } });
    expect(JSON.stringify(calls[1]?.init?.body)).not.toContain("SELECT");
    await expect(query("lleno")).rejects.toThrow("quota");
    expect(calls).toHaveLength(3);
    const outside = createQueryClient({ pageHref: "http://127.0.0.1:4173/", fetchImpl: fetchImpl as unknown as typeof fetch });
    await expect(outside("top10")).rejects.toThrow("not-allowed");
    expect(calls).toHaveLength(3);
  });
});

describe("cifras del cargador", () => {
  it("usa el cupo de la decisión 4", () => {
    expect(DATA_LIMITS.maxCount).toBe(64);
    expect(DATA_LIMITS.maxBytesPerFile).toBe(4 * 1024 * 1024);
    expect(DATA_LIMITS.maxBytesTotal).toBe(16 * 1024 * 1024);
    expect(DATA_LIMITS.maxRequestsPerSession).toBe(128);
  });
});
