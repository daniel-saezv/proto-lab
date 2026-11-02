import { existsSync, statSync } from "node:fs";
import { join, posix } from "node:path";

/** Límites de recursos privados (manifiesto y tiempo de ejecución en el laboratorio). */
export const ASSET_LIMITS = {
  maxCount: 64,
  maxBytesPerFile: 4 * 1024 * 1024,
  maxBytesTotal: 16 * 1024 * 1024,
  maxRequestsPerSession: 128,
};

/**
 * Normaliza una ruta relativa del manifiesto. Devuelve null si no es válida.
 * @param {string} raw
 * @returns {string | null}
 */
export function normalizeAssetPath(raw) {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return null;
  if (raw.includes("\\") || raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) return null;
  if (raw.includes(":") || raw.startsWith("//")) return null;
  const segments = raw.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") return null;
  }
  return posix.normalize(raw.split("\\").join("/"));
}

/**
 * @param {string} protoDir
 * @param {string} normalizedPath
 * @returns {string | null} ruta absoluta en disco
 */
export function resolveAssetFile(protoDir, normalizedPath) {
  const candidates = [
    join(protoDir, normalizedPath),
    join(protoDir, "public", normalizedPath),
    join(protoDir, "dist", normalizedPath),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

/**
 * @param {string} dirName
 * @param {unknown} assets
 * @param {string} protoDir
 * @returns {string[]}
 */
export function parseManifestAssets(dirName, assets, protoDir) {
  if (assets == null) return [];
  if (!Array.isArray(assets)) throw new Error(`Manifiesto inválido: ${dirName}: assets tiene que ser un array`);
  if (assets.length > ASSET_LIMITS.maxCount) {
    throw new Error(`Manifiesto inválido: ${dirName}: demasiados assets (máx. ${ASSET_LIMITS.maxCount})`);
  }
  const seen = new Set();
  let totalBytes = 0;
  const normalized = [];
  for (const raw of assets) {
    if (typeof raw !== "string") throw new Error(`Manifiesto inválido: ${dirName}: ruta de asset inválida`);
    const path = normalizeAssetPath(raw);
    if (path == null || path !== raw.trim()) {
      throw new Error(`Manifiesto inválido: ${dirName}: ruta de asset no permitida (${raw})`);
    }
    if (seen.has(path)) throw new Error(`Manifiesto inválido: ${dirName}: asset duplicado (${path})`);
    seen.add(path);
    const filePath = resolveAssetFile(protoDir, path);
    if (!filePath) throw new Error(`Manifiesto inválido: ${dirName}: no está el asset ${path}`);
    const size = statSync(filePath).size;
    if (size > ASSET_LIMITS.maxBytesPerFile) {
      throw new Error(
        `Manifiesto inválido: ${dirName}: ${path} supera ${ASSET_LIMITS.maxBytesPerFile} bytes`,
      );
    }
    totalBytes += size;
    if (totalBytes > ASSET_LIMITS.maxBytesTotal) {
      throw new Error(`Manifiesto inválido: ${dirName}: tamaño total de assets supera el límite`);
    }
    normalized.push(path);
  }
  return normalized;
}
