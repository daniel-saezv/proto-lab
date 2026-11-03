import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readCatalog } from "./catalog-lib.mjs";
import { headersForPath, parsePagesHeaders } from "./pages-headers.mjs";
import { appendBrotliWasmHeaders, appendCapabilityHeaders, cspWithWasm, headerSource, permissionsPolicy } from "./proto-csp.mjs";

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
    const labPolicy = permissionsPolicy({ granted: ["geolocation"] });
    expect(headersForPath(rules, "/").get("permissions-policy")?.value).toBe(permissionsPolicy({ delegateAll: true }));
    expect(headersForPath(rules, "/protos/asset-lab/").get("permissions-policy")?.value).toBe(labPolicy);
    expect(headersForPath(rules, "/protos/asset-lab/assets/app.js").get("permissions-policy")?.value).toBe(labPolicy);
    expect(headersForPath(rules, "/protos/chispa/").get("permissions-policy")?.value).toContain("geolocation=()");
    expect(headersForPath(rules, "/protos/chispa/").get("permissions-policy")?.value).not.toContain("(self)");
    expect(headersForPath(rules, "/sw.js").get("permissions-policy")?.value).not.toContain("(self)");
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
    expect(headersForPath(rules, "/protos/otro/index.html").get("permissions-policy")?.value).toBe(
      permissionsPolicy({ granted: ["camera"] }),
    );
    expect(headersForPath(rules, "/protos/demo-wasm/").get("permissions-policy")?.value).not.toContain("(self)");
    expect(augmented.toLowerCase()).not.toContain("cross-origin-opener-policy");
    expect(augmented.toLowerCase()).not.toContain("cross-origin-embedder-policy");
  });

  it("el ejemplo Toque sirve el motor compartido y el pck en Brotli", () => {
    const source = headerSource(root);
    const rules = parsePagesHeaders(source);
    for (const rule of rules) {
      expect(rule.pattern.split("*").length - 1).toBeLessThanOrEqual(1);
    }
    const wasm = headersForPath(rules, "/protos/engines/godot/4.7.2-stable-nothreads/index.wasm");
    expect(wasm.get("content-type")?.value).toBe("application/wasm");
    expect(wasm.get("content-encoding")?.value).toBe("br");
    expect(wasm.get("cache-control")?.value).toBe("public, max-age=31536000, immutable, no-transform");
    const engineJs = headersForPath(rules, "/protos/engines/godot/4.7.2-stable-nothreads/index.js");
    expect(engineJs.get("cache-control")?.value).toBe("public, max-age=31536000, immutable, no-transform");
    expect(engineJs.has("content-encoding")).toBe(false);
    const worklet = headersForPath(rules, "/protos/engines/godot/4.7.2-stable-nothreads/index.audio.worklet.js");
    expect(worklet.get("cache-control")?.value).toBe("public, max-age=31536000, immutable, no-transform");
    const pack = headersForPath(rules, "/protos/toque/index.pck");
    expect(pack.get("content-encoding")?.value).toBe("br");
    expect(pack.get("content-type")?.value).toBe("application/octet-stream");
    expect(pack.get("cache-control")?.value).toBe("no-cache, no-transform");
    expect(headersForPath(rules, "/protos/toque/index.html").get("cache-control")?.value).toBe("no-cache");
    expect(headersForPath(rules, "/protos/toque/index.wasm").has("content-encoding")).toBe(false);
    expect(headersForPath(rules, "/protos/toque/").get("content-security-policy")?.value).toContain("'wasm-unsafe-eval'");
    expect(headersForPath(rules, "/").get("content-security-policy")?.value ?? "").not.toContain("wasm-unsafe-eval");
    expect(source.toLowerCase()).not.toContain("cross-origin-opener-policy");
  });

  it("marca el wasm en Brotli y no lo aplica a otro slug", () => {
    const augmented = appendBrotliWasmHeaders(source, ["toque"]);
    const rules = parsePagesHeaders(augmented);
    const wasm = headersForPath(rules, "/protos/toque/index.wasm");
    expect(wasm.get("content-type")?.value).toBe("application/wasm");
    expect(wasm.get("content-encoding")?.value).toBe("br");
    expect(headersForPath(rules, "/protos/toque/index.js").has("content-encoding")).toBe(false);
    expect(headersForPath(rules, "/protos/chispa/index.wasm").has("content-encoding")).toBe(false);
    expect(augmented.toLowerCase()).not.toContain("cross-origin-opener-policy");
  });

  it("rechaza un slug que no puede ir en la ruta", () => {
    expect(() => appendCapabilityHeaders(source, [{ slug: "../x", capabilities: ["wasm"] }])).toThrow(/slug/);
    expect(() => appendCapabilityHeaders(source, [{ slug: "camara/extra", capabilities: ["camera"] }])).toThrow(/slug/);
  });

  it("abre en el slug solo los permisos de dispositivo declarados", () => {
    const augmented = appendCapabilityHeaders(source, [
      { slug: "con-sensor", capabilities: ["save", "gyroscope", "camera", "wasm"] },
      { slug: "sin-sensor", capabilities: ["save"] },
    ]);
    const rules = parsePagesHeaders(augmented);
    const granted = permissionsPolicy({ granted: ["camera", "gyroscope"] });
    expect(headersForPath(rules, "/protos/con-sensor/").get("permissions-policy")?.value).toBe(granted);
    expect(granted).toContain("camera=(self)");
    expect(granted).toContain("gyroscope=(self)");
    expect(granted).toContain("microphone=()");
    expect(granted).toContain("payment=()");
    expect(granted).not.toContain("microphone=(self)");
    expect(headersForPath(rules, "/protos/con-sensor/").get("content-security-policy")?.value).toContain("'wasm-unsafe-eval'");
    expect(headersForPath(rules, "/protos/sin-sensor/").get("permissions-policy")?.value).not.toContain("(self)");
    expect(headersForPath(rules, "/assets/app.js").get("permissions-policy")?.value).not.toContain("(self)");
    expect(headersForPath(rules, "/").get("permissions-policy")?.value).toBe(permissionsPolicy({ delegateAll: true }));
  });
});
