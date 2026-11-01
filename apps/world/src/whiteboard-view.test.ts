import { describe, expect, it } from "vitest";
import {
  WHITEBOARD_FRAME,
  WHITEBOARD_VIEW_SECONDS,
  smoothstep01,
  whiteboardCameraPose,
  whiteboardHalfAngles,
  whiteboardTransitionSeconds,
} from "./whiteboard-view";

describe("encuadre de la pizarra", () => {
  it("el plano del tablón llena el hueco interior del marco", () => {
    const rail = 0.12;
    const innerLeft = -6.28 + rail / 2;
    const innerRight = -2.92 - rail / 2;
    const innerBottom = 0.64 + rail / 2;
    const innerTop = 2.48 - rail / 2;
    expect(WHITEBOARD_FRAME.x - WHITEBOARD_FRAME.width / 2).toBeCloseTo(innerLeft, 5);
    expect(WHITEBOARD_FRAME.x + WHITEBOARD_FRAME.width / 2).toBeCloseTo(innerRight, 5);
    expect(WHITEBOARD_FRAME.y - WHITEBOARD_FRAME.height / 2).toBeCloseTo(innerBottom, 5);
    expect(WHITEBOARD_FRAME.y + WHITEBOARD_FRAME.height / 2).toBeCloseTo(innerTop, 5);
  });

  it("cabe en horizontal y en vertical, más lejos si la pantalla es estrecha", () => {
    const desktop = whiteboardCameraPose(1280 / 800, 58);
    const portrait = whiteboardCameraPose(390 / 844, 78);
    for (const [pose, fov, aspect] of [
      [desktop, 58, 1280 / 800],
      [portrait, 78, 390 / 844],
    ] as const) {
      const half = whiteboardHalfAngles(pose);
      const vFov = ((fov * Math.PI) / 180) / 2;
      const hFov = Math.atan(Math.tan(vFov) * aspect);
      expect(half.vertical).toBeLessThanOrEqual(vFov + 1e-6);
      expect(half.horizontal).toBeLessThanOrEqual(hFov + 1e-6);
      expect(pose.z).toBeGreaterThan(WHITEBOARD_FRAME.z);
      expect(pose.y).toBe(WHITEBOARD_FRAME.y);
      expect(pose.x).toBe(WHITEBOARD_FRAME.x);
      expect(pose.lookZ).toBe(WHITEBOARD_FRAME.z);
    }
    expect(portrait.distance).toBeGreaterThan(desktop.distance);
    expect(portrait.z).toBeLessThan(4);
  });

  it("la transición dura entre 600 y 900 ms y se corta si hay menos movimiento", () => {
    expect(WHITEBOARD_VIEW_SECONDS).toBeGreaterThanOrEqual(0.6);
    expect(WHITEBOARD_VIEW_SECONDS).toBeLessThanOrEqual(0.9);
    expect(whiteboardTransitionSeconds(false)).toBe(WHITEBOARD_VIEW_SECONDS);
    expect(whiteboardTransitionSeconds(true)).toBe(0);
    expect(smoothstep01(0)).toBe(0);
    expect(smoothstep01(1)).toBe(1);
    expect(smoothstep01(0.5)).toBeGreaterThan(0.4);
    expect(smoothstep01(0.5)).toBeLessThan(0.6);
  });
});