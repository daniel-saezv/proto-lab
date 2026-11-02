import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { readCatalog } from "./catalog-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("descubrimiento de aplicaciones", () => {
  it("los scripts de la raíz no nombran paquetes de protos", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    for (const name of ["dev", "build", "typecheck"]) {
      const script = pkg.scripts[name];
      expect(script, name).not.toContain("@proto-lab/chispa");
      expect(script, name).not.toContain("@proto-lab/asset-lab");
      expect(script, name).toContain("./protos/**");
    }
    expect(pkg.scripts.typecheck).toContain("./templates/**");
  });

  it("Vitest y tsc usan un glob, no una lista de slugs", () => {
    const vitest = readFileSync(join(root, "vitest.config.ts"), "utf8");
    expect(vitest).toContain("protos/*/src/**/*.test.ts");
    expect(vitest).not.toContain("protos/chispa/");
    const tsconfig = JSON.parse(readFileSync(join(root, "tsconfig.json"), "utf8"));
    expect(tsconfig.include).toContain("protos/*/src/**/*.test.ts");
    expect(tsconfig.include.some((item) => item.includes("chispa"))).toBe(false);
  });

  it("el filtro de pnpm resuelve las carpetas de protos y deja fuera el laboratorio", () => {
    const out = execFileSync("pnpm", ["--filter", "./protos/**", "list", "--depth", "-1"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(out).toContain("@proto-lab/chispa");
    expect(out).toContain("@proto-lab/asset-lab");
    expect(out).not.toContain("@proto-lab/world");
    const template = execFileSync("pnpm", ["--filter", "./templates/**", "list", "--depth", "-1"], {
      cwd: root,
      encoding: "utf8",
    });
    expect(template).toContain("@proto-lab/aplicacion");
  });

  it("el catálogo acepta una carpeta sin package.json", () => {
    const repo = mkdtempSync(join(tmpdir(), "catalogo-"));
    const dir = join(repo, "protos", "export-fijo");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "proto.json"),
      JSON.stringify({
        slug: "export-fijo",
        title: "Export fijo",
        description: "Carpeta servida tal cual, sin Vite.",
        author: "proto-lab",
        date: "2026-11-02",
        tags: ["export"],
        cover: null,
        version: "0.1.0",
        history: [{ version: "0.1.0", date: "2026-11-02", note: "Alta estática." }],
      }),
    );
    writeFileSync(join(dir, "index.html"), "<!doctype html><title>Export</title>");
    const entries = readCatalog(repo);
    expect(entries.map((entry) => entry.slug)).toEqual(["export-fijo"]);
    expect(entries[0].readyMs).toBe(8000);
    rmSync(repo, { recursive: true, force: true });
  });
});
