import { describe, expect, it } from "vitest";
import {
  BOARD_SLATE,
  boardChalkDust,
  chalkFlaskMark,
  loadingSkeletonProgress,
  paintWhiteboardFrame,
  quadSeg,
  revealComplete,
  revealRowProgress,
  seg,
  skeletonGrandTotalLength,
  titleChalkSwash,
  type ChalkSegment,
} from "./proposals-board-chalk";
import { WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH } from "./proposals-board-metrics";
import { paintWhiteboard } from "./proposals-board-paint";

describe("proposals-board-chalk", () => {
  it("el esqueleto tiene longitud total", () => {
    expect(skeletonGrandTotalLength()).toBeGreaterThan(100);
  });

  it("la carga progresa en bucle", () => {
    const a = loadingSkeletonProgress(0, false);
    const b = loadingSkeletonProgress(550, false);
    expect(a).toBeGreaterThan(0);
    expect(b).toBeGreaterThan(a);
    expect(loadingSkeletonProgress(0, true)).toBe(1);
  });

  it("una cuadrática se separa de su cuerda", () => {
    const curve = quadSeg(0, 0, 0, 24, 40, 0);
    const chord = seg(0, 0, 40, 0);
    expect(curve.len).toBeGreaterThan(chord.len + 8);
    const midY = 0.25 * curve.y1 + 0.5 * (curve.qy ?? 0) + 0.25 * curve.y2;
    expect(midY).toBeGreaterThan(8);
    expect(curve.qx).toBe(0);
    expect(curve.qy).toBe(24);
  });

  it("la pizarra no cierra un marco y el polvo queda en los márgenes", () => {
    const { context, calls, fillStyle } = recordingContext();
    paintWhiteboardFrame(context);
    const slate = calls.find(
      (call) => call.op === "fillRect" && call.args[2] === WHITEBOARD_WIDTH && call.args[3] === WHITEBOARD_HEIGHT,
    );
    expect(slate?.fillStyle).toBe(BOARD_SLATE);
    expect(fillStyle()).toBe(BOARD_SLATE);
    expect(calls.filter((call) => call.op === "strokeRect")).toHaveLength(0);

    const dust = [...boardChalkDust(), ...chalkFlaskMark()];
    expect(dust.length).toBeGreaterThan(0);
    expect(dust.length).toBeLessThanOrEqual(24);
    for (const part of dust) {
      expect(part.len).toBeLessThan(80);
      const band = segmentBand(part);
      expect(band === "header" || band === "footer").toBe(true);
    }
    expect(dust.some((part) => segmentBand(part) === "header")).toBe(true);
    expect(dust.some((part) => segmentBand(part) === "footer")).toBe(true);
  });

  it("el subrayado de Tablón es un gesto corto bajo el título", () => {
    const swash = titleChalkSwash();
    expect(swash).toHaveLength(1);
    const part = swash[0]!;
    expect(part.qx).toBeTypeOf("number");
    expect(part.len).toBeGreaterThan(40);
    expect(part.len).toBeLessThan(160);
    expect(part.x1).toBeGreaterThanOrEqual(28);
    expect(part.x2).toBeLessThan(180);
    const ys = [part.y1, part.y2, part.qy ?? part.y1];
    expect(Math.min(...ys)).toBeGreaterThan(46);
    expect(Math.max(...ys)).toBeLessThan(72);
  });

  it("el carril se pinta con círculos y sin marco", () => {
    const { context, calls } = recordingContext();
    paintWhiteboard(context, {
      rows: [{ number: 1, title: "Uno", phase: "recibida", highlight: 0 }],
      overflow: 0,
      partial: false,
      pulseT: 0.2,
      reducedMotion: true,
    });
    expect(calls.filter((call) => call.op === "arc").length).toBeGreaterThan(0);
    expect(calls.filter((call) => call.op === "rotate")).toHaveLength(0);
    expect(calls.filter((call) => call.op === "strokeRect")).toHaveLength(0);
  });

  it("revela filas escalonadas en ~780 ms", () => {
    const start = 1000;
    expect(revealRowProgress(start, start + 20, 0, 2)).toBeLessThan(0.05);
    expect(revealRowProgress(start, start + 200, 0, 2)).toBeGreaterThan(0.2);
    expect(revealRowProgress(start, start + 900, 1, 2)).toBe(1);
    expect(revealComplete(start, start + 820, 2)).toBe(true);
  });
});

function segmentYs(part: ChalkSegment): number[] {
  return [part.y1, part.y2, ...(part.qy == null ? [] : [part.qy])];
}

function segmentBand(part: ChalkSegment): "header" | "footer" | "row" {
  const ys = segmentYs(part);
  if (ys.every((y) => y < 40)) return "header";
  if (ys.every((y) => y >= 508)) return "footer";
  return "row";
}

function recordingContext() {
  const calls: { op: string; args: unknown[]; fillStyle: unknown }[] = [];
  const state: Record<string, unknown> = { fillStyle: "", globalAlpha: 1 };
  const context = new Proxy(state, {
    get(target, prop) {
      if (prop === "measureText") {
        return (text: string) => ({ width: String(text).length * 14 });
      }
      if (typeof prop !== "string") return undefined;
      if (prop in target && typeof target[prop] !== "function") return target[prop];
      return (...args: unknown[]) => {
        calls.push({ op: prop, args, fillStyle: target.fillStyle });
      };
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    },
  });
  return {
    context: context as unknown as CanvasRenderingContext2D,
    calls,
    fillStyle: () => state.fillStyle,
  };
}
