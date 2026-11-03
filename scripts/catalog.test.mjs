import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertManifest, CATALOG_SKIP, readCatalog, sharedCapabilitySlugs } from "./catalog-lib.mjs";
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
    expect(entries.map((entry) => entry.slug)).toEqual(protoDirectories().filter((name) => !CATALOG_SKIP.has(name)));
    expect(protoDirectories()).toContain("engines");
    const chispa = entries.find((entry) => entry.slug === "chispa");
    expect(chispa?.href).toBe("/protos/chispa/");
    expect(chispa?.history?.length).toBeGreaterThan(0);
    expect(chispa?.capabilities).toEqual([]);
    expect(chispa?.permissions).toEqual([]);
    expect(chispa?.readyMs).toBeGreaterThan(0);
    const assetLab = entries.find((entry) => entry.slug === "asset-lab");
    expect(assetLab?.capabilities).toEqual(["save", "geolocation"]);
    expect(assetLab?.permissions).toEqual(["geolocation"]);
    const sharedFile = JSON.parse(readFileSync(join(root, "functions/_lib/shared-slugs.json"), "utf8"));
    expect(sharedFile).toEqual(sharedCapabilitySlugs(entries));
    const tableQueries = JSON.parse(readFileSync(join(root, "functions/_lib/table-queries.json"), "utf8"));
    expect(tableQueries).toEqual({});
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
    expect(() => assertManifest("demo", { ...base, permissions: ["camera", "usb"] }, root)).toThrow(/no permitido/);
    expect(() => assertManifest("demo", { ...base, permissions: ["camera", "camera"] }, root)).toThrow(/duplicado/);
    expect(() => assertManifest("demo", { ...base, permissions: ["save"] }, root)).toThrow(/permiso|no permitido/);
    expect(() => assertManifest("demo", { ...base, capabilities: ["save", "usb"] }, root)).toThrow(/no permitido/);
    expect(() => assertManifest("demo", { ...base, capabilities: ["wasm", "wasm"] }, root)).toThrow(/duplicado/);
    expect(() => assertManifest("demo", { ...base, capabilities: "save" }, root)).toThrow(/lista/);
    expect(() => assertManifest("demo", { ...base, readyMs: 50 }, root)).toThrow(/readyMs/);
    const legacy = assertManifest("demo", { ...base, permissions: ["microphone"] }, root);
    expect(legacy.permissions).toEqual(["microphone"]);
    expect(legacy.capabilities).toEqual(["microphone"]);
    expect(legacy.readyMs).toBe(8000);
    const caps = assertManifest(
      "demo",
      { ...base, capabilities: ["geolocation", "save", "camera"], permissions: ["microphone"] },
      root,
    );
    expect(caps.capabilities).toEqual(["save", "camera", "microphone", "geolocation"]);
    expect(caps.permissions).toEqual(["camera", "microphone", "geolocation"]);
    const wasm = assertManifest("demo", { ...base, capabilities: ["wasm"] }, root);
    expect(wasm.capabilities).toEqual(["wasm"]);
    expect(wasm.permissions).toEqual([]);
    expect(() => assertManifest("demo", { ...base, capabilities: ["shared", "shared"] }, root)).toThrow(/duplicad/);
    expect(() => assertManifest("demo", { ...base, capabilities: "shared" }, root)).toThrow(/lista/);
    const shared = assertManifest("demo", { ...base, capabilities: ["camera", "shared", "save"] }, root);
    expect(shared.capabilities).toEqual(["save", "shared", "camera"]);
    expect(shared.permissions).toEqual(["camera"]);
    const plain = assertManifest("demo", base, root);
    expect(sharedCapabilitySlugs([shared, plain, legacy])).toEqual(["demo"]);
  });

  it("ordena tables con el resto de capacidades si hay db/", () => {
    const dir = mkdtempSync(join(tmpdir(), "catalog-tables-"));
    mkdirSync(join(dir, "db"));
    writeFileSync(
      join(dir, "db", "0001_notas.sql"),
      "CREATE TABLE IF NOT EXISTS demo__notas (\n  nombre TEXT NOT NULL,\n  PRIMARY KEY (nombre)\n);",
    );
    writeFileSync(
      join(dir, "db", "queries.json"),
      JSON.stringify({ listar: { sql: "SELECT nombre FROM demo__notas LIMIT 10", params: [] } }),
    );
    const manifest = {
      slug: "demo",
      title: "Demo",
      description: "Una aplicación de prueba.",
      author: "proto-lab",
      date: "2026-11-02",
      tags: ["prueba"],
      cover: null,
      version: "0.1.0",
      history: [{ version: "0.1.0", date: "2026-11-02", note: "Alta." }],
      capabilities: ["camera", "tables", "shared", "save"],
    };
    expect(assertManifest("demo", manifest, dir).capabilities).toEqual(["save", "shared", "tables", "camera"]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("la plantilla tiene un manifiesto válido y no entra en el catálogo", () => {
    const dir = join(root, "templates/aplicacion");
    expect(dir.includes(`${join(root, "protos")}/`)).toBe(false);
    const manifest = JSON.parse(readFileSync(join(dir, "proto.json"), "utf8"));
    const validated = assertManifest(manifest.slug, manifest, dir);
    expect(validated.slug).toBe("aplicacion");
    expect(validated.capabilities).toEqual(["save"]);
    expect(validated.permissions).toEqual([]);
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
