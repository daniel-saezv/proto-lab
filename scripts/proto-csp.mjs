import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readCatalog } from "./catalog-lib.mjs";
import { headersForPath, parsePagesHeaders } from "./pages-headers.mjs";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCRIPT_SRC = "script-src 'self' 'unsafe-inline'";

function fail(message) {
  throw new Error(`CSP de aplicaciones: ${message}`);
}

/** La CSP de `/` es la base. `wasm-unsafe-eval` no vive ahí. */
export function baseContentSecurityPolicy(source) {
  const csp = headersForPath(parsePagesHeaders(source), "/").get("content-security-policy")?.value ?? "";
  if (!csp.includes(SCRIPT_SRC)) fail("la CSP de / no tiene el script-src esperado");
  if (csp.includes("wasm-unsafe-eval")) fail("la CSP de / no puede incluir wasm-unsafe-eval");
  if (!csp.includes("form-action 'none'")) fail("form-action tiene que ser 'none'");
  assertNoThreadIsolation(source);
  return csp;
}

export function assertNoThreadIsolation(source) {
  const lower = source.toLowerCase();
  if (lower.includes("cross-origin-opener-policy") || lower.includes("cross-origin-embedder-policy")) {
    fail("sin COOP ni COEP: no hay hilos ni SharedArrayBuffer");
  }
}

/** Añade `wasm-unsafe-eval` solo en script-src. El resto de la política se queda. */
export function cspWithWasm(baseCsp) {
  if (!baseCsp.includes(SCRIPT_SRC)) fail("script-src inesperado");
  if (baseCsp.includes("wasm-unsafe-eval")) return baseCsp;
  return baseCsp.replace(SCRIPT_SRC, `${SCRIPT_SRC} 'wasm-unsafe-eval'`);
}

/**
 * Reglas de `_headers` para los slugs que declaran `wasm`.
 * Cada regla suelta la CSP heredada y pone la suya: si se concatenaran,
 * la política sin wasm seguiría negando la instanciación.
 * @param {string} source
 * @param {{ slug: string, capabilities?: readonly string[] }[]} entries
 */
export function appendCapabilityHeaders(source, entries) {
  const base = baseContentSecurityPolicy(source);
  const wasmSlugs = [];
  for (const entry of entries) {
    const capabilities = entry?.capabilities ?? [];
    if (!capabilities.includes("wasm")) continue;
    if (typeof entry.slug !== "string" || !SLUG.test(entry.slug)) fail(`slug no válido (${String(entry?.slug)})`);
    wasmSlugs.push(entry.slug);
  }
  if (wasmSlugs.length === 0) return source.endsWith("\n") ? source : `${source}\n`;
  const policy = cspWithWasm(base);
  const blocks = wasmSlugs.map(
    (slug) =>
      `# ${slug} declara wasm en proto.json. Sin COOP/COEP: sigue sin hilos ni SharedArrayBuffer.\n/protos/${slug}/*\n  ! Content-Security-Policy\n  Content-Security-Policy: ${policy}\n`,
  );
  return `${source.replace(/\s*$/, "\n")}\n${blocks.join("\n")}`;
}

export function headerSource(repoRoot) {
  const source = readFileSync(join(repoRoot, "apps/world/public/_headers"), "utf8");
  return appendCapabilityHeaders(source, readCatalog(repoRoot));
}

export function pagesHeaderRules(repoRoot) {
  return parsePagesHeaders(headerSource(repoRoot));
}

export function writeCapabilityHeaders(repoRoot, destPath) {
  writeFileSync(destPath, headerSource(repoRoot));
}
