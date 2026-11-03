import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { SERVED_APP_LIMITS } from "./app-contract.mjs";

const TEXT_EXT = new Set([".js", ".mjs", ".html", ".htm"]);

/** Vite/esbuild emite la cadena entre comillas invertidas. */
function hasReadySignal(text) {
  return (
    text.includes('"ready"') ||
    text.includes("'ready'") ||
    text.includes("`ready`") ||
    text.includes("__protoLabNotifyReady")
  );
}

function extensionOf(name) {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

/**
 * @param {string} dir
 * @returns {string[]}
 */
export function listServedFiles(dir) {
  const files = [];
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const abs = join(current, name);
      const info = statSync(abs);
      if (info.isDirectory()) {
        walk(abs);
        continue;
      }
      if (info.isFile()) files.push(abs);
    }
  };
  walk(dir);
  return files.sort();
}

/**
 * @param {string} dir
 * @param {string} label
 */
export function inspectServedApp(dir, label) {
  const limits = SERVED_APP_LIMITS;
  const files = listServedFiles(dir);
  const errors = [];
  const warnings = [];
  if (files.length > limits.maxFiles) {
    errors.push(`${label}: ${files.length} archivos (máximo ${limits.maxFiles})`);
  }
  let total = 0;
  let hasStop = false;
  let hasReady = false;
  for (const file of files) {
    const size = statSync(file).size;
    total += size;
    const name = file.slice(dir.length + 1);
    if (size > limits.maxBytesPerFile) {
      errors.push(`${label}: ${name} supera ${limits.maxBytesPerFile} bytes`);
    }
    const rel = name.replaceAll("\\", "/");
    if (rel === "db" || rel.startsWith("db/") || rel.endsWith(".sql")) {
      errors.push(`${label}: ${rel} no se publica; el SQL no sale al navegador`);
    }
    const ext = extensionOf(name);
    if (ext === ".js" || ext === ".mjs") {
      if (size > limits.jsFailBytes) {
        errors.push(`${label}: el JS ${name} supera ${limits.jsFailBytes} bytes`);
      } else if (size > limits.jsWarnBytes) {
        warnings.push(`${label}: el JS ${name} pesa ${size} bytes (aviso a ${limits.jsWarnBytes})`);
      }
    }
    if (TEXT_EXT.has(ext)) {
      const text = readFileSync(file, "utf8");
      if (text.includes("__protoLabApp")) hasStop = true;
      if (hasReadySignal(text)) hasReady = true;
    }
  }
  if (total > limits.maxBytesTotal) {
    errors.push(`${label}: tamaño total ${total} bytes (máximo ${limits.maxBytesTotal})`);
  }
  if (!hasStop) errors.push(`${label}: falta window.__protoLabApp.stop`);
  if (!hasReady) errors.push(`${label}: falta la señal ready`);
  return { errors, warnings, files: files.length, total };
}

/**
 * @param {string} dir
 * @param {string} label
 */
export function assertServedApp(dir, label) {
  const result = inspectServedApp(dir, label);
  for (const warning of result.warnings) console.warn(`aviso: ${warning}`);
  if (result.errors.length > 0) {
    throw new Error(result.errors.join("\n"));
  }
  return result;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (invokedDirectly()) {
  const dir = process.argv[2];
  if (!dir) {
    console.error("Uso: node scripts/app-budget.mjs <directorio-servido>");
    process.exit(1);
  }
  assertServedApp(dir, dir);
}
