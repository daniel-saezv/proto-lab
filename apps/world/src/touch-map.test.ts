import { describe, expect, it } from "vitest";
import { ORBIT_SENSITIVITY_COARSE, lookRateFromDeflection } from "./locomotion";
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

  it("a fondo gira entre la tasa 6 y la tasa 15", () => {
    const yaw = lookRateFromDeflection(TOUCH_LOOK_RATE, ORBIT_SENSITIVITY_COARSE);
    const before = lookRateFromDeflection(15, ORBIT_SENSITIVITY_COARSE);
    const tight = lookRateFromDeflection(6, ORBIT_SENSITIVITY_COARSE);
    expect(TOUCH_LOOK_RATE).toBe(9.127);
    expect(yaw).toBeCloseTo(2.3, 3);
    expect(before).toBeCloseTo(3.78, 5);
    expect(tight).toBeCloseTo(1.512, 5);
    expect(yaw).toBeGreaterThan(tight);
    expect(yaw).toBeLessThan(before);
    const pitch = lookRateFromDeflection(TOUCH_LOOK_RATE_Y, ORBIT_SENSITIVITY_COARSE * 0.72);
    const pitchBefore = lookRateFromDeflection(7, ORBIT_SENSITIVITY_COARSE * 0.72);
    const pitchTight = lookRateFromDeflection(2.8, ORBIT_SENSITIVITY_COARSE * 0.72);
    expect(pitch).toBeCloseTo(0.8, 3);
    expect(pitch).toBeGreaterThan(pitchTight);
    expect(pitch).toBeLessThan(pitchBefore);
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
