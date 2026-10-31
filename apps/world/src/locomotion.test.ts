import { describe, expect, it } from "vitest";
import {
  TOUCH_LOOK_FOLLOW,
  approachVelocity,
  dampAngle,
  dampBlockedAxis,
  lookRateFromDeflection,
  shapeStick,
  smoothLookInput,
  softenTowardLimit,
} from "./locomotion";

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

  it("integra la mirada táctil igual a 60 Hz que a 120 Hz y frena al soltar", () => {
    const target = lookRateFromDeflection(15, 0.0042);
    const step = (dt: number, frames: number, goal: number) => {
      let rate = 0;
      let angle = 0;
      for (let i = 0; i < frames; i++) {
        rate = smoothLookInput(rate, goal, dt, TOUCH_LOOK_FOLLOW);
        angle += rate * dt;
      }
      return angle;
    };
    const at60 = step(1 / 60, 60, target);
    const at120 = step(1 / 120, 120, target);
    expect(Math.abs(at120 - at60) / at60).toBeLessThan(0.01);
    const released = smoothLookInput(target, 0, 0.2, TOUCH_LOOK_FOLLOW);
    expect(released).toBeLessThan(target);
    expect(released).toBeGreaterThan(0);
  });

  it("afloja el pitch antes de chocar con el tope", () => {
    expect(softenTowardLimit(0, 1, -0.35, 0.7, 0.16)).toBe(1);
    expect(softenTowardLimit(0.62, 1, -0.35, 0.7, 0.16)).toBeLessThan(1);
    expect(softenTowardLimit(0.62, 1, -0.35, 0.7, 0.16)).toBeGreaterThan(0);
    expect(softenTowardLimit(0.7, 1, -0.35, 0.7, 0.16)).toBe(0);
    expect(softenTowardLimit(-0.28, -1, -0.35, 0.7, 0.16)).toBeGreaterThan(-1);
    expect(softenTowardLimit(-0.28, -1, -0.35, 0.7, 0.16)).toBeLessThan(0);

    let pitch = 0.5;
    const rate = lookRateFromDeflection(7, 0.0042 * 0.72);
    let slowed = false;
    let previous = rate;
    for (let i = 0; i < 180; i++) {
      const step = softenTowardLimit(pitch, rate, -0.35, 0.7, 0.16);
      if (pitch > 0.54 && step < previous) slowed = true;
      previous = step;
      pitch += step / 60;
      expect(pitch).toBeLessThanOrEqual(0.7);
    }
    expect(slowed).toBe(true);
    expect(pitch).toBeCloseTo(0.7, 2);
  });

  it("gira hacia el rumbo por el camino corto, sin dar la vuelta larga", () => {
    const next = dampAngle(0.1, Math.PI * 2 - 0.1, 1 / 60, 8);
    expect(next).toBeLessThan(0.1);
    expect(next).toBeGreaterThan(-0.3);
  });
});
