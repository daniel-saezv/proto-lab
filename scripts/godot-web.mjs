/**
 * Publica y comprueba un export web de Godot de un solo hilo.
 * El `.wasm` se guarda en Brotli q11. No exporta: eso lo hace el workflow.
 *
 *   node scripts/godot-web.mjs --check protos/<slug> --export <dir>
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertSingleThreadWasm, compressWasmBrotli, decodeServedWasm } from "./wasm-module.mjs";

const PCK_MAGIC = Buffer.from("GDPC");
const NODE_IDS = Buffer.from("node_ids\0");

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLISHED_SKIP = new Set(["proto.json", "preview.webp", "godot"]);

export function findHtmlDir(dir) {
  const direct = join(dir, "index.html");
  if (statSync(direct, { throwIfNoEntry: false })?.isFile()) return dir;
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const name of readdirSync(current)) {
      const abs = join(current, name);
      const info = statSync(abs);
      if (info.isDirectory()) stack.push(abs);
      else if (name === "index.html") return current;
    }
  }
  throw new Error(`No hay index.html en ${dir}`);
}

function walkFiles(dir) {
  const files = [];
  const walk = (current) => {
    for (const name of readdirSync(current)) {
      const abs = join(current, name);
      const info = statSync(abs);
      if (info.isDirectory()) walk(abs);
      else if (info.isFile()) files.push(abs);
    }
  };
  walk(dir);
  return files.sort();
}

export function assertGodotProject(projectText, presetText) {
  const errors = [];
  if (!projectText.includes('rendering_method="gl_compatibility"')) {
    errors.push("el renderer tiene que ser gl_compatibility");
  }
  if (!projectText.includes("rendering_method.mobile=\"gl_compatibility\"")) {
    errors.push("el renderer móvil tiene que ser gl_compatibility");
  }
  if (!projectText.includes("textures/vram_compression/import_etc2_astc=true")) {
    errors.push("faltan las texturas ETC2/ASTC para móvil");
  }
  if (!/variant\/thread_support=false/.test(presetText)) errors.push("thread_support tiene que ser false");
  if (!/variant\/extensions_support=false/.test(presetText)) errors.push("extensions_support tiene que ser false");
  if (!/progressive_web_app\/enabled=false/.test(presetText)) errors.push("la PWA de Godot tiene que estar apagada");
  if (!/ensure_cross_origin_isolation_headers=false/.test(presetText)) {
    errors.push("no se fuerzan cabeceras COOP/COEP");
  }
  if (!/vram_texture_compression\/for_mobile=true/.test(presetText)) {
    errors.push("el preset tiene que comprimir texturas para móvil");
  }
  if (!/html\/custom_html_shell="shell\.html"/.test(presetText)) {
    errors.push('el preset tiene que usar html/custom_html_shell="shell.html"');
  }
  return errors;
}

function assertHtmlContract(name, text) {
  const errors = [];
  if (/GODOT_THREADS_ENABLED\s*=\s*true\b/.test(text)) errors.push(`${name} activa los hilos de Godot`);
  if (/\beval\s*\(/.test(text)) errors.push(`${name} usa eval`);
  if (!text.includes("__protoLabNotifyReady")) errors.push(`${name} no avisa ready`);
  if (!text.includes("startGame")) errors.push(`${name} no arranca con startGame`);
  if (!text.includes("requestQuit")) errors.push(`${name} no cierra con requestQuit`);
  if (!text.includes("./arranque.js")) errors.push(`${name} no carga arranque.js`);
  return errors;
}

/**
 * Archivos que deben quedar en la raíz del prototipo.
 * El wasm en claro se sustituye por Brotli q11.
 * @param {string} exportDir
 * @param {Buffer} arranque
 */
export function prepareServedFiles(exportDir, arranque) {
  const htmlDir = findHtmlDir(exportDir);
  const files = new Map();
  const errors = [];
  for (const abs of walkFiles(htmlDir)) {
    const rel = relative(htmlDir, abs).replaceAll("\\", "/");
    let buf = readFileSync(abs);
    if (rel.endsWith(".wasm")) {
      const decoded = decodeServedWasm(buf);
      if (!decoded) {
        errors.push(`${rel} no es un módulo wasm`);
        continue;
      }
      try {
        assertSingleThreadWasm(decoded.module, rel);
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
      buf = decoded.brotli ? buf : compressWasmBrotli(decoded.module);
    }
    files.set(rel, buf);
    if (rel.endsWith(".html") || rel.endsWith(".htm")) {
      errors.push(...assertHtmlContract(rel, buf.toString("utf8")));
    }
  }
  if (!files.has("index.wasm")) errors.push("falta index.wasm");
  files.set("arranque.js", arranque);
  return { files, errors };
}

/** Godot reescribe `node_ids` en cada export. El resto de la escena tiene que coincidir. */
export function normalizeGodotScene(buf) {
  const out = Buffer.from(buf);
  let at = 0;
  while (at < out.length) {
    const found = out.indexOf(NODE_IDS, at);
    if (found < 0) break;
    const countAt = found + NODE_IDS.length + 4;
    if (countAt + 4 > out.length) break;
    const count = out.readUInt32LE(countAt);
    const idsAt = countAt + 4;
    const idsEnd = idsAt + count * 4;
    if (count > 10_000 || idsEnd > out.length) break;
    out.fill(0, idsAt, idsEnd);
    at = idsEnd;
  }
  return out;
}

/** @param {Buffer} buf */
export function readGodotPack(buf) {
  if (buf.length < 40 || !buf.subarray(0, 4).equals(PCK_MAGIC)) return null;
  const version = buf.readUInt32LE(4);
  if (version !== 4) return null;
  const fileBase = Number(buf.readBigUInt64LE(24));
  const dirOffset = Number(buf.readBigUInt64LE(32));
  if (dirOffset + 4 > buf.length) return null;
  const fileCount = buf.readUInt32LE(dirOffset);
  let offset = dirOffset + 4;
  const files = new Map();
  for (let index = 0; index < fileCount; index += 1) {
    if (offset + 4 > buf.length) return null;
    const length = buf.readUInt32LE(offset);
    offset += 4;
    if (length > 4096 || offset + length + 28 > buf.length) return null;
    const name = buf.subarray(offset, offset + length).toString("utf8").replaceAll("\0", "");
    offset += length;
    const dataOffset = Number(buf.readBigUInt64LE(offset));
    const size = Number(buf.readBigUInt64LE(offset + 8));
    offset += 16 + 16 + 4;
    const start = fileBase + dataOffset;
    if (start + size > buf.length) return null;
    files.set(name, buf.subarray(start, start + size));
  }
  return files;
}

export function packsMatch(left, right) {
  const a = readGodotPack(left);
  const b = readGodotPack(right);
  if (!a || !b || a.size !== b.size) return false;
  for (const [name, bytes] of a) {
    const other = b.get(name);
    if (!other) return false;
    if (name.endsWith(".scn")) {
      if (!normalizeGodotScene(bytes).equals(normalizeGodotScene(other))) return false;
    } else if (!bytes.equals(other)) {
      return false;
    }
  }
  return true;
}

export function compareServed(protoDir, expected) {
  const errors = [];
  const actual = new Map();
  for (const name of readdirSync(protoDir)) {
    if (PUBLISHED_SKIP.has(name) || name.startsWith(".")) continue;
    const abs = join(protoDir, name);
    if (statSync(abs).isDirectory()) {
      errors.push(`${name}/ no se publica en un export estático`);
      continue;
    }
    actual.set(name, readFileSync(abs));
  }
  for (const [name, buf] of expected) {
    const got = actual.get(name);
    if (!got) {
      errors.push(`falta ${name} publicado`);
      continue;
    }
    if (name.endsWith(".wasm")) {
      const published = decodeServedWasm(got);
      const fresh = decodeServedWasm(buf);
      if (!published?.brotli) errors.push(`${name} publicado no está en Brotli`);
      else if (!fresh || !published.module.equals(fresh.module)) errors.push(`${name} no coincide con el export`);
    } else if (name.endsWith(".pck")) {
      if (!packsMatch(got, buf)) errors.push(`${name} no coincide con el export`);
    } else if (!got.equals(buf)) {
      errors.push(`${name} no coincide con el export`);
    }
    actual.delete(name);
  }
  for (const name of actual.keys()) errors.push(`${name} publicado no sale del export`);
  return errors;
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (invokedDirectly() && process.argv.includes("--check")) {
  const protoDir = argValue("--check");
  const exportDir = argValue("--export");
  if (!protoDir || !exportDir) {
    console.error("Uso: node scripts/godot-web.mjs --check <protos/slug> --export <directorio>");
    process.exit(1);
  }
  const projectErrors = assertGodotProject(
    readFileSync(join(protoDir, "godot", "project.godot"), "utf8"),
    readFileSync(join(protoDir, "godot", "export_presets.cfg"), "utf8"),
  );
  const shell = readFileSync(join(protoDir, "godot", "shell.html"));
  const templateShell = readFileSync(join(root, "templates", "export-estatico", "godot-shell.html"));
  if (!shell.equals(templateShell)) projectErrors.push("godot/shell.html no es el de la plantilla");
  const arranque = readFileSync(join(root, "templates", "export-estatico", "arranque.js"));
  const prepared = prepareServedFiles(exportDir, arranque);
  const published = compareServed(protoDir, prepared.files);
  const errors = [...projectErrors, ...prepared.errors, ...published];
  if (errors.length > 0) {
    console.error(errors.join("\n"));
    process.exit(1);
  }
  console.log(`Export de ${protoDir} coincide con lo publicado.`);
}
