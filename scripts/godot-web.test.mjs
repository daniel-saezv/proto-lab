import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { inspectServedApp } from "./app-budget.mjs";
import { assertSharedEngines, GODOT_ENGINE_BASE } from "./godot-engine.mjs";
import {
  assertGodotProject,
  compareEngine,
  compareServed,
  decodeServedPack,
  godotSlugsInDiff,
  listGodotProjects,
  packsMatch,
  prepareServedFiles,
} from "./godot-web.mjs";
import { compressWasmBrotli } from "./wasm-module.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const plain = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x05, 0x03, 0x01, 0x00, 0x01]);
const shared = Buffer.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00, 0x05, 0x04, 0x01, 0x03, 0x01, 0x02]);

const html = `<!doctype html><script src="./arranque.js"></script><script>
const GODOT_THREADS_ENABLED = false;
engine.startGame().then(function () { window.__protoLabNotifyReady(); });
engine.requestQuit();
</script>`;

describe("export web de Godot", () => {
  it("acepta el proyecto de ejemplo y el shell de la plantilla", () => {
    const project = readFileSync(join(root, "protos/toque/godot/project.godot"), "utf8");
    const preset = readFileSync(join(root, "protos/toque/godot/export_presets.cfg"), "utf8");
    expect(assertGodotProject(project, preset)).toEqual([]);
    const estrecho = project.replace("window/size/viewport_width=390", "window/size/viewport_width=1280");
    expect(assertGodotProject(estrecho, preset).some((line) => line.includes("viewport_width"))).toBe(true);
    const escritorio = preset.replace("vram_texture_compression/for_desktop=false", "vram_texture_compression/for_desktop=true");
    expect(assertGodotProject(project, escritorio).some((line) => line.includes("for_desktop"))).toBe(true);
    const shell = readFileSync(join(root, "protos/toque/godot/shell.html"));
    const template = readFileSync(join(root, "templates/export-estatico/godot-shell.html"));
    expect(shell.equals(template)).toBe(true);
  });

  it("publica el wasm en Brotli y rechaza memoria compartida", () => {
    const dir = mkdtempSync(join(tmpdir(), "godot-export-"));
    writeFileSync(join(dir, "index.html"), html);
    writeFileSync(join(dir, "index.js"), "var engine = {};");
    writeFileSync(join(dir, "index.wasm"), plain);
    const arranque = Buffer.from("window.__protoLabApp={stop(){}};");
    const prepared = prepareServedFiles(dir, arranque);
    expect(prepared.errors).toEqual([]);
    const wasm = prepared.engine.get("index.wasm");
    expect(wasm.equals(compressWasmBrotli(plain))).toBe(true);
    expect(prepared.files.has("index.wasm")).toBe(false);
    expect(prepared.engine.get("index.js").equals(Buffer.from("var engine = {};"))).toBe(true);
    expect(prepared.files.get("arranque.js").equals(arranque)).toBe(true);

    writeFileSync(join(dir, "index.wasm"), shared);
    const threaded = prepareServedFiles(dir, arranque);
    expect(threaded.errors.some((line) => line.includes("memoria compartida"))).toBe(true);
    rmSync(dir, { recursive: true, force: true });
  });

  it("exige que lo publicado coincida con el export", () => {
    const exportDir = mkdtempSync(join(tmpdir(), "godot-src-"));
    const protoDir = mkdtempSync(join(tmpdir(), "godot-pub-"));
    const engineDir = mkdtempSync(join(tmpdir(), "godot-engine-"));
    writeFileSync(join(exportDir, "index.html"), html);
    writeFileSync(join(exportDir, "index.wasm"), plain);
    const arranque = Buffer.from("arranque");
    const prepared = prepareServedFiles(exportDir, arranque);
    expect(prepared.errors).toEqual([]);
    for (const [name, buf] of prepared.files) writeFileSync(join(protoDir, name), buf);
    for (const [name, buf] of prepared.engine) writeFileSync(join(engineDir, name), buf);
    expect(compareServed(protoDir, prepared.files)).toEqual([]);
    expect(compareEngine(engineDir, prepared.engine)).toEqual([]);
    writeFileSync(join(engineDir, "index.wasm"), plain);
    expect(compareEngine(engineDir, prepared.engine).some((line) => line.includes("Brotli"))).toBe(true);
    rmSync(exportDir, { recursive: true, force: true });
    rmSync(protoDir, { recursive: true, force: true });
    rmSync(engineDir, { recursive: true, force: true });
  });

  it("tolera los node_ids del pck y detecta un cambio de escena", () => {
    const stored = readFileSync(join(root, "protos/toque/index.pck"));
    const decoded = decodeServedPack(stored);
    expect(decoded?.brotli).toBe(true);
    const pck = decoded.pack;
    expect(packsMatch(stored, pck)).toBe(true);
    const changed = Buffer.from(pck);
    const at = changed.indexOf("Toca la pantalla");
    expect(at).toBeGreaterThan(0);
    changed[at] ^= 1;
    expect(packsMatch(pck, changed)).toBe(false);
  });

  it("Toque deja el motor fuera de la app y el paquete en Brotli", () => {
    const protoDir = join(root, "protos/toque");
    expect(existsSync(join(protoDir, "index.wasm"))).toBe(false);
    expect(existsSync(join(protoDir, "index.js"))).toBe(false);
    const html = readFileSync(join(protoDir, "index.html"), "utf8");
    expect(html).toContain(GODOT_ENGINE_BASE);
    expect(html).toContain("mainPack: 'index.pck'");
    const app = inspectServedApp(protoDir, "toque", { staticProto: true });
    expect(app.errors).toEqual([]);
    expect(app.total).toBeLessThan(1024 * 1024);
    const engines = assertSharedEngines(root);
    expect(engines.versions.map((item) => item.id)).toEqual(["4.7.2-stable-nothreads"]);
    expect(engines.versions[0].total).toBeGreaterThan(1024 * 1024);
  });
});

describe("disparadores de Godot", () => {
  function triggers(name) {
    const source = readFileSync(join(root, ".github/workflows", name), "utf8");
    return source.slice(0, source.search(/^jobs:/m));
  }

  it("la medición solo se lanza a mano", () => {
    const block = triggers("medir-godot.yml");
    expect(block).toMatch(/^on:\n {2}workflow_dispatch:\n/m);
    expect(block).not.toMatch(/^ {2}pull_request:/m);
    expect(block).not.toMatch(/^ {2}push:/m);
    expect(block).not.toMatch(/^ {2}schedule:/m);
  });

  it("el export corre en pull request o a mano, nunca en push ni en horario", () => {
    const source = readFileSync(join(root, ".github/workflows/exportar-godot.yml"), "utf8");
    const block = source.slice(0, source.search(/^jobs:/m));
    expect(block).toMatch(/^ {2}pull_request:/m);
    expect(block).toMatch(/^ {2}workflow_dispatch:/m);
    expect(block).not.toMatch(/^ {2}push:/m);
    expect(block).not.toMatch(/^ {2}schedule:/m);
    expect(block).toContain("protos/**/godot/**");
    expect(source).toContain("node scripts/godot-web.mjs --list-changed");
    expect(source).toContain("protos/${{ matrix.slug }}/godot");
    expect(source).toContain("name: godot-export-${{ matrix.slug }}");
    expect(source).toContain("actions/upload-artifact@v7.0.2");
    expect(source).not.toContain("contents: write");
    expect(source).not.toMatch(/relative_project_path: \.\/protos\/toque\/godot/);
  });

  it("el diff nombra solo los proyectos Godot que toca", () => {
    expect(godotSlugsInDiff(["protos/toque/godot/project.godot", "protos/chispa/src/main.ts", "README.md"])).toEqual(["toque"]);
    expect(godotSlugsInDiff(["scripts/godot-web.mjs"])).toEqual([]);
    expect(listGodotProjects(join(root, "protos"))).toEqual(["toque"]);
  });
});
