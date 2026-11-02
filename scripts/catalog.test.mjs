import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertManifest, readCatalog } from "./catalog-lib.mjs";
import { isShellPath, renderServiceWorker } from "./sw.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function protoDirectories() {
  return readdirSync(join(root, "protos"))
    .filter((name) => statSync(join(root, "protos", name)).isDirectory())
    .sort();
}

describe("catálogo", () => {
  it("sigue las carpetas de protos sin una lista fija", () => {
    const entries = readCatalog(root);
    expect(entries.map((entry) => entry.slug)).toEqual(protoDirectories());
    const chispa = entries.find((entry) => entry.slug === "chispa");
    expect(chispa?.href).toBe("/protos/chispa/");
    expect(chispa?.history?.length).toBeGreaterThan(0);
    expect(chispa?.permissions).toEqual([]);
    expect(chispa?.readyMs).toBeGreaterThan(0);
  });

  it("rechaza un permiso fuera de la lista y un readyMs imposible", () => {
    const base = {
      slug: "demo",
      title: "Demo",
      description: "Una aplicación de prueba.",
      author: "proto-lab",
      date: "2026-11-02",
      tags: ["prueba"],
      cover: null,
      version: "0.1.0",
      history: [{ version: "0.1.0", date: "2026-11-02", note: "Alta." }],
    };
    expect(() => assertManifest("demo", { ...base, permissions: ["camera", "usb"] }, root)).toThrow(/permiso/);
    expect(() => assertManifest("demo", { ...base, permissions: ["camera", "camera"] }, root)).toThrow(/duplicado/);
    expect(() => assertManifest("demo", { ...base, readyMs: 50 }, root)).toThrow(/readyMs/);
    const ok = assertManifest("demo", { ...base, permissions: ["microphone"] }, root);
    expect(ok.permissions).toEqual(["microphone"]);
    expect(ok.readyMs).toBe(8000);
  });

  it("la plantilla tiene un manifiesto válido y no entra en el catálogo", () => {
    const dir = join(root, "templates/aplicacion");
    expect(dir.includes(`${join(root, "protos")}/`)).toBe(false);
    const manifest = JSON.parse(readFileSync(join(dir, "proto.json"), "utf8"));
    const validated = assertManifest(manifest.slug, manifest, dir);
    expect(validated.slug).toBe("aplicacion");
    expect(validated.history.some((entry) => entry.version === validated.version)).toBe(true);
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
    expect(source).toContain("cloudflareaccess");
    expect(source).toContain("isHashedAsset");
    expect(source).toContain('credentials: "same-origin"');
    expect(source).toContain("response.status !== 200");
    expect(source).toContain("caches.delete");
  });

  it("no precarga la música del lobby", () => {
    const source = renderServiceWorker(["/assets/app.js", "/index.html", "/sw.js"]);
    expect(source).not.toContain(".m4a");
    expect(isShellPath("/protos/audio/luanda.m4a")).toBe(false);
  });

  it("deja las peticiones de audio del lobby fuera del fetch del SW", () => {
    const source = renderServiceWorker(["/index.html", "/assets/app.js"]);
    expect(source).toContain("function mustBypass(url, method)");
    expect(source).toContain("if (mustBypass(url, event.request.method)) return;");
    expect(source).toContain('url.pathname.startsWith("/protos/")');
  });

  it("revalida el HTML de los prototipos y deja immutable el JS con hash y el audio", () => {
    const headers = readFileSync(join(root, "apps/world/public/_headers"), "utf8");
    expect(headers).toMatch(/\/protos\/\*/);
    expect(headers).toMatch(/\/protos\/:slug\/assets\/\*/);
    expect(headers).toMatch(/no-cache/);
    expect(headers).toMatch(/Access-Control-Allow-Origin: \*/);
    expect(headers).toMatch(/\/protos\/audio\/\*\.m4a[\s\S]*! Cache-Control[\s\S]*max-age=31536000, immutable/);
    expect(headers.match(/\/protos\/audio\/\*\.m4a/g)).toHaveLength(1);
    const routes = JSON.parse(readFileSync(join(root, "apps/world/public/_routes.json"), "utf8"));
    expect(routes.include).toEqual(["/api/*"]);
  });
});
