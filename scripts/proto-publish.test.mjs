import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProtoOutput, STATIC_SKIP } from "./proto-publish.mjs";

describe("salida de una aplicación", () => {
  it("un export estático no necesita package.json ni dist", () => {
    const dir = mkdtempSync(join(tmpdir(), "proto-static-"));
    writeFileSync(join(dir, "index.html"), "<!doctype html>");
    writeFileSync(join(dir, "proto.json"), "{}");
    expect(resolveProtoOutput(dir)).toEqual({ kind: "static", dir });
    rmSync(dir, { recursive: true, force: true });
  });

  it("con package.json exige el dist de Vite", () => {
    const dir = mkdtempSync(join(tmpdir(), "proto-vite-"));
    writeFileSync(join(dir, "package.json"), "{}");
    expect(() => resolveProtoOutput(dir)).toThrow(/Falta el build/);
    mkdirSync(join(dir, "dist"));
    expect(resolveProtoOutput(dir)).toEqual({ kind: "build", dir: join(dir, "dist") });
    rmSync(dir, { recursive: true, force: true });
  });

  it("no publica la carpeta db ni el proyecto Godot", () => {
    expect(STATIC_SKIP.has("db")).toBe(true);
    expect(STATIC_SKIP.has("godot")).toBe(true);
  });

  it("el export estático tiene que traer index.html", () => {
    const dir = mkdtempSync(join(tmpdir(), "proto-empty-"));
    expect(() => resolveProtoOutput(dir)).toThrow(/index.html/);
    rmSync(dir, { recursive: true, force: true });
  });
});
