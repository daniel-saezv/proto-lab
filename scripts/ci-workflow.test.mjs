import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", ".github", "workflows", "ci.yml"), "utf8");

function jobBlock(id) {
  const marker = `\n  ${id}:\n`;
  const start = workflow.indexOf(marker);
  if (start < 0) throw new Error(`sin job ${id}`);
  const from = start + 1;
  const re = /\n  [a-z][\w-]*:\n/g;
  re.lastIndex = from + id.length;
  const next = re.exec(workflow);
  return workflow.slice(from, next ? next.index : workflow.length);
}

describe("workflow de CI", () => {
  it("conserva los nombres de los checks obligatorios y la compuerta informa aunque el trabajo se omita", () => {
    expect(workflow).toContain("name: Typecheck, tests y build");
    expect(workflow).toContain("name: E2E (chromium)\n");
    expect(workflow).toContain("name: E2E (webkit-iphone)\n");
    expect(workflow).not.toContain("!= 'skipped'");
    expect(workflow).not.toContain('!= "skipped"');
    const chromiumGate = jobBlock("e2e-chromium-gate");
    const webkitGate = jobBlock("e2e-webkit-gate");
    expect(chromiumGate).toContain('name: E2E (chromium)');
    expect(webkitGate).toContain('name: E2E (webkit-iphone)');
    expect(chromiumGate).toContain("always()");
    expect(webkitGate).toContain("always()");
    expect(chromiumGate).not.toContain("skipped");
    expect(webkitGate).not.toContain("skipped");
  });

  it("mantiene tres shards de Chromium y la imagen fijada", () => {
    expect(workflow).toContain("shard: [1, 2, 3]");
    expect(workflow.match(/mcr\.microsoft\.com\/playwright:v1\.64\.1-noble/g)).toHaveLength(3);
    expect(workflow).not.toContain("Versión Playwright");
    expect(workflow).not.toContain("playwright-version:");
    expect(jobBlock("verificar")).toContain("lab: ${{ steps.clasificar.outputs.lab }}");
    expect(jobBlock("e2e-chromium")).toContain("needs.verificar.outputs.lab == 'true'");
    expect(jobBlock("e2e-webkit")).toContain("needs.verificar.outputs.lab == 'true'");
    expect(jobBlock("e2e-chromium-gate")).toContain("No se pudo clasificar el diff.");
    expect(jobBlock("e2e-webkit-gate")).toContain("No se pudo clasificar el diff.");
    expect(jobBlock("e2e-webkit")).toContain("name: E2E (webkit-iphone trabajo)");
  });

  it("el móvil táctil reducido es un solo job, reutiliza el sitio y no es compuerta", () => {
    const job = jobBlock("e2e-chromium-android");
    expect(job).toContain("name: E2E (chromium-android)\n");
    expect(job).toContain("needs.verificar.result == 'success'");
    expect(job).toContain("needs.verificar.outputs.lab == 'true'");
    expect(job).toContain("project: chromium-android");
    expect(job).toContain('build: "false"');
    expect(job).toContain("actions/download-artifact@v8.0.2");
    expect(job).not.toContain("shard:");
    expect(job).not.toContain("strategy:");
    expect(workflow).not.toContain("e2e-chromium-android-gate");
    const verificar = jobBlock("verificar");
    expect(verificar).toContain("actions/upload-artifact@v7.0.2");
    expect(verificar).toContain("name: site-dist");
    expect(verificar).toContain("actions: write");
    const config = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "playwright.config.ts"), "utf8");
    expect(config).toContain('name: "chromium-android"');
    expect(config).toContain("grep: /@movil/");
    expect(config).toContain('devices["Pixel 7"]');
    const helpers = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "e2e", "helpers.ts"), "utf8");
    expect(helpers).toContain('export const TOUCH_MOBILE_TAG = "@movil"');
    expect(helpers).not.toContain("skipUnlessWebKitIphone");
  });

  it("pide Node 26 en Actions, en los archivos que lee Pages y en engines", () => {
    const root = join(dirname(fileURLToPath(import.meta.url)), "..");
    expect(readFileSync(join(root, ".nvmrc"), "utf8").trim()).toBe("26");
    expect(readFileSync(join(root, ".node-version"), "utf8").trim()).toBe("26");
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(pkg.engines.node).toBe(">=26");
    expect(pkg.devDependencies["@types/node"].startsWith("^26.")).toBe(true);
    expect(pkg.packageManager).toBe("pnpm@12.17.0");
    for (const id of ["verificar", "main-push"]) {
      const job = jobBlock(id);
      expect(job).toContain("node-version: 26");
      expect(job).not.toContain("node-version: 22");
      expect(job).toContain("actions/setup-node@v7.1.0");
    }
    for (const file of [
      ".github/actions/playwright/action.yml",
      ".github/workflows/d1-app-tables.yml",
      ".github/workflows/exportar-godot.yml",
      ".github/workflows/medir-godot.yml",
    ]) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).toContain("actions/setup-node@v7.1.0");
      expect(source).toContain("node-version: 26");
      expect(source).not.toContain("node-version: 22");
    }
  });

  it("el atajo de una aplicación no lanza el build del laboratorio", () => {
    const verificar = jobBlock("verificar");
    expect(verificar).toContain("node scripts/ci-paths.mjs");
    expect(verificar).toContain("bash .github/scripts/ci-protos.sh");
    expect(verificar).toContain("steps.clasificar.outputs.mode == 'aplicaciones'");
    expect(verificar).toContain("steps.clasificar.outputs.mode == 'completo'");
  });
});
