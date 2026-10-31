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
  });

  it("rechaza rutas fuera de la lista", async () => {
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
