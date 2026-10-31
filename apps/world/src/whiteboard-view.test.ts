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