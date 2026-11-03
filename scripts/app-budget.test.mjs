import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { brotliCompressSync, constants } from "node:zlib";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SERVED_APP_LIMITS } from "./app-contract.mjs";
import { inspectServedApp } from "./app-budget.mjs";

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "served-app-"));
  return dir;
}

function plant(dir, name, body) {
  const abs = join(dir, name);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, body);
}

const contract = `<script>window.__protoLabApp={stop:function(){}};parent.postMessage({source:"proto-lab",type:"ready"},"*");</script>`;

describe("presupuesto de la aplicación servida", () => {
  it("acepta ready entre comillas invertidas, como lo emite el minificador", () => {
    const dir = fixture();
    plant(
      dir,
      "assets/index.js",
      "window.__protoLabApp={stop(){}};parent.postMessage({source:`proto-lab`,type:`ready`},`*`);",
    );
    const result = inspectServedApp(dir, "demo");
    expect(result.errors).toEqual([]);
    rmSync(dir, { recursive: true, force: true });
  });

  it("acepta un árbol pequeño con ready y stop", () => {
    const dir = fixture();
    plant(dir, "index.html", `<!doctype html>${contract}`);
    plant(dir, "assets/app.js", "window.__protoLabApp.stop();");
    const result = inspectServedApp(dir, "demo");
    expect(result.errors).toEqual([]);
    expect(result.files).toBe(2);
    rmSync(dir, { recursive: true, force: true });
  });

  it("falla si faltan la señal o el cierre, o si se pasa de tamaño", () => {
    const dir = fixture();
    plant(dir, "index.html", "<!doctype html><title>x</title>");
    const missing = inspectServedApp(dir, "demo");
    expect(missing.errors.some((line) => line.includes("__protoLabApp"))).toBe(true);
    expect(missing.errors.some((line) => line.includes("ready"))).toBe(true);

    const heavy = fixture();
    plant(heavy, "index.html", contract);
    plant(heavy, "big.js", "x".repeat(SERVED_APP_LIMITS.jsFailBytes + 1));
    const over = inspectServedApp(heavy, "demo");
    expect(over.errors.some((line) => line.includes("JS"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
    rmSync(heavy, { recursive: true, force: true });
  });

  it("rechaza SQL publicado", () => {
    const dir = fixture();
    plant(dir, "index.html", contract);
    plant(dir, "db/0001_notas.sql", "CREATE TABLE IF NOT EXISTS demo__notas (nombre TEXT);");
    const result = inspectServedApp(dir, "demo");
    expect(result.errors.some((line) => line.includes("no se publica"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("avisa a 1,5 MiB de JS y no lo trata como fallo", () => {
    const dir = fixture();
    plant(dir, "index.html", contract);
    plant(dir, "chunk.js", "y".repeat(SERVED_APP_LIMITS.jsWarnBytes + 8));
    const result = inspectServedApp(dir, "demo");
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((line) => line.includes("aviso"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("falla a 12 MiB por archivo y a 25 MiB de Pages, y rechaza un wasm con hilos", () => {
    const shared = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x05, 0x04, 0x01, 0x03, 0x01, 0x02]);
    const plain = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x05, 0x03, 0x01, 0x00, 0x01]);
    const dir = fixture();
    plant(dir, "index.html", contract);
    plant(dir, "index.wasm", brotliCompressSync(shared, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
    plant(dir, "hilos.html", `${contract}<script>const GODOT_THREADS_ENABLED = true;</script>`);
    const threaded = inspectServedApp(dir, "demo");
    expect(threaded.errors.some((line) => line.includes("memoria compartida"))).toBe(true);
    expect(threaded.errors.some((line) => line.includes("hilos de Godot"))).toBe(true);

    const heavy = fixture();
    plant(heavy, "index.html", contract);
    plant(heavy, "grande.bin", Buffer.alloc(SERVED_APP_LIMITS.maxBytesPerFile + 1));
    const overFile = inspectServedApp(heavy, "demo");
    expect(overFile.errors.some((line) => line.includes(String(SERVED_APP_LIMITS.maxBytesPerFile)))).toBe(true);
    expect(overFile.errors.some((line) => line.includes("Pages"))).toBe(false);

    const pages = fixture();
    plant(pages, "index.html", contract);
    plant(pages, "pagina.bin", Buffer.alloc(SERVED_APP_LIMITS.pagesMaxBytes + 1));
    const overPages = inspectServedApp(pages, "demo");
    expect(overPages.errors.some((line) => line.includes("Pages"))).toBe(true);

    const ok = fixture();
    plant(ok, "index.html", contract);
    plant(ok, "index.wasm", brotliCompressSync(plain, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }));
    expect(inspectServedApp(ok, "demo").errors).toEqual([]);

    rmSync(dir, { recursive: true, force: true });
    rmSync(heavy, { recursive: true, force: true });
    rmSync(pages, { recursive: true, force: true });
    rmSync(ok, { recursive: true, force: true });
  });

  it("un export estático no cuenta la carpeta godot", () => {
    const dir = fixture();
    plant(dir, "index.html", contract);
    plant(dir, "godot/project.godot", "config_version=5\n");
    const result = inspectServedApp(dir, "demo", { staticProto: true });
    expect(result.errors).toEqual([]);
    expect(result.files).toBe(1);
    rmSync(dir, { recursive: true, force: true });
  });

  it("cuenta los archivos y el total", () => {
    const dir = fixture();
    plant(dir, "index.html", contract);
    const many = SERVED_APP_LIMITS.maxFiles;
    for (let index = 0; index < many; index += 1) plant(dir, `f${index}.txt`, "a");
    const result = inspectServedApp(dir, "demo");
    expect(result.errors.some((line) => line.includes("archivos"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });
});
