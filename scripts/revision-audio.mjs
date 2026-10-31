import { createHash } from "node:crypto";
import { copyFileSync, existsSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { isShellPath, renderServiceWorker } from "./sw.mjs";

const TEXT_EXT = new Set([".js", ".mjs", ".css", ".html", ".map", ".json", ".webmanifest", ".svg", ".txt"]);

export function contentHash(bytes) {
  return createHash("sha256").update(bytes).digest("hex").slice(0, 8);
}

function walk(dir, visit) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      walk(abs, visit);
      continue;
    }
    visit(abs);
  }
}

function relPath(root, abs) {
  return relative(root, abs).split("\\").join("/");
}

/**
 * Copia cada pista a `nombre.<hash>.m4a` y apunta el bundle a esa URL.
 * El JS de Vite va en `/assets/*` con caché immutable: si el archivo no
 * cambia de nombre, el navegador se queda el bundle viejo. Por eso los
 * assets tocados se renombran y se regenera el service worker.
 */
export function revisionLobbyAudio(distDir) {
  const audioDir = join(distDir, "protos", "audio");
  if (!existsSync(audioDir)) return { revisions: [] };

  const revisions = [];
  for (const name of readdirSync(audioDir)) {
    if (!name.endsWith(".m4a") || /\.[0-9a-f]{8}\.m4a$/.test(name)) continue;
    const abs = join(audioDir, name);
    const hash = contentHash(readFileSync(abs));
    const hashed = name.replace(/\.m4a$/, `.${hash}.m4a`);
    copyFileSync(abs, join(audioDir, hashed));
    revisions.push({ from: `/protos/audio/${name}`, to: `/protos/audio/${hashed}` });
  }
  if (revisions.length === 0) return { revisions };

  const ordered = [...revisions].sort((a, b) => b.from.length - a.from.length);
  const changedAssets = [];
  let hits = 0;
  walk(distDir, (abs) => {
    const rel = relPath(distDir, abs);
    if (rel === "sw.js" || rel.startsWith("protos/")) return;
    if (!TEXT_EXT.has(extname(abs))) return;
    const text = readFileSync(abs, "utf8");
    let next = text;
    for (const rev of ordered) next = next.split(rev.from).join(rev.to);
    if (next === text) return;
    writeFileSync(abs, next);
    hits += 1;
    if (rel.startsWith("assets/") && [".js", ".css", ".map"].includes(extname(abs))) changedAssets.push(abs);
  });
  if (hits === 0) {
    const stale = revisions.some((rev) => bundleStillPointsAt(distDir, rev.from));
    if (stale) throw new Error("No se pudo reescribir la URL de las pistas en el bundle.");
    return { revisions, already: true };
  }

  const renames = [];
  for (const abs of changedAssets) {
    const hash = contentHash(readFileSync(abs));
    const ext = extname(abs);
    const oldBase = basename(abs);
    const newBase = `audio-rev-${hash}${ext}`;
    renameSync(abs, join(dirname(abs), newBase));
    renames.push({ oldBase, newBase });
  }
  renames.sort((a, b) => b.oldBase.length - a.oldBase.length);
  if (renames.length > 0) {
    walk(distDir, (abs) => {
      if (abs.endsWith(".m4a")) return;
      if (!TEXT_EXT.has(extname(abs)) && basename(abs) !== "sw.js") return;
      const text = readFileSync(abs, "utf8");
      let next = text;
      for (const rev of renames) next = replaceAssetName(next, rev.oldBase, rev.newBase);
      if (next !== text) writeFileSync(abs, next);
    });
  }

  for (const rev of revisions) {
    if (bundleStillPointsAt(distDir, rev.from)) {
      throw new Error(`El bundle sigue pidiendo ${rev.from} sin hash.`);
    }
  }
  regenerateShell(distDir);
  return { revisions, renames };
}

function replaceAssetName(text, oldBase, newBase) {
  const escaped = oldBase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return text.replace(new RegExp(`${escaped}(?![\\w.-])`, "g"), newBase);
}

function bundleStillPointsAt(distDir, url) {
  let found = false;
  walk(distDir, (abs) => {
    if (found) return;
    const rel = relPath(distDir, abs);
    if (rel.startsWith("protos/") || !TEXT_EXT.has(extname(abs))) return;
    const text = readFileSync(abs, "utf8");
    if (text.includes(url)) found = true;
  });
  return found;
}

function regenerateShell(distDir) {
  const shell = [];
  function visit(dir) {
    for (const name of readdirSync(dir)) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) {
        if (dir === distDir && name === "protos") continue;
        visit(abs);
        continue;
      }
      const pathname = `/${relPath(distDir, abs)}`;
      if (isShellPath(pathname)) shell.push(pathname);
    }
  }
  visit(distDir);
  writeFileSync(join(distDir, "sw.js"), renderServiceWorker(shell));
}

function isDirectRun() {
  const entry = process.argv[1];
  return !!entry && import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const result = revisionLobbyAudio(join(root, "dist"));
  for (const rev of result.revisions) console.log(`${rev.from} -> ${rev.to}`);
  if (result.renames?.length) console.log(`assets renombrados: ${result.renames.map((item) => item.newBase).join(", ")}`);
}
