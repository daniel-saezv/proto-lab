import { describe, expect, it } from "vitest";
import { emphasisPlain, lineRuns } from "./dialogue-emphasis";
import { INVENTOR_RESULT_OK, inventorSpeech } from "./dialogue-speech";
import type { CatalogEntry } from "./types";

const chispa = { slug: "chispa", title: "Chispa", version: "1.0.0" } as CatalogEntry;

describe("inventorSpeech", () => {
  it("presenta la máquina única y los mundos dentro", () => {
    const text = inventorSpeech({ name: "greet" }, { kind: "propuesta", title: "", description: "" }, []);
    expect(text).toContain("la máquina de este laboratorio");
    expect(text).not.toMatch(/máquinas/i);
    expect(text).toMatch(/mundos, apps y juegos/);
  });

  it("en pick vacío habla de mundos en la máquina", () => {
    const text = inventorSpeech({ name: "pick" }, { kind: "iteracion", title: "", description: "" }, []);
    expect(text).toContain("mundos encendidos");
    expect(text).not.toMatch(/máquinas/i);
  });

  it("en pick con catálogo pide elegir mundo, app o juego de la lista", () => {
    const text = inventorSpeech({ name: "pick" }, { kind: "iteracion", title: "", description: "" }, [chispa]);
    expect(text).toMatch(/mundos, apps o juegos/);
    expect(text).toContain("de la lista");
    expect(text).not.toMatch(/acercarte/i);
  });

  it("usa un fallback de mundo en iteración sin título conocido", () => {
    const text = inventorSpeech(
      { name: "body", mode: "iteracion" },
      { kind: "iteracion", title: "T", description: "", slug: "desconocido" },
      [],
    );
    expect(text).toContain("ese mundo");
    expect(text).not.toContain("esa máquina");
  });

  it("el mensaje de éxito no habla de varias máquinas", () => {
    expect(INVENTOR_RESULT_OK).toContain("la máquina");
    expect(INVENTOR_RESULT_OK).not.toMatch(/máquinas/i);
  });

  it("la confirmación ofrece el escritorio y conserva la nota", () => {
    const draft = { kind: "propuesta" as const, title: "Farol", description: "Una app para anotar turnos." };
    const text = inventorSpeech({ name: "confirm" }, draft, []);
    expect(text).toContain("¿Lo envío así?");
    expect(text).toContain("Farol");
    expect(text).toContain("Una app para anotar turnos.");
    expect(text).toContain("escritorio");
    expect(text).not.toMatch(/juego/i);
    const iteration = inventorSpeech(
      { name: "confirm" },
      { kind: "iteracion", title: "Farol", description: "Que el botón quepa en el pulgar.", slug: "chispa" },
      [chispa],
    );
    expect(iteration).toContain("mejora");
    expect(iteration).toContain("1.0.0");
    expect(iteration).not.toMatch(/juego/i);
  });

  it("el escritorio explica la charla, sin reescribir la nota", () => {
    const text = inventorSpeech(
      { name: "workshop" },
      { kind: "propuesta", title: "Farol", description: "Una app para anotar turnos." },
      [],
    );
    expect(text).toContain("cinco turnos");
    expect(text).toContain("tablón");
    expect(text).not.toContain("Farol");
    expect(text).not.toMatch(/juego/i);
    const { plain, runs } = lineRuns(text);
    expect(runs.filter((run) => run.kind).length).toBeLessThanOrEqual(1);
    expect(plain).not.toMatch(/[{}]/);
  });

  it("el énfasis no se come las frases fijas y cabe en una marca por línea", () => {
    const draft = { kind: "propuesta" as const, title: "", description: "" };
    const samples = [
      inventorSpeech({ name: "greet" }, draft, []),
      inventorSpeech({ name: "title", mode: "propuesta" }, draft, []),
      inventorSpeech({ name: "pick" }, { kind: "iteracion", title: "", description: "" }, [chispa]),
      inventorSpeech({ name: "sending" }, draft, []),
    ];
    for (const text of samples) {
      const { plain, runs } = lineRuns(text);
      expect(runs.filter((run) => run.kind).length).toBeLessThanOrEqual(1);
      expect(plain).not.toMatch(/[{}]/);
    }
    expect(emphasisPlain(samples[0]!)).toContain("la máquina de este laboratorio");
    expect(emphasisPlain(samples[2]!)).toContain("de la lista");
  });
});
