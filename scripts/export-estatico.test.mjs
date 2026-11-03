import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { assertManifest } from "./catalog-lib.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "templates", "export-estatico");

describe("plantilla de export estático", () => {
  it("no trae package.json y el shell avisa ready solo cuando se le pide", () => {
    expect(() => readFileSync(join(dir, "package.json"), "utf8")).toThrow();
    const shell = readFileSync(join(dir, "arranque.js"), "utf8");
    expect(shell).toContain("__protoLabApp");
    expect(shell).toContain("__protoLabNotifyReady");
    expect(shell).toContain('post("alive")');
    expect(shell).toContain('post("ready")');
    expect(shell).not.toContain("DOMContentLoaded");
    expect(shell).not.toContain('addEventListener("load"');
    const html = readFileSync(join(dir, "index.html"), "utf8");
    expect(html).toContain("./arranque.js");
    const godotShell = readFileSync(join(dir, "godot-shell.html"), "utf8");
    expect(godotShell).toContain("./arranque.js");
    expect(godotShell).toContain("startGame");
    expect(godotShell).toContain("__protoLabNotifyReady");
    expect(godotShell).toContain("requestQuit");
    expect(godotShell).not.toContain("eval(");
    expect(godotShell).not.toContain("installServiceWorker");
    expect(godotShell).toContain("onProgress");
    expect(godotShell).toContain("type: 'progress'");
  });

  it("el manifiesto de ejemplo pasa el lector", () => {
    const manifest = JSON.parse(readFileSync(join(dir, "proto.json"), "utf8"));
    const validated = assertManifest(manifest.slug, manifest, dir);
    expect(validated.readyMs).toBe(20000);
    expect(validated.capabilities).toEqual(["save"]);
    expect(validated.permissions).toEqual([]);
  });
});
