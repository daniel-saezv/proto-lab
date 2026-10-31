import { describe, expect, it } from "vitest";
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
});
