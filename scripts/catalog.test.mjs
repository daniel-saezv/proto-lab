import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readCatalog } from "./catalog-lib.mjs";
import { isShellPath, renderServiceWorker } from "./sw.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("catálogo", () => {
  it("lee el prototipo de ejemplo", () => {
    const entries = readCatalog(root);
    expect(entries.map((entry) => entry.slug)).toEqual(["asset-lab", "chispa"]);
    const chispa = entries.find((entry) => entry.slug === "chispa");
    expect(chispa?.href).toBe("/protos/chispa/");
    expect(chispa?.history?.length).toBeGreaterThan(0);
  });
});

describe("service worker", () => {
  it("no mete prototipos ni la API en la shell", () => {
    expect(isShellPath("/assets/app.js")).toBe(true);
    expect(isShellPath("/index.html")).toBe(true);
    expect(isShellPath("/protos/chispa/index.html")).toBe(false);
    expect(isShellPath("/api/proposals")).toBe(false);
    expect(isShellPath("/sw.js")).toBe(false);

    const source = renderServiceWorker(["/assets/app.js", "/index.html", "/protos/chispa/index.html", "/sw.js"]);
    expect(source).toContain('startsWith("/protos/")');
    expect(source).toContain('startsWith("/api/")');
    expect(source).toContain("/assets/app.js");
    expect(source).not.toContain("/protos/chispa/");
  });

  it("no precarga pistas de música del lobby", () => {
    const source = renderServiceWorker(["/assets/app.js", "/index.html", "/sw.js"]);
    expect(source).not.toContain("life-in-fragments");
    expect(source).not.toContain("luanda.m4a");
    expect(source).not.toContain("lemonade.m4a");
  });

  it("pide que los prototipos no se cacheen en el borde", () => {
    const headers = readFileSync(join(root, "apps/world/public/_headers"), "utf8");
    expect(headers).toMatch(/\/protos\/\*/);
    expect(headers).toMatch(/no-cache/);
    expect(headers).toMatch(/Access-Control-Allow-Origin: \*/);
    expect(headers).toMatch(/\/protos\/audio\/\*\.m4a[\s\S]*! Cache-Control[\s\S]*max-age=31536000, immutable/);
    const routes = JSON.parse(readFileSync(join(root, "apps/world/public/_routes.json"), "utf8"));
    expect(routes.include).toEqual(["/api/*"]);
  });
});
