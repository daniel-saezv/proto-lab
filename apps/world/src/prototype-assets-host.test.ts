import { describe, expect, it, vi } from "vitest";
import { ASSET_LIMITS, normalizeAssetPath } from "./asset-limits";
import { createPrototypeAssetHost } from "./prototype-assets-host";

describe("normalizeAssetPath", () => {
  it("rechaza rutas absolutas y ..", () => {
    expect(normalizeAssetPath("ok/file.png")).toBe("ok/file.png");
    expect(normalizeAssetPath("../x")).toBeNull();
  });
});

describe("createPrototypeAssetHost", () => {
  it("devuelve bytes para rutas permitidas", async () => {
    const body = new Uint8Array([1, 2, 3]);
    const fetchImpl = vi.fn(async () =>
      new Response(body, {
        status: 200,
        headers: { "content-type": "image/png", "content-length": String(body.length) },
      }),
    ) as unknown as typeof fetch;
    const host = createPrototypeAssetHost({
      slug: "asset-lab",
      allowedPaths: ["media/pixel.png"],
      fetchImpl,
      pageOrigin: "http://127.0.0.1:4173",
    });
    const postMessage = vi.fn();
    const frame = { contentWindow: { postMessage } } as unknown as HTMLIFrameElement;
    await host.onMessage(
      {
        source: frame.contentWindow,
        data: { source: "proto-lab", type: "asset-request", id: 1, path: "media/pixel.png" },
      } as MessageEvent,
      frame,
    );
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://127.0.0.1:4173/protos/asset-lab/media/pixel.png",
      expect.objectContaining({ credentials: "include" }),
    );
    const payload = postMessage.mock.calls[0]?.[0];
    expect(payload.ok).toBe(true);
    expect(payload.mime).toBe("image/png");
    expect(payload.buffer.byteLength).toBe(3);
    expect(postMessage.mock.calls[0]?.length).toBe(2);
  });

  it("reutiliza el buffer de la sesión", async () => {
    const body = new Uint8Array([9, 8, 7]);
    const fetchImpl = vi.fn(async () =>
      new Response(body, {
        status: 200,
        headers: { "content-type": "audio/wav", "content-length": String(body.length) },
      }),
    ) as unknown as typeof fetch;
    const host = createPrototypeAssetHost({
      slug: "asset-lab",
      allowedPaths: ["media/beep.wav"],
      fetchImpl,
      pageOrigin: "http://127.0.0.1:4173",
    });
    const postMessage = vi.fn();
    const frame = { contentWindow: { postMessage } } as unknown as HTMLIFrameElement;
    await host.onMessage(
      { source: frame.contentWindow, data: { source: "proto-lab", type: "asset-request", id: 1, path: "media/beep.wav" } } as MessageEvent,
      frame,
    );
    await host.onMessage(
      { source: frame.contentWindow, data: { source: "proto-lab", type: "asset-request", id: 2, path: "media/beep.wav" } } as MessageEvent,
      frame,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(postMessage.mock.calls[0]?.[0].buffer.byteLength).toBe(3);
    expect(postMessage.mock.calls[1]?.[0].buffer.byteLength).toBe(3);
  });

  it("deja pasar JSON y rechaza HTML", async () => {
    const fetchImpl = vi.fn(async (input: string) => {
      if (String(input).endsWith(".json")) {
        return new Response('{"nota":"laboratorio"}', {
          status: 200,
          headers: { "content-type": "text/plain", "content-length": "22" },
        });
      }
      return new Response("<html>cloudflare access</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      });
    }) as unknown as typeof fetch;
    const host = createPrototypeAssetHost({
      slug: "asset-lab",
      allowedPaths: ["media/nota.json", "login.html"],
      fetchImpl,
      pageOrigin: "http://127.0.0.1:4173",
    });
    const postMessage = vi.fn();
    const frame = { contentWindow: { postMessage } } as unknown as HTMLIFrameElement;
    await host.onMessage(
      { source: frame.contentWindow, data: { source: "proto-lab", type: "asset-request", id: 1, path: "media/nota.json" } } as MessageEvent,
      frame,
    );
    await host.onMessage(
      { source: frame.contentWindow, data: { source: "proto-lab", type: "asset-request", id: 2, path: "login.html" } } as MessageEvent,
      frame,
    );
    expect(postMessage.mock.calls[0]?.[0].ok).toBe(true);
    expect(postMessage.mock.calls[0]?.[0].mime).toBe("application/json");
    expect(postMessage.mock.calls[1]?.[0].ok).toBe(false);
    expect(postMessage.mock.calls[1]?.[0].error).toBe("fetch-failed");
  });

  it("rechaza rutas fuera de la lista y un mensaje que no viene del iframe", async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch;
    const host = createPrototypeAssetHost({
      slug: "asset-lab",
      allowedPaths: ["media/pixel.png"],
      fetchImpl,
      pageOrigin: "http://127.0.0.1:4173",
    });
    const postMessage = vi.fn();
    const frame = { contentWindow: { postMessage } } as unknown as HTMLIFrameElement;
    await host.onMessage(
      {
        source: frame.contentWindow,
        data: { source: "proto-lab", type: "asset-request", id: 2, path: "../secret" },
      } as MessageEvent,
      frame,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    const payload = postMessage.mock.calls[0]?.[0];
    expect(payload.ok).toBe(false);
    expect(payload.error).toBe("not-allowed");

    postMessage.mockClear();
    await host.onMessage(
      {
        source: {},
        data: { source: "proto-lab", type: "asset-request", id: 9, path: "media/pixel.png" },
      } as MessageEvent,
      frame,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(postMessage).not.toHaveBeenCalled();
  });

  it("aplica límite de peticiones", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array([1]), {
        status: 200,
        headers: { "content-type": "application/octet-stream", "content-length": "1" },
      }),
    ) as unknown as typeof fetch;
    const host = createPrototypeAssetHost({
      slug: "asset-lab",
      allowedPaths: ["media/pixel.png"],
      fetchImpl,
      pageOrigin: "http://127.0.0.1:4173",
    });
    const postMessage = vi.fn();
    const frame = { contentWindow: { postMessage } } as unknown as HTMLIFrameElement;
    host.resetForTests();
    for (let index = 0; index < ASSET_LIMITS.maxRequestsPerSession; index += 1) {
      await host.onMessage(
        {
          source: frame.contentWindow,
          data: { source: "proto-lab", type: "asset-request", id: index, path: "media/pixel.png" },
        } as MessageEvent,
        frame,
      );
    }
    await host.onMessage(
      {
        source: frame.contentWindow,
        data: {
          source: "proto-lab",
          type: "asset-request",
          id: ASSET_LIMITS.maxRequestsPerSession,
          path: "media/pixel.png",
        },
      } as MessageEvent,
      frame,
    );
    const last = postMessage.mock.calls.at(-1)?.[0];
    expect(last.ok).toBe(false);
    expect(last.error).toBe("rate-limit");
  });
});
