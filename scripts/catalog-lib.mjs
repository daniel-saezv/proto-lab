import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

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
  return manifest;
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
    assertManifest(dirName, manifest, protoDir);
    entries.push({
      slug: manifest.slug,
      title: manifest.title,
      description: manifest.description,
      author: manifest.author,
      date: manifest.date,
      tags: manifest.tags,
      cover: manifest.cover,
      preview: manifest.preview ?? null,
      previewHref: manifest.preview ? `/protos/${manifest.slug}/${manifest.preview}` : null,
      version: manifest.version,
      history: manifest.history,
      href: `/protos/${manifest.slug}/`,
    });
  }
  if (entries.length === 0) fail("no hay prototipos");
  return entries;
}
