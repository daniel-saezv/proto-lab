import { describe, expect, it } from "vitest";
import {
  readWorkshopResult,
  rememberWorkshopPick,
  workshopDiffLine,
  workshopFailedChoices,
  workshopIntroChoices,
  workshopKindLabel,
  workshopPickChoices,
  workshopSummaryChoices,
  workshopSummaryError,
  workshopTrailBefore,
  workshopTrailLine,
} from "./workshop-view";

const draft = {
  kind: "propuesta" as const,
  title: "Cometa lunar",
  description: "Un juego corto en el que persigues una cometa.",
};

const options = [
  "¿Y si dejara un rastro de luz?",
  "¿Y si se pudiera guardar el camino?",
  "¿Y si avisara al llegar al borde?",
  "¿Y si el color cambiara con la altura?",
];

describe("vista del taller", () => {
  it("la explicación espera a Empezar y el rastro guarda lo elegido", () => {
    expect(workshopIntroChoices().map((choice) => choice.label)).toEqual(["Empezar", "Volver a mi nota"]);
    expect(workshopTrailLine([])).toBe("Ninguna");
    expect(workshopTrailLine(["  ¿Y si dejara un rastro?  "])).toBe("¿Y si dejara un rastro?");
    const trail = rememberWorkshopPick([], 1, ["¿Y si dejara un rastro?"]);
    const both = rememberWorkshopPick(trail, 2, []);
    expect(workshopTrailBefore(both, 2).map((mark) => mark.round)).toEqual([1]);
    expect(workshopTrailBefore(both, 3)).toHaveLength(2);
    expect(workshopTrailLine(both[1]?.ideas ?? [])).toBe("Ninguna");
    expect(rememberWorkshopPick(both, 1, ["otra"])[0]?.ideas).toEqual(["otra"]);
  });

  it("deja marcar ideas y cerrar la ronda, o enviar el resumen", () => {
    expect(workshopPickChoices().map((choice) => choice.label)).toEqual([
      "Seguir",
      "Así está bien",
      "Volver a mi nota",
    ]);
    expect(workshopPickChoices().filter((choice) => choice.quiet).map((choice) => choice.id)).toEqual([
      "choice-workshop-stop",
      "choice-workshop-back",
    ]);
    expect(workshopFailedChoices().map((choice) => choice.id)).toEqual(["choice-workshop-retry", "choice-workshop-back"]);
    expect(workshopSummaryChoices().map((choice) => choice.label)).toEqual(["Envíalo así", "Vuelve a mi nota"]);
  });

  it("marca el diff y deja el tipo solo de lectura", () => {
    expect(workshopDiffLine(draft, draft)).toBe("El título sigue igual. El texto sigue igual.");
    expect(workshopDiffLine(draft, { ...draft, title: "Cometa con estela" })).toContain("El título ha cambiado.");
    expect(workshopKindLabel(draft)).toBe("Propuesta nueva");
    expect(workshopKindLabel({ kind: "iteracion", slug: "chispa" })).toBe("Iteración de chispa");
    expect(workshopSummaryError("ab", draft.description)).toContain("título");
    expect(workshopSummaryError(draft.title, "corto")).toContain("texto");
    expect(workshopSummaryError(draft.title, draft.description)).toBeNull();
  });

  it("exige cuatro ideas en la ronda y no se queda campos de más", () => {
    const parsed = readWorkshopResult({
      ok: true,
      phase: "pick",
      sessionId: "abc",
      speech: "Ronda 1 de 3. Marca las ideas que quieres.",
      options,
      draft,
      original: draft,
      round: 1,
      maxRounds: 3,
      email: "secreto@example.com",
      tools: ["github"],
    });
    expect(parsed?.ok).toBe(true);
    if (parsed?.ok) expect(parsed.options).toEqual(options);
    expect(parsed && "email" in parsed).toBe(false);
    expect(readWorkshopResult({ ok: true, phase: "pick", speech: "hola", options: options.slice(0, 3) })).toBeNull();
    expect(readWorkshopResult({ ok: true, phase: "turn" })).toBeNull();
    expect(readWorkshopResult({ ok: false, error: "quota", message: "Hoy no", restore: true })?.restore).toBe(true);
  });
});
