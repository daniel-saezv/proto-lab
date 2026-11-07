import { describe, expect, it } from "vitest";
import { createStillCache } from "./preview-stills";

describe("caché en memoria de las fotos", () => {
  it("descarga cada URL una vez aunque se pida a la vez", async () => {
    let calls = 0;
    const cache = createStillCache(async (href) => {
      calls += 1;
      await Promise.resolve();
      return { href } as unknown as HTMLImageElement;
    });
    const [first, again, other] = await Promise.all([
      cache.load("/protos/chispa/preview.webp"),
      cache.load("/protos/chispa/preview.webp"),
      cache.load("/protos/otro/preview.webp"),
    ]);
    expect(calls).toBe(2);
    expect(first).toBe(again);
    expect(other).not.toBe(first);
    await cache.load("/protos/chispa/preview.webp");
    expect(calls).toBe(2);
  });

  it("la precarga no repite una URL", async () => {
    let calls = 0;
    const cache = createStillCache(async () => {
      calls += 1;
      return null;
    });
    cache.preload(["/a.webp", "/a.webp", "/b.webp"]);
    await cache.load("/a.webp");
    expect(calls).toBe(2);
  });
});
