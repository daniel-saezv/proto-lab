import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));

describe("salto de la cinemática del escritorio", () => {
  it("el botón Saltar cabe en el dedo y respeta el área segura", () => {
    const html = readFileSync(join(here, "../index.html"), "utf8");
    expect(html).toContain('id="workshop-skip"');
    expect(html).toContain('data-testid="workshop-skip"');
    expect(html).toContain(">Saltar</button>");
    const css = readFileSync(join(here, "style.css"), "utf8");
    const rule = css.slice(css.indexOf("#workshop-skip {"), css.indexOf("#workshop-skip[hidden]"));
    expect(rule).toContain("min-width: 44px");
    expect(rule).toContain("min-height: 44px");
    expect(rule).toContain("touch-action: manipulation");
    expect(rule).toContain("safe-area-inset-top");
    expect(rule).toContain("safe-area-inset-left");
    expect(css).toContain("#workshop-skip[hidden] { display: none; }");
  });

  it("en horizontal el diálogo encoge el texto para que quepan cuatro acciones", () => {
    const css = readFileSync(join(here, "style.css"), "utf8");
    const query = css.slice(css.indexOf("@media (max-height: 500px)"));
    expect(query).toContain(".dialogue-choice");
    expect(query).toContain("min-height: 44px");
    expect(query).toContain("touch-action: manipulation");
  });
});
