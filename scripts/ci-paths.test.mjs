import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyPaths, decide } from "./ci-paths.mjs";

const script = join(dirname(fileURLToPath(import.meta.url)), "ci-paths.mjs");

describe("clasificación de rutas", () => {
  it("una aplicación sola no dispara el laboratorio", () => {
    expect(classifyPaths(["protos/chispa/src/main.ts", "protos/chispa/proto.json"])).toEqual({
      lab: false,
      protos: ["chispa"],
      mode: "aplicaciones",
    });
  });

  it("junta varias aplicaciones y ignora la documentación", () => {
    expect(
      classifyPaths(["protos/mi-app/index.html", "docs/nota.md", "README.md", "AGENTS.md", "protos/asset-lab/src/main.ts"]),
    ).toEqual({
      lab: false,
      protos: ["asset-lab", "mi-app"],
      mode: "aplicaciones",
    });
  });

  it("el laboratorio, las functions, e2e, scripts, workflows y la configuración de la raíz son CI completa", () => {
    const samples = [
      "apps/world/src/main.ts",
      "functions/_lib/validate.ts",
      "functions/api/proposals.ts",
      "e2e/smoke.spec.ts",
      "scripts/assemble.mjs",
      ".github/workflows/ci.yml",
      "package.json",
      "pnpm-lock.yaml",
      "pnpm-workspace.yaml",
      "tsconfig.json",
      "vitest.config.ts",
      "playwright.config.ts",
      "wrangler.toml",
      ".npmrc",
      ".nvmrc",
      ".node-version",
      ".gitignore",
    ];
    for (const file of samples) {
      const result = classifyPaths(["protos/chispa/src/main.ts", file]);
      expect(result.lab, file).toBe(true);
      expect(result.mode, file).toBe("completo");
    }
  });

  it("sin aplicaciones ni laboratorio hace la pasada completa y sin e2e", () => {
    expect(classifyPaths(["templates/aplicacion/src/main.ts", "docs/nota.md"])).toEqual({
      lab: false,
      protos: [],
      mode: "completo",
    });
  });

  it("un dispatch o un push a main no se queda en el atajo", () => {
    expect(decide(["protos/chispa/src/main.ts"], "workflow_dispatch").mode).toBe("completo");
    expect(decide(["protos/chispa/src/main.ts"], "push").lab).toBe(true);
  });
});

describe("salida para Actions", () => {
  it("escribe lab, protos y mode", () => {
    const out = join(mkdtempSync(join(tmpdir(), "ci-paths-")), "output");
    execFileSync("node", [script], {
      env: {
        ...process.env,
        EVENT_NAME: "pull_request",
        CI_PATHS_FILES: "protos/chispa/src/rules.ts\nREADME.md",
        GITHUB_OUTPUT: out,
      },
    });
    const text = readFileSync(out, "utf8");
    expect(text).toContain("lab=false");
    expect(text).toContain("protos=chispa");
    expect(text).toContain("mode=aplicaciones");
  });
});
