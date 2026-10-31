import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ASSET_LIMITS, normalizeAssetPath, parseManifestAssets } from "./asset-path.mjs";
import { assertManifest, readCatalog } from "./catalog-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("rutas de assets", () => {
  it("normaliza y rechaza rutas peligrosas", () => {
    expect(normalizeAssetPath("media/pixel.png")).toBe("media/pixel.png");
    expect(normalizeAssetPath("../etc/passwd")).toBeNull();
    expect(normalizeAssetPath("/abs.png")).toBeNull();
    expect(normalizeAssetPath("https://evil/x")).toBeNull();
    expect(normalizeAssetPath("//evil/x")).toBeNull();
  });

  it("valida assets del prototipo de laboratorio", () => {
    const normalized = parseManifestAssets("asset-lab", ["media/pixel.png", "media/beep.wav"], join(root, "protos/asset-lab"));
    expect(normalized).toEqual(["media/pixel.png", "media/beep.wav"]);
  });

  it("falla si falta el archivo", () => {
    expect(() => parseManifestAssets("x", ["nope.bin"], join(root, "protos/asset-lab"))).toThrow(/no está el asset/);
  });

  it("falla si hay demasiados assets", () => {
    const list = Array.from({ length: ASSET_LIMITS.maxCount + 1 }, (_, index) => `media/pixel-${index}.png`);
    expect(() => parseManifestAssets("x", list, join(root, "protos/asset-lab"))).toThrow(/demasiados assets/);
  });
});

describe("manifiesto con assets", () => {
  it("falla si hidden no es true", () => {
    const dir = join(root, "protos/asset-lab");
    const manifest = JSON.parse(readFileSync(join(dir, "proto.json"), "utf8"));
    expect(() => assertManifest("asset-lab", { ...manifest, hidden: false }, dir)).toThrow(/hidden/);
  });

  it("marca hidden en el catálogo", () => {
    const entries = readCatalog(root);
    const assetLab = entries.find((entry) => entry.slug === "asset-lab");
    expect(assetLab?.hidden).toBe(true);
  });

  it("integra assets en assertManifest", () => {
    const dir = join(root, ".tmp-catalog-test");
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "a.png"), Buffer.alloc(8));
    const manifest = {
      slug: "tmp-catalog-test",
      title: "T",
      description: "D",
      author: "a",
      date: "2026-10-31",
      tags: ["t"],
      version: "1.0.0",
      history: [{ version: "1.0.0", date: "2026-10-31", note: "n" }],
      assets: ["a.png"],
    };
    const validated = assertManifest("tmp-catalog-test", manifest, dir);
    expect(validated.assets).toEqual(["a.png"]);
    rmSync(dir, { recursive: true, force: true });
  });
});
