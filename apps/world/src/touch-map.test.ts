import { describe, expect, it } from "vitest";
import { lookRatesFromStickVector, movementFromStickVector, shouldIgnoreTouchAt, touchScreenSide } from "./touch-map";

describe("controles táctiles dinámicos", () => {
  it("parte la pantalla por la mitad para movimiento y cámara", () => {
    expect(touchScreenSide(100, 400)).toBe("left");
    expect(touchScreenSide(250, 400)).toBe("right");
    expect(touchScreenSide(200, 400)).toBe("right");
  });

  it("mapea el vector del stick a avance y lateral con zona muerta", () => {
    expect(movementFromStickVector(0, 0)).toEqual({ forward: 0, right: 0 });
    const up = movementFromStickVector(0, -1);
    expect(up.forward).toBeCloseTo(1, 4);
    expect(up.right).toBeCloseTo(0, 4);
    const right = movementFromStickVector(1, 0);
    expect(right.right).toBeCloseTo(1, 4);
  });

  it("convierte el stick de cámara en tasas de giro", () => {
    const rates = lookRatesFromStickVector(0.5, -0.25, 40);
    expect(rates.lookX).toBeCloseTo(20, 5);
    expect(rates.lookY).toBeCloseTo(-10, 5);
  });

  it("detecta UI interactiva bajo el toque", () => {
    const btn = {
      closest(selector: string) {
        return selector.includes("button") ? btn : null;
      },
    } as unknown as Element;
    const root = { elementFromPoint: () => btn } as unknown as Document;
    expect(shouldIgnoreTouchAt(4, 4, root)).toBe(true);
  });
});
