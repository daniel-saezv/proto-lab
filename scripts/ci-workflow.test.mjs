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
    expect(workflow.match(/mcr\.microsoft\.com\/playwright:v1\.64\.1-noble/g)).toHaveLength(2);
    expect(jobBlock("e2e-chromium")).toContain("needs.playwright-version.outputs.lab == 'true'");
    expect(jobBlock("e2e-webkit")).toContain("needs.playwright-version.outputs.lab == 'true'");
    expect(jobBlock("e2e-webkit")).toContain("name: E2E (webkit-iphone trabajo)");
  });

  it("el atajo de una aplicación no lanza el build del laboratorio", () => {
    const verificar = jobBlock("verificar");
    expect(verificar).toContain("node scripts/ci-paths.mjs");
    expect(verificar).toContain("bash .github/scripts/ci-protos.sh");
    expect(verificar).toContain("steps.clasificar.outputs.mode == 'aplicaciones'");
    expect(verificar).toContain("steps.clasificar.outputs.mode == 'completo'");
  });
});
