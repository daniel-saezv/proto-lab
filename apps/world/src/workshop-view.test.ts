import { describe, expect, it } from "vitest";
import {
  readWorkshopResult,
  workshopDiffLine,
  workshopFailedChoices,
  workshopKindLabel,
  workshopSummaryChoices,
  workshopSummaryError,
  workshopTurnChoices,
} from "./workshop-view";

const draft = {
  kind: "propuesta" as const,
  title: "Cometa lunar",
  description: "Un juego corto en el que persigues una cometa.",
};

describe("vista del taller", () => {
  it("ofrece aceptar, rechazar o corregir, y el resumen desde el segundo turno", () => {
    expect(workshopTurnChoices({ hasChange: true, turn: 1 }).map((choice) => choice.label)).toEqual([
      "Me vale",
      "Así no",
      "Lo digo yo",
      "Volver a mi nota",
    ]);
    expect(workshopTurnChoices({ hasChange: true, turn: 2 }).map((choice) => choice.id)).toContain("choice-workshop-stop");
    expect(workshopTurnChoices({ hasChange: false, turn: 1 }).map((choice) => choice.label)).toEqual([
      "Decir",
      "Así está bien",
      "Volver a mi nota",
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

  it("no se fía de un cuerpo con campos de más", () => {
    const parsed = readWorkshopResult({
      ok: true,
      phase: "turn",
      sessionId: "abc",
      speech: "¿Y si deja estela?",
      change: null,
      draft,
      original: draft,
      turn: 1,
      maxTurns: 5,
      ready: false,
      email: "secreto@example.com",
      tools: ["github"],
    });
    expect(parsed?.ok).toBe(true);
    expect(parsed && "email" in parsed).toBe(false);
    expect(readWorkshopResult({ ok: true, phase: "turn" })).toBeNull();
    expect(readWorkshopResult({ ok: false, error: "quota", message: "Hoy no", restore: true })?.restore).toBe(true);
  });
});
