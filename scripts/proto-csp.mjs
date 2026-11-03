import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP_PERMISSIONS } from "./app-contract.mjs";
import { readCatalog } from "./catalog-lib.mjs";
import { headersForPath, parsePagesHeaders } from "./pages-headers.mjs";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SCRIPT_SRC = "script-src 'self' 'unsafe-inline'";
const DENIED_FEATURES = ["payment", "usb"];

/**
 * `delegateAll` abre los seis permisos de dispositivo para `self` (el documento
 * del laboratorio tiene que poder delegarlos). `granted` abre solo los que
 * declara el slug. `payment` y `usb` siguen cerrados.
 * @param {{ delegateAll?: boolean, granted?: readonly string[] }} [options]
 */
export function permissionsPolicy(options = {}) {
  const granted = new Set(options.granted ?? []);
  const delegateAll = options.delegateAll === true;
  return [...APP_PERMISSIONS, ...DENIED_FEATURES]
    .map((name) => {
      const open = APP_PERMISSIONS.includes(name) && (delegateAll || granted.has(name));
      return `${name}=${open ? "(self)" : "()"}`;
    })
    .join(", ");
}

function declaredTokens(entry) {
  if (Array.isArray(entry?.capabilities)) return entry.capabilities;
  if (Array.isArray(entry?.permissions)) return entry.permissions;
  return [];
}

function deviceGrants(entry) {
  const tokens = new Set(declaredTokens(entry));
  return APP_PERMISSIONS.filter((name) => tokens.has(name));
}

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
  const blocks = [];
  for (const entry of entries) {
    const tokens = declaredTokens(entry);
    const wasm = tokens.includes("wasm");
    const grants = deviceGrants(entry);
    if (!wasm && grants.length === 0) continue;
    if (typeof entry?.slug !== "string" || !SLUG.test(entry.slug)) fail(`slug no válido (${String(entry?.slug)})`);
    const lines = [
      `# ${entry.slug} declara capacidades en proto.json. Sin COOP/COEP: sigue sin hilos ni SharedArrayBuffer.`,
      `/protos/${entry.slug}/*`,
    ];
    if (wasm) {
      lines.push("  ! Content-Security-Policy", `  Content-Security-Policy: ${cspWithWasm(base)}`);
    }
    if (grants.length > 0) {
      lines.push("  ! Permissions-Policy", `  Permissions-Policy: ${permissionsPolicy({ granted: grants })}`);
    }
    blocks.push(`${lines.join("\n")}\n`);
  }
  if (blocks.length === 0) return source.endsWith("\n") ? source : `${source}\n`;
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
