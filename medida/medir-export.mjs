/**
 * Mide un export web ya generado: lista, bytes, gzip/brotli/zstd y si el
 * wasm pide memoria compartida. No exporta ni sube nada.
 *
 *   node medida/medir-export.mjs --selftest
 *   node medida/medir-export.mjs <directorio> --out medida-tamanos.json
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, extname } from "node:path";
import { cpus, platform, release, totalmem } from "node:os";
import { SERVED_APP_LIMITS } from "../scripts/app-contract.mjs";
import { inspectWasm } from "../scripts/wasm-module.mjs";

const PAGES_MAX_BYTES = SERVED_APP_LIMITS.pagesMaxBytes;
const GITHUB_WARN_BYTES = 50 * 1024 * 1024;
const GITHUB_BLOCK_BYTES = 100 * 1024 * 1024;

/** Tipos que Cloudflare comprime al vuelo (gzip, brotli o zstd). El .pck no entra. */
const CLOUDFLARE_COMPRESSIBLE = new Set([
  ".html",
  ".htm",
  ".js",
  ".mjs",
  ".css",
  ".svg",
  ".json",
  ".wasm",
  ".webmanifest",
  ".txt",
]);

function listFiles(dir) {
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

function toolSize(command, args, source) {
  const result = spawnSync(command, args, { maxBuffer: 80 * 1024 * 1024 });
  if (result.status !== 0) {
    const detail = result.stderr?.toString("utf8").trim() || `código ${result.status}`;
    return { bytes: null, error: detail.slice(0, 300) };
  }
  return { bytes: result.stdout.length, error: null };
}

function countNeedle(buf, needle) {
  const text = buf.toString("latin1");
  let count = 0;
  let from = 0;
  while (from < text.length) {
    const at = text.indexOf(needle, from);
    if (at < 0) break;
    count += 1;
    from = at + needle.length;
  }
  return count;
}

function measureFile(dir, abs) {
  const buf = readFileSync(abs);
  const name = relative(dir, abs);
  const ext = extname(name).toLowerCase();
  const gzip = toolSize("gzip", ["-9", "-c", abs], abs);
  const brotliFast = toolSize("brotli", ["-q", "5", "-c", abs], abs);
  const brotli = toolSize("brotli", ["-q", "11", "-c", abs], abs);
  const zstdFast = toolSize("zstd", ["-3", "-c", abs], abs);
  const zstd = toolSize("zstd", ["-19", "-c", abs], abs);
  const entry = {
    name,
    bytes: buf.length,
    sha256: createHash("sha256").update(buf).digest("hex"),
    compressibleOnCloudflare: CLOUDFLARE_COMPRESSIBLE.has(ext) || name.endsWith(".worklet.js"),
    gzip9: gzip.bytes,
    brotli5: brotliFast.bytes,
    brotli11: brotli.bytes,
    zstd3: zstdFast.bytes,
    zstd19: zstd.bytes,
    errors: [gzip, brotliFast, brotli, zstdFast, zstd].map((item) => item.error).filter(Boolean),
  };
  if (ext === ".wasm") {
    entry.wasm = inspectWasm(buf);
    entry.needles = {
      SharedArrayBuffer: countNeedle(buf, "SharedArrayBuffer"),
      pthread: countNeedle(buf, "pthread"),
    };
  }
  if (ext === ".js" || name.endsWith(".js")) {
    entry.needles = {
      SharedArrayBuffer: countNeedle(buf, "SharedArrayBuffer"),
      crossOriginIsolated: countNeedle(buf, "crossOriginIsolated"),
      pthread: countNeedle(buf, "pthread"),
    };
  }
  return entry;
}

function sum(files, key) {
  return files.reduce((total, file) => total + (typeof file[key] === "number" ? file[key] : 0), 0);
}

function wireEstimate(files, key) {
  return files.reduce((total, file) => {
    if (file.compressibleOnCloudflare && typeof file[key] === "number") return total + file[key];
    return total + file.bytes;
  }, 0);
}

export function measureDirectory(dir) {
  const files = listFiles(dir).map((abs) => measureFile(dir, abs));
  const limits = SERVED_APP_LIMITS;
  const violations = [];
  if (files.length > limits.maxFiles) violations.push(`archivos ${files.length} > ${limits.maxFiles}`);
  const total = sum(files, "bytes");
  if (total > limits.maxBytesTotal) violations.push(`total ${total} > ${limits.maxBytesTotal}`);
  for (const file of files) {
    if (file.bytes > limits.maxBytesPerFile) {
      violations.push(`${file.name} supera ${limits.maxBytesPerFile} bytes (${file.bytes})`);
    }
    if (file.bytes > PAGES_MAX_BYTES) violations.push(`${file.name} supera 25 MiB de Pages (${file.bytes})`);
    if (file.bytes > GITHUB_WARN_BYTES) violations.push(`${file.name} supera el aviso de 50 MiB de GitHub`);
    if (file.bytes > GITHUB_BLOCK_BYTES) violations.push(`${file.name} supera el bloqueo de 100 MiB de GitHub`);
    if ((file.name.endsWith(".js") || file.name.endsWith(".mjs")) && file.bytes > limits.jsFailBytes) {
      violations.push(`${file.name} supera el fallo de JS (${limits.jsFailBytes})`);
    }
  }
  const wasmShared = files
    .filter((file) => file.wasm?.wasm)
    .flatMap((file) => file.wasm.memories.map((memory) => ({ file: file.name, ...memory })));
  return {
    measuredAt: new Date().toISOString(),
    host: {
      platform: platform(),
      release: release(),
      cpus: cpus().length,
      totalMemBytes: totalmem(),
    },
    directory: dir,
    limits: {
      ...limits,
      pagesMaxBytes: PAGES_MAX_BYTES,
      githubWarnBytes: GITHUB_WARN_BYTES,
      githubBlockBytes: GITHUB_BLOCK_BYTES,
    },
    files,
    totals: {
      files: files.length,
      bytes: total,
      gzip9: sum(files, "gzip9"),
      brotli5: sum(files, "brotli5"),
      brotli11: sum(files, "brotli11"),
      zstd3: sum(files, "zstd3"),
      zstd19: sum(files, "zstd19"),
      wireGzip9: wireEstimate(files, "gzip9"),
      wireBrotli5: wireEstimate(files, "brotli5"),
      wireBrotli11: wireEstimate(files, "brotli11"),
      wireZstd3: wireEstimate(files, "zstd3"),
      wireZstd19: wireEstimate(files, "zstd19"),
    },
    wasmMemories: wasmShared,
    singleThread:
      wasmShared.length > 0 && wasmShared.every((memory) => memory.shared === false && memory.memory64 === false),
    violations,
  };
}

function selfTest() {
  const plain = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x05, 0x03, 0x01, 0x00, 0x01]);
  const shared = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x05, 0x04, 0x01, 0x03, 0x01, 0x02]);
  const plainInfo = inspectWasm(plain);
  const sharedInfo = inspectWasm(shared);
  if (plainInfo.memories[0]?.shared !== false || plainInfo.memories[0]?.initialPages !== 1) {
    throw new Error(`parser plano inesperado: ${JSON.stringify(plainInfo)}`);
  }
  if (sharedInfo.memories[0]?.shared !== true || sharedInfo.memories[0]?.maximumPages !== 2) {
    throw new Error(`parser shared inesperado: ${JSON.stringify(sharedInfo)}`);
  }
  const dir = join(tmpdir(), `medir-selftest-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "nota.js"), "window.__protoLabApp = { stop() {} };\nconst ready = 'ready';\n");
  writeFileSync(join(dir, "vacio.wasm"), plain);
  const report = measureDirectory(dir);
  if (report.files.length !== 2 || report.singleThread !== true) {
    throw new Error(`selftest de directorio inesperado: ${JSON.stringify(report.totals)} single=${report.singleThread}`);
  }
  if (typeof report.files[0].gzip9 !== "number") throw new Error("gzip no produjo tamaño");
  console.log("selftest ok");
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  if (index < 0) return null;
  return process.argv[index + 1] ?? null;
}

if (process.argv[1]?.endsWith("medir-export.mjs")) {
  if (process.argv.includes("--selftest")) {
    selfTest();
  } else {
    const dir = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
    if (!dir) {
      console.error("Uso: node medida/medir-export.mjs <directorio> [--out archivo.json]");
      process.exit(1);
    }
    const report = measureDirectory(dir);
    const json = `${JSON.stringify(report, null, 2)}\n`;
    const out = argValue("--out");
    if (out) writeFileSync(out, json);
    process.stdout.write(json);
    if (report.violations.length > 0) {
      console.error(`Topes superados: ${report.violations.join("; ")}`);
    }
  }
}
