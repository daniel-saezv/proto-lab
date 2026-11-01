import { describe, expect, it } from "vitest";
import { emphasisPlain, lineRuns } from "./dialogue-emphasis";
import { lineDurationMs, typeDelayMs } from "./dialogue-type";

describe("énfasis del diálogo", () => {
  it("deja el texto plano y marca solo las etiquetas conocidas", () => {
    const source = "Hola {em}pipa{/em}, un {glow}fulgor{/glow} y {shake}resortes{/shake}.";
    const { plain, runs } = lineRuns(source);
    expect(plain).toBe("Hola pipa, un fulgor y resortes.");
    expect(emphasisPlain(source)).toBe(plain);
    expect(runs.filter((run) => run.kind).map((run) => [run.kind, run.text])).toEqual([
      ["em", "pipa"],
      ["glow", "fulgor"],
      ["shake", "resortes"],
    ]);
    expect(runs.reduce((text, run) => text + run.text, "")).toBe(plain);
    for (const run of runs) {
      expect(plain.slice(run.start, run.end)).toBe(run.text);
    }
  });

  it("conserva un símbolo de marca como clase, no como texto", () => {
    const { plain, runs } = lineRuns("este {mark}as{/mark} de cartón");
    expect(plain).toBe("este as de cartón");
    expect(plain).not.toContain("✦");
    expect(runs.some((run) => run.kind === "mark" && run.text === "as")).toBe(true);
  });

  it("trata como literal una marca abierta, vacía o desconocida", () => {
    expect(emphasisPlain("{em}sin cierre")).toBe("{em}sin cierre");
    expect(emphasisPlain("nada {foo}aquí{/foo}")).toBe("nada {foo}aquí{/foo}");
    expect(emphasisPlain("antes {em}{/em}después")).toBe("antes después");
    expect(lineRuns("{shake}abierto {em}dentro{/em}")).toMatchObject({
      plain: "{shake}abierto dentro",
    });
  });

  it("respeta los saltos de línea dentro y fuera de la marca", () => {
    const { plain } = lineRuns("linea\n{em}dos\ntres{/em}");
    expect(plain).toBe("linea\ndos\ntres");
  });
});

describe("ritmo del mecanografiado", () => {
  it("pausa en la puntuación y acelera en el espacio", () => {
    const text = "Hola, mundo. Sí…";
    expect(typeDelayMs(text, text.indexOf("H"))).toBeLessThan(typeDelayMs(text, text.indexOf(",")));
    expect(typeDelayMs(text, text.indexOf(","))).toBeLessThan(typeDelayMs(text, text.indexOf(".")));
    expect(typeDelayMs(text, text.indexOf(" "))).toBeLessThan(typeDelayMs(text, text.indexOf("H")));
    expect(typeDelayMs(text, text.indexOf("…"))).toBe(typeDelayMs("a.", 1));
  });

  it("no frena cada punto de unos puntos suspensivos", () => {
    const text = "espera... ya";
    const dots = text.indexOf(".");
    expect(typeDelayMs(text, dots)).toBeLessThan(40);
    expect(typeDelayMs(text, dots + 1)).toBeLessThan(40);
    expect(typeDelayMs(text, dots + 2)).toBeGreaterThan(180);
  });

  it("mantiene una frase corta por debajo de unos segundos", () => {
    const line = "Aparta el aire, que esta pipa ya cuenta sola.";
    expect(lineDurationMs(line)).toBeGreaterThan(400);
    expect(lineDurationMs(line)).toBeLessThan(2800);
  });
});
