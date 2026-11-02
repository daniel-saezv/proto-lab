import { afterEach, describe, expect, it } from "vitest";
import {
  BOARD_SLATE,
  DOODLE_DRAW_MS,
  beginBoardDoodleDraw,
  boardDoodleIds,
  boardDoodleProgress,
  doodleSegments,
  loadingSkeletonProgress,
  noteBoardDoodleTime,
  paintCueChalk,
  paintWhiteboardFrame,
  quadSeg,
  revealComplete,
  revealRowProgress,
  rerollBoardDoodles,
  seg,
  settleBoardDoodles,
  skeletonGrandTotalLength,
  titleChalkSwash,
  type BoardDoodleId,
  type ChalkSegment,
} from "./proposals-board-chalk";
import { WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH } from "./proposals-board-metrics";
import { paintWhiteboard } from "./proposals-board-paint";

describe("proposals-board-chalk", () => {
  afterEach(() => {
    settleBoardDoodles();
  });

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

  it("los dibujos son cosas concretas y no invaden el contenido", () => {
    const { context, calls, fillStyle } = recordingContext();
    const ids: BoardDoodleId[] = ["gatito", "perrito", "pajaro", "caracol", "avion", "pez", "barco"];
    for (const id of ids) {
      const parts = doodleSegments(id);
      expect(parts.length).toBeGreaterThan(4);
      expect(parts.length).toBeLessThanOrEqual(22);
      expect(parts.filter((part) => part.qx != null).length).toBeGreaterThanOrEqual(3);
      for (const part of parts) {
        expect(part.len).toBeLessThan(180);
        const band = doodleBand(id);
        expect(segmentBand(part)).toBe(band);
        for (const point of segmentPoints(part)) {
          if (band === "header") {
            expect(point.x).toBeGreaterThan(700);
            expect(point.x).toBeLessThan(920);
          } else {
            expect(point.x).toBeGreaterThan(16);
            expect(point.x).toBeLessThan(260);
          }
        }
      }
    }
    rerollBoardDoodles(() => 0);
    expect(boardDoodleIds()).toEqual(["gatito", "avion"]);
    paintWhiteboardFrame(context);
    const slate = calls.find(
      (call) => call.op === "fillRect" && call.args[2] === WHITEBOARD_WIDTH && call.args[3] === WHITEBOARD_HEIGHT,
    );
    expect(slate?.fillStyle).toBe(BOARD_SLATE);
    expect(fillStyle()).toBe(BOARD_SLATE);
    expect(calls.filter((call) => call.op === "strokeRect")).toHaveLength(0);
    expect(calls.filter((call) => call.op === "quadraticCurveTo" || call.op === "lineTo").length).toBeGreaterThan(8);
  });

  it("al abrir, la pareja se traza y al salir queda terminada", () => {
    rerollBoardDoodles(() => 0.99);
    expect(boardDoodleIds()).toEqual(["caracol", "barco"]);
    beginBoardDoodleDraw(1_000, true);
    expect(boardDoodleProgress()).toBe(1);
    beginBoardDoodleDraw(1_000, false);
    expect(boardDoodleProgress()).toBe(0);
    expect(noteBoardDoodleTime(1_000 + DOODLE_DRAW_MS / 2)).toBeGreaterThan(0.2);
    expect(boardDoodleProgress()).toBeLessThan(1);
    expect(noteBoardDoodleTime(1_000 + DOODLE_DRAW_MS)).toBe(1);
    expect(boardDoodleIds()).toEqual(["caracol", "barco"]);
    beginBoardDoodleDraw(4_000, false);
    noteBoardDoodleTime(4_200);
    settleBoardDoodles();
    expect(boardDoodleProgress()).toBe(1);
    expect(boardDoodleIds()).toEqual(["caracol", "barco"]);
  });

  it("el trazo de un clic gana cuerpo de tiza sin adelantar el avance", () => {
    const seen = cueRecorder();
    const parts = [seg(10, 10, 40, 10), seg(40, 10, 40, 28)];
    paintCueChalk(seen.context, parts, 0, "#ffb703", 3);
    expect(seen.strokes).toBe(0);
    paintCueChalk(seen.context, parts, 1, "#ffb703", 3);
    expect(seen.strokes).toBeGreaterThan(1);
    expect(Math.max(...seen.widths)).toBeGreaterThan(3);
    expect(Math.max(...seen.widths)).toBeLessThan(3.6);
    expect(seen.dashes.some((dash) => dash.length > 0)).toBe(true);
    expect(seen.dashes.at(-1)).toEqual([]);
    expect(parts[0]?.x1).toBe(10);
    expect(parts[1]?.y2).toBe(28);
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

function segmentPoints(part: ChalkSegment): { x: number; y: number }[] {
  const points = [
    { x: part.x1, y: part.y1 },
    { x: part.x2, y: part.y2 },
  ];
  if (part.qx != null && part.qy != null) points.push({ x: part.qx, y: part.qy });
  return points;
}

function segmentYs(part: ChalkSegment): number[] {
  return segmentPoints(part).map((point) => point.y);
}

function doodleBand(id: BoardDoodleId): "header" | "footer" {
  return id === "avion" || id === "pez" || id === "barco" ? "footer" : "header";
}

function segmentBand(part: ChalkSegment): "header" | "footer" | "row" {
  const ys = segmentYs(part);
  if (ys.every((y) => y >= 4 && y <= 68)) return "header";
  if (ys.every((y) => y >= 512 && y <= 536)) return "footer";
  return "row";
}

function cueRecorder() {
  const widths: number[] = [];
  const dashes: number[][] = [];
  let strokes = 0;
  let dash: number[] = [];
  const state: Record<string, unknown> = { globalAlpha: 1, lineWidth: 1, shadowBlur: 0, shadowColor: "#000" };
  const context = new Proxy(state, {
    get(target, prop) {
      if (prop === "setLineDash") {
        return (next: number[]) => {
          dash = [...next];
          dashes.push(dash);
        };
      }
      if (typeof prop !== "string") return undefined;
      if (prop in target && typeof target[prop] !== "function") return target[prop];
      return () => {
        if (prop === "stroke") {
          strokes += 1;
          widths.push(Number(target.lineWidth));
        }
      };
    },
    set(target, prop, value) {
      target[prop as string] = value;
      return true;
    },
  });
  return {
    context: context as unknown as CanvasRenderingContext2D,
    get strokes() {
      return strokes;
    },
    widths,
    dashes,
  };
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
