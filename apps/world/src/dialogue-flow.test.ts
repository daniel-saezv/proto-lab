import { describe, expect, it } from "vitest";
import { inventorChoices, phaseAfterWorkshopTrip } from "./dialogue-flow";
import type { CatalogEntry, ProposalDraft } from "./types";

const draft: ProposalDraft = {
  kind: "propuesta",
  title: "Farol",
  description: "Una app para anotar turnos.",
};
const chispa = { slug: "chispa", title: "Chispa", version: "1.2.0" } as CatalogEntry;

describe("fases del Inventor", () => {
  it("el saludo sigue ofreciendo proponer, iterar, instalar o irse", () => {
    const choices = inventorChoices({ name: "greet" }, draft, []);
    expect(choices.map((choice) => choice.id)).toEqual([
      "choice-propose",
      "choice-iterate",
      "choice-install",
      "choice-bye",
    ]);
    expect(choices[0]?.action).toEqual({
      type: "phase",
      phase: { name: "title", mode: "propuesta" },
      reset: "propuesta",
    });
    expect(choices[1]?.action).toEqual({
      type: "phase",
      phase: { name: "pick" },
      reset: "iteracion",
    });
    expect(choices[3]?.action).toEqual({ type: "close" });
  });

  it("la iteración elige un prototipo y puede volver al saludo", () => {
    const choices = inventorChoices({ name: "pick" }, { ...draft, kind: "iteracion" }, [chispa]);
    expect(choices.map((choice) => choice.id)).toEqual(["choice-proto-chispa", "choice-back"]);
    expect(choices[0]?.label).toContain("Chispa");
    expect(choices[0]?.action).toEqual({ type: "pick", slug: "chispa" });
    expect(choices[1]?.action).toEqual({ type: "phase", phase: { name: "greet" } });
  });

  it("confirmar sigue enviando igual y añade el escritorio", () => {
    const choices = inventorChoices({ name: "confirm" }, draft, []);
    expect(choices.map((choice) => [choice.id, choice.label])).toEqual([
      ["choice-confirm", "Sí, envíalo"],
      ["choice-workshop", "Vamos al escritorio"],
      ["choice-edit", "Quiero cambiarlo"],
      ["choice-cancel", "Mejor no"],
    ]);
    expect(choices[0]?.action).toEqual({ type: "send" });
    expect(choices[1]?.action).toEqual({ type: "trip", dest: "desk" });
    expect(choices[2]?.action).toEqual({ type: "phase", phase: { name: "title", mode: "propuesta" } });
  });

  it("el escritorio no envía la nota por su cuenta", () => {
    const note: ProposalDraft = {
      kind: "iteracion",
      title: "Farol",
      description: "Una app para anotar turnos.",
      slug: "chispa",
    };
    expect(inventorChoices({ name: "workshop" }, note, [])).toEqual([]);
    expect(phaseAfterWorkshopTrip("home")).toEqual({ name: "confirm" });
    expect(phaseAfterWorkshopTrip("desk")).toEqual({ name: "workshop" });
    const back = inventorChoices(phaseAfterWorkshopTrip("home"), note, [chispa]);
    expect(back[0]?.action).toEqual({ type: "send" });
    expect(back[2]?.action).toEqual({ type: "phase", phase: { name: "title", mode: "iteracion" } });
    expect(note).toEqual({
      kind: "iteracion",
      title: "Farol",
      description: "Una app para anotar turnos.",
      slug: "chispa",
    });
  });

  it("mientras se envía no hay botones nuevos", () => {
    expect(inventorChoices({ name: "sending" }, draft, [])).toEqual([]);
    expect(inventorChoices({ name: "title", mode: "propuesta" }, draft, [])).toEqual([]);
    expect(inventorChoices({ name: "body", mode: "iteracion" }, draft, [])).toEqual([]);
    expect(inventorChoices({ name: "author" }, draft, [])).toEqual([]);
  });
});
