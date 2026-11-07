import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync } from "node:zlib";
import { describe, expect, it } from "vitest";
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
const project = `config_version=5
[display]
window/size/viewport_width=390
window/size/viewport_height=844
window/stretch/mode="canvas_items"
window/stretch/aspect="expand"
window/handheld/orientation=1
[input_devices]
pointing/emulate_touch_from_mouse=true
[rendering]
renderer/rendering_method="gl_compatibility"
renderer/rendering_method.mobile="gl_compatibility"
textures/vram_compression/import_etc2_astc=true
`;
const preset = `variant/thread_support=false
variant/extensions_support=false
progressive_web_app/enabled=false
progressive_web_app/ensure_cross_origin_isolation_headers=false
vram_texture_compression/for_mobile=true
vram_texture_compression/for_desktop=false
html/custom_html_shell="shell.html"
`;

function makePack(scene) {
  const filename = Buffer.from("res://main.scn");
  const file = Buffer.from(scene);
  const directoryOffset = 40;
  const dataOffset = directoryOffset + 4 + 4 + filename.length + 8 + 8 + 16 + 4;
  const pack = Buffer.alloc(dataOffset + file.length);
  pack.write("GDPC", 0);
  pack.writeUInt32LE(4, 4);
  pack.writeBigUInt64LE(BigInt(dataOffset), 24);
  pack.writeBigUInt64LE(BigInt(directoryOffset), 32);
  pack.writeUInt32LE(1, directoryOffset);
  let offset = directoryOffset + 4;
  pack.writeUInt32LE(filename.length, offset);
  offset += 4;
  filename.copy(pack, offset);
  offset += filename.length;
  pack.writeBigUInt64LE(0n, offset);
  pack.writeBigUInt64LE(BigInt(file.length), offset + 8);
  offset += 8 + 8 + 16 + 4;
  file.copy(pack, dataOffset);
  return pack;
}

function scene(ids, content = "scene: original") {
  const nodeIds = Buffer.alloc(8);
  nodeIds.writeUInt32LE(ids[0], 0);
  nodeIds.writeUInt32LE(ids[1], 4);
  return Buffer.concat([
    Buffer.from(`${content}\nnode_ids\0`),
    Buffer.alloc(4),
    Buffer.from([2, 0, 0, 0]),
    nodeIds,
  ]);
}

describe("export web de Godot", () => {
  it("valida la configuración mínima y el shell de la plantilla", () => {
    expect(assertGodotProject(project, preset)).toEqual([]);
    const estrecho = project.replace("window/size/viewport_width=390", "window/size/viewport_width=1280");
    expect(assertGodotProject(estrecho, preset).some((line) => line.includes("viewport_width"))).toBe(true);
    const escritorio = preset.replace("vram_texture_compression/for_desktop=false", "vram_texture_compression/for_desktop=true");
    expect(assertGodotProject(project, escritorio).some((line) => line.includes("for_desktop"))).toBe(true);
    const template = readFileSync(join(root, "templates/export-estatico/godot-shell.html"), "utf8");
    expect(template).toContain('src="/protos/engines/godot/4.7.2-stable-nothreads/index.js"');
    expect(template).toContain("engine.requestQuit()");
    expect(template).toContain("window.__protoLabNotifyReady()");
    expect(template).toContain("mainPack: 'index.pck'");
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
    writeFileSync(join(protoDir, "preview.mp4"), Buffer.from("clip"));
    writeFileSync(join(protoDir, "preview-src.sha256"), Buffer.from("sello\n"));
    writeFileSync(join(protoDir, "preview.webp"), Buffer.from("foto"));
    writeFileSync(join(protoDir, "proto.json"), Buffer.from("{}\n"));
    expect(compareServed(protoDir, prepared.files)).toEqual([]);
    expect(compareEngine(engineDir, prepared.engine)).toEqual([]);
    writeFileSync(join(engineDir, "index.wasm"), plain);
    expect(compareEngine(engineDir, prepared.engine).some((line) => line.includes("Brotli"))).toBe(true);
    rmSync(exportDir, { recursive: true, force: true });
    rmSync(protoDir, { recursive: true, force: true });
    rmSync(engineDir, { recursive: true, force: true });
  });

  it("tolera los node_ids del pck y detecta un cambio de escena", () => {
    const exported = makePack(scene([12, 24]));
    const published = brotliCompressSync(makePack(scene([81, 93])));
    const decoded = decodeServedPack(published);
    expect(decoded?.brotli).toBe(true);
    const pck = decoded.pack;
    expect(packsMatch(published, exported)).toBe(true);
    expect(packsMatch(published, makePack(scene([81, 93], "scene: changed")))).toBe(false);
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
  });

  it("el diff nombra solo los proyectos Godot que toca", () => {
    expect(godotSlugsInDiff(["protos/demo-game/godot/project.godot", "protos/chispa/src/main.ts", "README.md"])).toEqual([
      "demo-game",
    ]);
    expect(godotSlugsInDiff(["scripts/godot-web.mjs"])).toEqual([]);
    const projects = listGodotProjects(join(root, "protos"));
    expect(projects.length).toBeGreaterThan(0);
    for (const slug of projects) {
      expect(existsSync(join(root, "protos", slug, "godot", "project.godot"))).toBe(true);
    }
  });
});
