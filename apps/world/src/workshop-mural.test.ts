import { describe, expect, it } from "vitest";
import { WORKSHOP_MURAL_LINES, paintWorkshopMural } from "./workshop-mural";

describe("telón del escritorio", () => {
  it("deja los huevos en la textura y no habla de juegos", () => {
    const painted: string[] = [];
    const ctx = new Proxy(
      {},
      {
        get(_target, prop) {
          if (prop === "fillText") {
            return (text: unknown) => painted.push(String(text));
          }
          return () => undefined;
        },
        set() {
          return true;
        },
      },
    ) as CanvasRenderingContext2D;
    paintWorkshopMural(ctx, 768, 384);
    const blob = painted.join("\n");
    for (const line of WORKSHOP_MURAL_LINES) {
      expect(blob).toContain(line);
      expect(line).not.toMatch(/juego/i);
    }
  });
});
