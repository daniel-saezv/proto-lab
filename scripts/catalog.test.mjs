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
    expect(entries.map((entry) => entry.slug)).toEqual(["chispa"]);
    expect(entries[0]?.href).toBe("/protos/chispa/");
    expect(entries[0]?.history?.length).toBeGreaterThan(0);
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

  it("pide que los prototipos no se cacheen en el borde", () => {
    const headers = readFileSync(join(root, "apps/world/public/_headers"), "utf8");
    expect(headers).toMatch(/\/protos\/\*/);
    expect(headers).toMatch(/no-cache/);
    expect(headers).toMatch(/Access-Control-Allow-Origin: \*/);
    const routes = JSON.parse(readFileSync(join(root, "apps/world/public/_routes.json"), "utf8"));
    expect(routes.include).toEqual(["/api/*"]);
  });
});
