import { describe, expect, it } from "vitest";
import { ORBIT_SENSITIVITY_COARSE, lookRateFromDeflection } from "./locomotion";
import {
  TOUCH_LOOK_RATE,
  TOUCH_LOOK_RATE_Y,
  activeContact,
  contactsArePinch,
  lookRatesFromStickVector,
  movementFromStickVector,
  selectionHostFromEventTarget,
  shouldBlockTextSelection,
  shouldIgnoreTouchAt,
  stickDeflection,
  stickZoneForSide,
  touchScreenSide,
  type StickContact,
} from "./touch-map";

describe("controles táctiles dinámicos", () => {
  it("parte la pantalla por la mitad para movimiento y cámara", () => {
    expect(touchScreenSide(100, 400)).toBe("left");
    expect(touchScreenSide(250, 400)).toBe("right");
    expect(touchScreenSide(200, 400)).toBe("right");
    expect(stickZoneForSide("left")).toBe("move");
    expect(stickZoneForSide("right")).toBe("look");
  });

  it("dos dedos lejanos, uno por mitad, siguen vivos a la vez", () => {
    const left: StickContact = { id: 1, zone: "move", startX: 80, startY: 500, x: 80, y: 430, };
    const right: StickContact = { id: 2, zone: "look", startX: 300, startY: 420, x: 360, y: 420 };
    const both = [left, right];
    expect(contactsArePinch(both)).toBe(false);
    expect(activeContact(both, "move")?.id).toBe(1);
    expect(activeContact(both, "look")?.id).toBe(2);
    expect(stickDeflection(left).y).toBeGreaterThan(0.9);
    expect(stickDeflection(right).x).toBeGreaterThan(0.9);
    expect(stickDeflection(left).x).toBe(0);
  });

  it("dos dedos juntos son un pellizco y no mandan en ningún stick", () => {
    const a: StickContact = { id: 3, zone: "look", startX: 220, startY: 400, x: 180, y: 360 };
    const b: StickContact = { id: 4, zone: "look", startX: 260, startY: 430, x: 320, y: 470 };
    expect(contactsArePinch([a, b])).toBe(true);
    expect(activeContact([a, b], "move")).toBeNull();
    expect(activeContact([a, b], "look")).toBeNull();
    const close: StickContact = { id: 5, zone: "move", startX: 200, startY: 400, x: 160, y: 400 };
    const near: StickContact = { id: 6, zone: "look", startX: 250, startY: 400, x: 300, y: 400 };
    expect(contactsArePinch([close, near])).toBe(true);
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
