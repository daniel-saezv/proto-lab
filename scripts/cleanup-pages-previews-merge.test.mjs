import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.dirname(fileURLToPath(import.meta.url));
const script = path.join(root, "..", ".github", "scripts", "cleanup-pages-previews.test.sh");

describe("cleanup-pages-previews", () => {
  it("fusiona páginas, pagina y formatea errores de la API de Pages", () => {
    const out = execFileSync("bash", [script], { encoding: "utf8" });
    expect(out).toContain("API helpers OK");
  });
});
