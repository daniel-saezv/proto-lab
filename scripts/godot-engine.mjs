/**
 * Motor web de Godot compartido por todas las apps.
 * La versión va en la ruta: esa URL se cachea un año y no se reescribe.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { SERVED_APP_LIMITS } from "./app-contract.mjs";
import { assertSingleThreadWasm, decodeServedWasm } from "./wasm-module.mjs";

export const GODOT_ENGINE_ID = "4.7.2-stable-nothreads";
export const GODOT_ENGINE_ROOT = "protos/engines/godot";
export const GODOT_ENGINE_PUBLIC = `/protos/engines/godot/${GODOT_ENGINE_ID}`;
export const GODOT_ENGINE_BASE = `${GODOT_ENGINE_PUBLIC}/index`;

/** Archivos del motor. El `.pck` y el shell se quedan en la app. */
export const GODOT_ENGINE_FILES = [
  "index.audio.position.worklet.js",
  "index.audio.worklet.js",
  "index.js",
  "index.wasm",
];

const ENGINE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function godotEngineRoot(repoRoot) {
  return join(repoRoot, GODOT_ENGINE_ROOT);
}

export function godotEngineDir(repoRoot, id = GODOT_ENGINE_ID) {
  return join(godotEngineRoot(repoRoot), id);
}

/**
 * Cada versión es un paquete aparte: cabe en los topes de una app servida
 * y no se suma al cupo de cada app que lo usa.
 * @param {string} repoRoot
 */
export function inspectSharedEngines(repoRoot) {
  const limits = SERVED_APP_LIMITS;
  const root = godotEngineRoot(repoRoot);
  const errors = [];
  const warnings = [];
  const versions = [];
  if (!existsSync(root)) {
    errors.push("falta el motor compartido en protos/engines/godot");
    return { errors, warnings, versions };
  }
  const ids = readdirSync(root).filter((name) => statSync(join(root, name)).isDirectory()).sort();
  if (ids.length === 0) errors.push("no hay ninguna versión del motor Godot");
  for (const id of ids) {
    if (!ENGINE_ID.test(id)) {
      errors.push(`versión de motor no válida: ${id}`);
      continue;
    }
    const dir = join(root, id);
    const names = readdirSync(dir).filter((name) => statSync(join(dir, name)).isFile()).sort();
    let total = 0;
    for (const name of names) {
      const size = statSync(join(dir, name)).size;
      total += size;
      if (size > limits.pagesMaxBytes) {
        errors.push(`${id}/${name} supera el límite de Pages (${limits.pagesMaxBytes} bytes)`);
      }
      if (size > limits.maxBytesPerFile) {
        errors.push(`${id}/${name} supera ${limits.maxBytesPerFile} bytes`);
      }
      if (name.endsWith(".js") && size > limits.jsFailBytes) {
        errors.push(`${id}/${name} supera ${limits.jsFailBytes} bytes`);
      } else if (name.endsWith(".js") && size > limits.jsWarnBytes) {
        warnings.push(`${id}/${name} pesa ${size} bytes`);
      }
    }
    if (names.join("\n") !== GODOT_ENGINE_FILES.join("\n")) {
      errors.push(`${id}: se esperaban ${GODOT_ENGINE_FILES.join(", ")}`);
    }
    if (total > limits.maxBytesTotal) {
      errors.push(`${id}: tamaño total ${total} bytes (máximo ${limits.maxBytesTotal})`);
    }
    const wasmPath = join(dir, "index.wasm");
    if (existsSync(wasmPath)) {
      const decoded = decodeServedWasm(readFileSync(wasmPath));
      if (!decoded?.brotli) {
        errors.push(`${id}/index.wasm tiene que estar en Brotli`);
      } else {
        try {
          assertSingleThreadWasm(decoded.module, `${id}/index.wasm`);
        } catch (error) {
          errors.push(error instanceof Error ? error.message : String(error));
        }
      }
    }
    versions.push({ id, files: names.length, total });
  }
  return { errors, warnings, versions };
}

export function assertSharedEngines(repoRoot) {
  const result = inspectSharedEngines(repoRoot);
  for (const warning of result.warnings) console.warn(`aviso: ${warning}`);
  if (result.errors.length > 0) throw new Error(result.errors.join("\n"));
  return result;
}
