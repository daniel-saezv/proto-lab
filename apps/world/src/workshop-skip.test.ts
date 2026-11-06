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
    const query = css.slice(css.lastIndexOf("@media (max-height: 500px)"));
    expect(query).toContain(".dialogue-choice");
    expect(query).toContain("min-height: 44px");
    expect(query).toContain("touch-action: manipulation");
    const workshop = query.slice(query.indexOf("#dialogue.is-workshop"), query.indexOf(".dialogue-head"));
    expect(workshop).toContain(
      "max-height: calc(100% - 16px - env(safe-area-inset-top) - env(safe-area-inset-bottom) - var(--dialogue-kb, 0px))",
    );
    expect(workshop).toContain("--workshop-kb");
    expect(workshop).not.toContain("48%");
    expect(query).toContain(".workshop-options { grid-template-columns: 1fr 1fr; }");
    expect(query).toContain(".workshop-actions { grid-template-columns: 1fr 1fr 1fr; }");
  });

  it("durante las rondas Seguir ocupa una sola columna centrada en el área segura", () => {
    const css = readFileSync(join(here, "style.css"), "utf8");
    const bar = css.slice(
      css.indexOf('#dialogue.is-workshop[data-workshop="pick"] {'),
      css.indexOf('#dialogue.is-workshop[data-workshop="pick"] .dialog-dismiss'),
    );
    expect(bar).toContain("position: fixed");
    expect(bar).toContain("safe-area-inset-left");
    expect(bar).toContain("safe-area-inset-right");
    expect(bar).toContain("safe-area-inset-bottom");
    expect(bar).toContain('#dialogue.is-workshop[data-workshop="pick"].dialogue-arrive');
    expect(bar).toContain("animation: none");
    const marker = '#dialogue.is-workshop[data-workshop="pick"] .workshop-actions {';
    const start = css.indexOf(marker, css.indexOf(marker) + marker.length);
    const actions = css.slice(start, css.indexOf("}", start));
    expect(actions).toContain("display: flex");
    expect(actions).toContain("justify-content: center");
    expect(actions).toContain("grid-template-columns: 1fr");
  });
});
