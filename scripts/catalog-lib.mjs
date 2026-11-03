import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { APP_CAPABILITIES, APP_PERMISSIONS, READY_MS } from "./app-contract.mjs";
import { parseManifestAssets } from "./asset-path.mjs";

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const VERSION = /^\d+\.\d+\.\d+$/;
const TAG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function fail(message) {
  throw new Error(`Manifiesto inválido: ${message}`);
}

function isDate(value) {
  if (typeof value !== "string" || !DATE.test(value)) return false;
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function assertManifest(dirName, manifest, protoDir) {
  if (!manifest || typeof manifest !== "object") fail(`${dirName} no es un objeto`);
  if (manifest.slug !== dirName || !SLUG.test(dirName)) fail(`${dirName}: el slug tiene que coincidir con la carpeta`);
  if (typeof manifest.title !== "string" || manifest.title.trim().length < 1 || manifest.title.length > 80) {
    fail(`${dirName}: título`);
  }
  if (typeof manifest.description !== "string" || manifest.description.trim().length < 1 || manifest.description.length > 2000) {
    fail(`${dirName}: descripción`);
  }
  if (typeof manifest.author !== "string" || manifest.author.trim().length < 1 || manifest.author.length > 80) {
    fail(`${dirName}: autor`);
  }
  if (!isDate(manifest.date)) fail(`${dirName}: fecha`);
  if (!Array.isArray(manifest.tags) || manifest.tags.length < 1 || manifest.tags.length > 8) fail(`${dirName}: etiquetas`);
  for (const tag of manifest.tags) {
    if (typeof tag !== "string" || !TAG.test(tag) || tag.length > 24) fail(`${dirName}: etiqueta ${tag}`);
  }
  if (manifest.cover != null) {
    if (typeof manifest.cover !== "string" || manifest.cover.includes("..") || manifest.cover.includes("/") || manifest.cover.includes("\\")) {
      fail(`${dirName}: portada`);
    }
    if (!existsSync(join(protoDir, manifest.cover))) fail(`${dirName}: no está el archivo de portada`);
  }
  if (manifest.preview != null) {
    if (typeof manifest.preview !== "string" || manifest.preview.includes("..") || manifest.preview.includes("/") || manifest.preview.includes("\\")) {
      fail(`${dirName}: vista previa`);
    }
    if (!existsSync(join(protoDir, manifest.preview))) fail(`${dirName}: no está el archivo de vista previa`);
  }
  if (typeof manifest.version !== "string" || !VERSION.test(manifest.version)) fail(`${dirName}: versión`);
  if (!Array.isArray(manifest.history) || manifest.history.length < 1) fail(`${dirName}: historial`);
  let seen = false;
  for (const entry of manifest.history) {
    if (!entry || typeof entry !== "object") fail(`${dirName}: entrada de historial`);
    if (typeof entry.version !== "string" || !VERSION.test(entry.version)) fail(`${dirName}: versión de historial`);
    if (!isDate(entry.date)) fail(`${dirName}: fecha de historial`);
    if (typeof entry.note !== "string" || entry.note.trim().length < 1 || entry.note.length > 280) fail(`${dirName}: nota de historial`);
    if (entry.version === manifest.version) seen = true;
  }
  if (!seen) fail(`${dirName}: el historial tiene que incluir la versión actual`);
  if (manifest.hidden != null && manifest.hidden !== true) {
    fail(`${dirName}: hidden solo puede ser true u omitirse`);
  }
  const declared = parseCapabilities(dirName, manifest);
  const readyMs = parseReadyMs(dirName, manifest.readyMs);
  const assets = parseManifestAssets(dirName, manifest.assets, protoDir);
  return { ...manifest, assets, capabilities: declared.capabilities, permissions: declared.permissions, readyMs };
}

function parseTokenList(dirName, field, value, allowed) {
  if (!Array.isArray(value)) fail(`${dirName}: ${field} tiene que ser una lista`);
  const seen = new Set();
  const accepted = [];
  for (const item of value) {
    if (typeof item !== "string" || !allowed.includes(item)) {
      fail(`${dirName}: ${field} no permitido (${String(item)})`);
    }
    if (seen.has(item)) fail(`${dirName}: ${field} duplicado (${item})`);
    seen.add(item);
    accepted.push(item);
  }
  return accepted;
}

/**
 * `capabilities` es la lista cerrada (save, wasm, shared y permisos de dispositivo).
 * `permissions` sigue valiendo como lista solo de dispositivos. Si aparecen
 * los dos, se unen y el orden de salida es el canónico.
 */
function parseCapabilities(dirName, manifest) {
  const fromCapabilities =
    manifest.capabilities == null ? [] : parseTokenList(dirName, "capabilities", manifest.capabilities, APP_CAPABILITIES);
  const fromPermissions =
    manifest.permissions == null ? [] : parseTokenList(dirName, "permissions", manifest.permissions, APP_PERMISSIONS);
  const wanted = new Set([...fromCapabilities, ...fromPermissions]);
  return {
    capabilities: APP_CAPABILITIES.filter((item) => wanted.has(item)),
    permissions: APP_PERMISSIONS.filter((item) => wanted.has(item)),
  };
}

export function sharedCapabilitySlugs(entries) {
  return entries.filter((entry) => entry.capabilities.includes("shared")).map((entry) => entry.slug);
}

function parseReadyMs(dirName, value) {
  if (value == null) return READY_MS.default;
  if (typeof value !== "number" || !Number.isInteger(value) || value < READY_MS.min || value > READY_MS.max) {
    fail(`${dirName}: readyMs tiene que ser un entero entre ${READY_MS.min} y ${READY_MS.max}`);
  }
  return value;
}

export function readCatalog(repoRoot) {
  const protosDir = join(repoRoot, "protos");
  const entries = [];
  for (const dirName of readdirSync(protosDir).sort()) {
    const protoDir = join(protosDir, dirName);
    if (!statSync(protoDir).isDirectory()) continue;
    const manifestPath = join(protoDir, "proto.json");
    if (!existsSync(manifestPath)) fail(`${dirName} no tiene proto.json`);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const validated = assertManifest(dirName, manifest, protoDir);
    entries.push({
      slug: validated.slug,
      title: validated.title,
      description: validated.description,
      author: validated.author,
      date: validated.date,
      tags: validated.tags,
      cover: validated.cover,
      preview: validated.preview ?? null,
      previewHref: validated.preview ? `/protos/${validated.slug}/${validated.preview}` : null,
      version: validated.version,
      history: validated.history,
      href: `/protos/${validated.slug}/`,
      assets: validated.assets ?? [],
      capabilities: validated.capabilities ?? [],
      permissions: validated.permissions ?? [],
      readyMs: validated.readyMs,
      hidden: validated.hidden === true,
    });
  }
  if (entries.length === 0) fail("no hay prototipos");
  return entries;
}
