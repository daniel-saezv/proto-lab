import { describe, expect, it } from "vitest";
import {
  FOLLOW_DISTANCE_DESKTOP,
  FOLLOW_DISTANCE_MIN,
  FOLLOW_DISTANCE_PORTRAIT,
  FOLLOW_DISTANCE_PORTRAIT_BEFORE,
  captureFollowRig,
  clampFollowDistance,
  followDistanceAfterPinch,
  followDistanceAfterWheel,
  maxFollowDistance,
  pinchScale,
  rigForReturn,
} from "./camera-rig";

describe("límites de la cámara de seguimiento", () => {
  it("en retrato el alejamiento máximo es menor que el 6,4 anterior", () => {
    expect(FOLLOW_DISTANCE_PORTRAIT_BEFORE).toBe(6.4);
    expect(maxFollowDistance(0.46)).toBe(FOLLOW_DISTANCE_PORTRAIT);
    expect(FOLLOW_DISTANCE_PORTRAIT).toBe(4.2);
    expect(FOLLOW_DISTANCE_PORTRAIT).toBeLessThan(FOLLOW_DISTANCE_PORTRAIT_BEFORE);
    expect(maxFollowDistance(1.6)).toBe(FOLLOW_DISTANCE_DESKTOP);
    expect(FOLLOW_DISTANCE_DESKTOP).toBe(3.8);
  });

  it("la rueda y el pellizco no salen del intervalo", () => {
    const portrait = 0.46;
    expect(followDistanceAfterWheel(4.2, 800, portrait)).toBe(FOLLOW_DISTANCE_PORTRAIT);
    expect(followDistanceAfterWheel(4.2, -800, portrait)).toBeLessThan(4.2);
    expect(followDistanceAfterWheel(2, -5000, portrait)).toBe(FOLLOW_DISTANCE_MIN);
    expect(followDistanceAfterPinch(4.2, 2, portrait)).toBeCloseTo(2.1, 5);
    expect(followDistanceAfterPinch(2, 0.2, portrait)).toBe(FOLLOW_DISTANCE_PORTRAIT);
    expect(followDistanceAfterPinch(2, 4, portrait)).toBe(FOLLOW_DISTANCE_MIN);
    expect(clampFollowDistance(Number.NaN, portrait)).toBe(FOLLOW_DISTANCE_PORTRAIT);
    expect(pinchScale(0, 10)).toBeNull();
    expect(pinchScale(40, 80)).toBe(2);
  });
});

describe("guardar y devolver el encuadre", () => {
  it("devuelve la distancia y la órbita guardadas, no el alejamiento máximo", () => {
    const saved = captureFollowRig(0.42, -0.18, 2.4);
    const back = rigForReturn(saved, { yaw: 1, pitch: 0.2, distance: FOLLOW_DISTANCE_PORTRAIT }, 0.46);
    expect(back).toEqual({ yaw: 0.42, pitch: -0.18, distance: 2.4 });
    expect(back.distance).toBeLessThan(maxFollowDistance(0.46));
  });

  it("sin plano guardado usa el encuadre actual y recorta al tope", () => {
    const back = rigForReturn(null, { yaw: -0.3, pitch: 0.1, distance: 9 }, 1.4);
    expect(back).toEqual({ yaw: -0.3, pitch: 0.1, distance: FOLLOW_DISTANCE_DESKTOP });
    const tight = rigForReturn(captureFollowRig(0, 0, 0.2), { yaw: 0, pitch: 0, distance: 3 }, 0.5);
    expect(tight.distance).toBe(FOLLOW_DISTANCE_MIN);
  });
});
