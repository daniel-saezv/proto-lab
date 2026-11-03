import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { classifyPaths, closingIssueNumbers, decide, proposalScopeError } from "./ci-paths.mjs";

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
        CI_PR_BODY: "",
        CI_ISSUE_LABELS: "",
        GITHUB_OUTPUT: out,
      },
    });
    const text = readFileSync(out, "utf8");
    expect(text).toContain("lab=false");
    expect(text).toContain("protos=chispa");
    expect(text).toContain("mode=aplicaciones");
  });
});

function runPaths(env) {
  const out = join(mkdtempSync(join(tmpdir(), "ci-paths-")), "output");
  try {
    const stdout = execFileSync("node", [script], {
      env: { ...process.env, GITHUB_OUTPUT: out, CI_PR_BODY: "", CI_ISSUE_LABELS: "", ...env },
      encoding: "utf8",
    });
    return { status: 0, stdout, out: existsSync(out) ? readFileSync(out, "utf8") : "" };
  } catch (error) {
    const failed = /** @type {{ status?: number, stderr?: Buffer | string, stdout?: Buffer | string }} */ (error);
    return {
      status: failed.status ?? 1,
      stdout: String(failed.stdout ?? ""),
      stderr: String(failed.stderr ?? ""),
      out: existsSync(out) ? readFileSync(out, "utf8") : "",
    };
  }
}

describe("barrera de una propuesta", () => {
  it("solo cuenta la palabra que cierra la issue", () => {
    expect(closingIssueNumbers("Menciono #4 y también Fixes: #12.")).toEqual([12]);
    expect(closingIssueNumbers("Closes #9\nfixed #2")).toEqual([2, 9]);
    expect(proposalScopeError(["protos/chispa/index.html"], [], new Map())).toBeNull();
  });

  it("una propuesta cerrada solo puede tocar un prototipo y el lockfile", () => {
    const labels = new Map([[4, ["propuesta"]]]);
    expect(proposalScopeError(["protos/chispa/src/main.ts", "pnpm-lock.yaml"], [4], labels)).toBeNull();
    expect(proposalScopeError(["protos/chispa/a.ts", "protos/toque/index.html"], [4], labels)).toMatch(/un prototipo/);
    expect(proposalScopeError(["protos/chispa/a.ts", ".github/workflows/ci.yml"], [4], labels)).toMatch(/no puede tocar/);
    expect(proposalScopeError(["docs/nota.md"], [4], labels)).toMatch(/ninguno/);
    expect(proposalScopeError([".github/workflows/ci.yml"], [4], new Map([[4, ["bug"]]]))).toBeNull();
    expect(proposalScopeError([".github/workflows/ci.yml"], [4], new Map())).toMatch(/falla en cerrado/);
  });

  it("el script sale con error y no escribe la salida si la barrera falla", () => {
    const failed = runPaths({
      EVENT_NAME: "pull_request",
      CI_PATHS_FILES: "protos/chispa/src/main.ts\n.github/workflows/ci.yml",
      CI_PR_BODY: "Closes #4",
      CI_ISSUE_LABELS: "4=propuesta",
    });
    expect(failed.status).not.toBe(0);
    expect(failed.stderr).toMatch(/no puede tocar/);
    expect(failed.out).toBe("");

    const passed = runPaths({
      EVENT_NAME: "pull_request",
      CI_PATHS_FILES: "protos/chispa/src/main.ts\npnpm-lock.yaml",
      CI_PR_BODY: "Closes #4",
      CI_ISSUE_LABELS: "4=propuesta,iteracion",
    });
    expect(passed.status).toBe(0);
    expect(passed.out).toContain("protos=chispa");
    expect(passed.out).toContain("mode=completo");
  });
});
