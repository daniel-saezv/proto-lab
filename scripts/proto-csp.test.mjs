import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readCatalog } from "./catalog-lib.mjs";
import { headersForPath, parsePagesHeaders } from "./pages-headers.mjs";
import { appendCapabilityHeaders, cspWithWasm } from "./proto-csp.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const source = readFileSync(join(root, "apps/world/public/_headers"), "utf8");

describe("CSP por capacidades", () => {
  it("deja la CSP base sin wasm y sin aislamiento de hilos", () => {
    const augmented = appendCapabilityHeaders(source, readCatalog(root));
    expect(augmented.toLowerCase()).not.toContain("cross-origin-opener-policy");
    expect(augmented.toLowerCase()).not.toContain("cross-origin-embedder-policy");
    const rules = parsePagesHeaders(augmented);
    for (const path of ["/", "/protos/chispa/", "/protos/asset-lab/index.html", "/protos/asset-lab/assets/app.js"]) {
      const csp = headersForPath(rules, path).get("content-security-policy")?.value ?? "";
      expect(csp, path).not.toContain("wasm-unsafe-eval");
      expect(csp, path).toContain("form-action 'none'");
    }
  });

  it("añade wasm-unsafe-eval solo en el slug que lo declara", () => {
    const augmented = appendCapabilityHeaders(source, [
      { slug: "demo-wasm", capabilities: ["wasm", "save"] },
      { slug: "chispa", capabilities: [] },
      { slug: "otro", capabilities: ["camera"] },
    ]);
    const rules = parsePagesHeaders(augmented);
    for (const rule of rules) {
      expect(rule.pattern.split("*").length - 1).toBeLessThanOrEqual(1);
    }
    const wasmHtml = headersForPath(rules, "/protos/demo-wasm/index.html").get("content-security-policy")?.value ?? "";
    const wasmAsset = headersForPath(rules, "/protos/demo-wasm/assets/app.js").get("content-security-policy")?.value ?? "";
    const plain = headersForPath(rules, "/protos/chispa/index.html").get("content-security-policy")?.value ?? "";
    const home = headersForPath(rules, "/").get("content-security-policy")?.value ?? "";
    expect(wasmHtml).toBe(cspWithWasm(home));
    expect(wasmHtml.match(/script-src/g)).toHaveLength(1);
    expect(wasmHtml).toContain("'wasm-unsafe-eval'");
    expect(wasmHtml).toContain("form-action 'none'");
    expect(wasmAsset).toContain("'wasm-unsafe-eval'");
    expect(headersForPath(rules, "/protos/demo-wasm/assets/app.js").get("cache-control")?.value).toBe(
      "public, max-age=31536000, immutable",
    );
    expect(plain).not.toContain("wasm-unsafe-eval");
    expect(home).not.toContain("wasm-unsafe-eval");
    expect(headersForPath(rules, "/protos/otro/").get("content-security-policy")?.value ?? "").not.toContain("wasm-unsafe-eval");
    expect(augmented.toLowerCase()).not.toContain("cross-origin-opener-policy");
    expect(augmented.toLowerCase()).not.toContain("cross-origin-embedder-policy");
  });

  it("rechaza un slug que no puede ir en la ruta", () => {
    expect(() => appendCapabilityHeaders(source, [{ slug: "../x", capabilities: ["wasm"] }])).toThrow(/slug/);
  });
});
