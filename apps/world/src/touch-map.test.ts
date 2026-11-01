import { describe, expect, it } from "vitest";
import {
  TOUCH_LOOK_RATE,
  TOUCH_LOOK_RATE_Y,
  lookRatesFromStickVector,
  movementFromStickVector,
  selectionHostFromEventTarget,
  shouldBlockTextSelection,
  shouldIgnoreTouchAt,
  touchScreenSide,
} from "./touch-map";

describe("controles táctiles dinámicos", () => {
  it("parte la pantalla por la mitad para movimiento y cámara", () => {
    expect(touchScreenSide(100, 400)).toBe("left");
    expect(touchScreenSide(250, 400)).toBe("right");
    expect(touchScreenSide(200, 400)).toBe("right");
  });

  it("mapea el vector del stick a avance y lateral con zona muerta", () => {
    expect(movementFromStickVector(0, 0)).toEqual({ forward: 0, right: 0 });
    const up = movementFromStickVector(0, 1);
    expect(up.forward).toBeCloseTo(1, 4);
    expect(up.right).toBeCloseTo(0, 4);
    const down = movementFromStickVector(0, -1);
    expect(down.forward).toBeCloseTo(-1, 4);
    const right = movementFromStickVector(1, 0);
    expect(right.right).toBeCloseTo(1, 4);
  });

  it("convierte el stick de cámara en tasas de giro suavizadas", () => {
    const rates = lookRatesFromStickVector(1, 0);
    expect(rates.lookX).toBeCloseTo(TOUCH_LOOK_RATE, 5);
    expect(rates.lookY).toBeCloseTo(0, 5);
    const gentle = lookRatesFromStickVector(0.5, 0);
    expect(Math.abs(gentle.lookX)).toBeLessThan(TOUCH_LOOK_RATE * 0.5);
    expect(Math.abs(gentle.lookX)).toBeGreaterThan(0);
  });

  it("inclina más despacio que gira, y el gesto corto sigue suavizado", () => {
    expect(TOUCH_LOOK_RATE_Y).toBeLessThanOrEqual(TOUCH_LOOK_RATE * 0.5);
    const full = lookRatesFromStickVector(1, 1);
    expect(full.lookX).toBeCloseTo(TOUCH_LOOK_RATE, 5);
    expect(full.lookY).toBeCloseTo(TOUCH_LOOK_RATE_Y, 5);
    expect(Math.abs(full.lookY)).toBeLessThan(Math.abs(full.lookX) * 0.5);
    const gentle = lookRatesFromStickVector(0, 0.5);
    expect(Math.abs(gentle.lookY)).toBeGreaterThan(0);
    expect(Math.abs(gentle.lookY)).toBeLessThan(TOUCH_LOOK_RATE_Y * 0.5);
  });

  it("no selecciona el cromo al usar el joystick y deja escribir en los campos", () => {
    const button = {
      closest(selector: string) {
        return selector.includes("button") ? button : null;
      },
    };
    const field = {
      closest(selector: string) {
        return selector.includes("textarea") || selector.includes("input") ? field : null;
      },
    };
    const dialogue = {
      closest(selector: string) {
        return selector.includes("dialogue-text") ? dialogue : null;
      },
    };
    const textInButton = { parentElement: button };

    expect(shouldBlockTextSelection(button, true)).toBe(true);
    expect(shouldBlockTextSelection(button, false)).toBe(true);
    expect(shouldBlockTextSelection(selectionHostFromEventTarget(textInButton), true)).toBe(true);
    expect(shouldBlockTextSelection(field, true)).toBe(false);
    expect(shouldBlockTextSelection(field, false)).toBe(false);
    expect(shouldBlockTextSelection(dialogue, false)).toBe(false);
    expect(shouldBlockTextSelection(dialogue, true)).toBe(true);
    expect(shouldBlockTextSelection(null, true)).toBe(false);
    expect(selectionHostFromEventTarget(null)).toBeNull();
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
