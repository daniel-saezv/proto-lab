import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = join(dirname(fileURLToPath(import.meta.url)), "..", ".github", "scripts", "ci-protos.sh");

function run(protos) {
  return execFileSync("bash", [script], {
    env: { ...process.env, PROTOS: protos, CI_PROTOS_DRY: "1" },
    encoding: "utf8",
  });
}

describe("atajo de aplicaciones", () => {
  it("prepara typecheck, tests y build de cada slug que existe", () => {
    const out = run("asset-lab,chispa");
    expect(out).toContain("typecheck asset-lab");
    expect(out).toContain("test asset-lab");
    expect(out).toContain("build asset-lab");
    expect(out).toContain("typecheck chispa");
    expect(out).toContain("build chispa");
  });

  it("avisa si la carpeta ya no está y rechaza un slug raro", () => {
    const out = run("ya-no-esta");
    expect(out).toContain("Sin paquete protos/ya-no-esta");
    expect(() => run("chispa,../secreto")).toThrow(/Slug no válido/);
  });
});
