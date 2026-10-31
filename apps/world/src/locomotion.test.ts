import { describe, expect, it } from "vitest";
import { approachVelocity, dampAngle, dampBlockedAxis, shapeStick } from "./locomotion";

describe("controles del lobby", () => {
  it("anula el joystick dentro de la zona muerta y suaviza el medio", () => {
    expect(shapeStick(0, 0)).toEqual({ x: 0, y: 0 });
    expect(shapeStick(0.1, -0.08)).toEqual({ x: 0, y: 0 });
    const edge = shapeStick(1, 0);
    expect(edge.x).toBeCloseTo(1, 5);
    expect(edge.y).toBeCloseTo(0, 5);
    const mid = shapeStick(0.5, 0);
    expect(mid.x).toBeGreaterThan(0);
    expect(mid.x).toBeLessThan(0.5);
  });

  it("acelera al andar y frena más deprisa al soltar", () => {
    expect(approachVelocity(0, 4.2, 0.1)).toBeCloseTo(1.8, 5);
    expect(approachVelocity(4.2, 0, 0.1)).toBeCloseTo(1.6, 5);
    expect(approachVelocity(4, 4.2, 1)).toBeCloseTo(4.2, 5);
  });

  it("suelta la velocidad cuando el muro se come el paso", () => {
    expect(dampBlockedAxis(4, 0.02, 1 / 60)).toBeCloseTo(1, 5);
    expect(dampBlockedAxis(4, 4 / 60, 1 / 60)).toBeCloseTo(4, 5);
  });

  it("gira hacia el rumbo por el camino corto, sin dar la vuelta larga", () => {
    const next = dampAngle(0.1, Math.PI * 2 - 0.1, 1 / 60, 8);
    expect(next).toBeLessThan(0.1);
    expect(next).toBeGreaterThan(-0.3);
  });
});
