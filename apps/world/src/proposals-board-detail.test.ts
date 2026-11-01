import { describe, expect, it } from "vitest";
import type { ChalkSegment } from "./proposals-board-chalk";
import { computeRowLayouts, WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH } from "./proposals-board-metrics";
import {
  actionLabelOrigin,
  chalkMarkProgress,
  combineActionMark,
  detailActionCue,
  detailActionRect,
  detailBackCue,
  detailBackRect,
  detailFits,
  detailRegionsDisjoint,
  hitBoard,
  MARK_DRAW_MS,
  measureGlyphBox,
  rowChalkCue,
  rowHitRect,
  strokeIsOpen,
  type GlyphBox,
} from "./proposals-board-detail";

function bounds(segments: readonly ChalkSegment[]) {
  return pointBounds(segments.flatMap((part) => [{ x: part.x1, y: part.y1 }, { x: part.x2, y: part.y2 }]));
}

function pointBounds(points: readonly { x: number; y: number }[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const point of points) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

describe("zonas de la pizarra", () => {
  it("el detalle cabe en la pizarra y la acción es grande", () => {
    const back = detailBackRect();
    const action = detailActionRect();
    expect(detailFits(back)).toBe(true);
    expect(detailFits(action)).toBe(true);
    expect(detailRegionsDisjoint()).toBe(true);
    expect(back.h).toBeGreaterThanOrEqual(96);
    expect(action.h).toBeGreaterThanOrEqual(120);
    expect(action.w).toBeGreaterThan(WHITEBOARD_WIDTH * 0.7);
    expect(action.y + action.h).toBeLessThanOrEqual(WHITEBOARD_HEIGHT);
  });

  it("cada fila es su zona y el detalle distingue vuelta y acción", () => {
    const layouts = computeRowLayouts(3);
    layouts.forEach((layout, index) => {
      layout.number = index + 1;
    });
    const first = rowHitRect(layouts[0]!);
    expect(first.h).toBe(layouts[0]!.height);
    expect(hitBoard(first.x + 4, first.y + 4, "list", layouts, false)).toEqual({ zone: "row", number: 1 });
    expect(hitBoard(8, 8, "list", layouts, false)).toBeNull();
    const back = detailBackRect();
    const action = detailActionRect();
    expect(hitBoard(back.x + 8, back.y + 8, "detail", layouts, true)).toEqual({ zone: "back" });
    expect(hitBoard(action.x + 8, action.y + 8, "detail", layouts, true)).toEqual({ zone: "action" });
    expect(hitBoard(action.x + 8, action.y + 8, "detail", layouts, false)).toBeNull();
    expect(hitBoard(WHITEBOARD_WIDTH / 2, (back.y + back.h + action.y) / 2, "detail", layouts, true)).toBeNull();
  });

  it("el acento es un círculo de tiza irregular, no un rectángulo y no una caja", () => {
    expect(chalkMarkProgress(0, true)).toBe(1);
    expect(chalkMarkProgress(0, false)).toBe(0);
    expect(chalkMarkProgress(MARK_DRAW_MS / 2, false)).toBeGreaterThan(0);
    expect(chalkMarkProgress(MARK_DRAW_MS / 2, false)).toBeLessThan(1);
    expect(chalkMarkProgress(MARK_DRAW_MS, false)).toBe(1);

    const layout = computeRowLayouts(1)[0]!;
    layout.number = 7;
    const row = rowHitRect(layout);
    const rowInk = { x: 28, y: layout.y + 16, width: 180, height: 22 };
    const cue = rowChalkCue(layout, rowInk);
    expect(strokeIsOpen(cue.chevron)).toBe(true);
    expectIrregularChalkCircle(cue.ring, row);
    expect(ringClearance(cue.ring, rowInk)).toBeGreaterThanOrEqual(1.2);
    const mark = bounds(cue.chevron);
    expect(mark.x).toBeGreaterThanOrEqual(row.x);
    expect(mark.y).toBeGreaterThanOrEqual(row.y);
    expect(mark.x + mark.w).toBeLessThanOrEqual(row.x + row.w);
    const again = rowChalkCue(layout, rowInk).ring;
    expect(again).toEqual(cue.ring);
    const other = computeRowLayouts(2)[1]!;
    other.number = 8;
    const otherInk = { x: 28, y: other.y + 16, width: 180, height: 22 };
    expect(rowChalkCue(other, otherInk).ring).not.toEqual(cue.ring);
    const ringBounds = pointBounds(samplesOf(cue.ring));
    expect(ringBounds.y + ringBounds.h / 2).toBeLessThan(layout.trackY);
    expect(ringBounds.y + ringBounds.h).toBeLessThanOrEqual(layout.y + layout.height - 4);

    const back = detailBackRect();
    const backInk = { x: back.x + 36, y: back.y + back.h / 2 - 14, width: 150, height: 28 };
    const backRing = detailBackCue(backInk);
    expectIrregularChalkCircle(backRing, back);
    expect(ringClearance(backRing, backInk)).toBeGreaterThanOrEqual(1.2);
    const backLine = pointBounds(samplesOf(backRing));
    expect(backLine.w).toBeLessThan(back.w * 0.55);
    expect(backLine.h).toBeGreaterThan(24);
    expect(backLine.h).toBeLessThan(back.h * 0.6);

    const action = detailActionRect();
    const actionInk = actionInkBox(220, 30);
    const actionCue = detailActionCue(actionInk, 220);
    expect(strokeIsOpen(actionCue.chevron)).toBe(true);
    expectIrregularChalkCircle(actionCue.ring, action);
    expect(ringClearance(actionCue.ring, actionInk)).toBeGreaterThanOrEqual(1.2);
    const actionLine = pointBounds(samplesOf(actionCue.ring));
    expect(actionLine.w).toBeLessThan(action.w * 0.55);
    expect(actionLine.h).toBeGreaterThan(24);
    expect(actionLine.h).toBeLessThan(action.h * 0.55);
    expect(actionCue.ring).not.toEqual(backRing);
  });

  it("el círculo sale del ancho y del alto medidos y no cruza la tinta", () => {
    const sizes = [
      { x: 30, y: 40, width: 70, height: 16 },
      { x: 48, y: 90, width: 180, height: 22 },
      { x: 60, y: 150, width: 150, height: 28 },
      { x: 80, y: 220, width: 280, height: 34 },
      { x: 36, y: 300, width: 460, height: 18 },
    ];
    for (const ink of sizes) {
      const ring = detailBackCue(ink);
      const gap = ringClearance(ring, ink);
      expect(gap).toBeGreaterThanOrEqual(1.2);
      expect(gap).toBeLessThan(14);
    }
    const narrow = pointBounds(samplesOf(detailBackCue({ x: 40, y: 40, width: 90, height: 30 })));
    const wide = pointBounds(samplesOf(detailBackCue({ x: 40, y: 40, width: 240, height: 30 })));
    const short = pointBounds(samplesOf(detailBackCue({ x: 40, y: 40, width: 180, height: 16 })));
    const tall = pointBounds(samplesOf(detailBackCue({ x: 40, y: 40, width: 180, height: 42 })));
    expect(wide.w).toBeGreaterThan(narrow.w + 100);
    expect(tall.h).toBeGreaterThan(short.h + 18);
  });

  it("mide la caja real del texto y, si falta, estima con el cuerpo", () => {
    const context = {
      font: "700 26px sans-serif",
      measureText: () => ({
        width: 100,
        actualBoundingBoxLeft: 2,
        actualBoundingBoxRight: 96,
        actualBoundingBoxAscent: 19,
        actualBoundingBoxDescent: 5,
      }),
    } as unknown as CanvasRenderingContext2D;
    expect(measureGlyphBox(context, "Hola", 28, 100, "alphabetic")).toEqual({
      x: 26,
      y: 81,
      width: 98,
      height: 24,
    });
    const missing = {
      font: "700 32px sans-serif",
      measureText: () => ({ width: 80 }),
    } as unknown as CanvasRenderingContext2D;
    const estimated = measureGlyphBox(missing, "Tablón", 40, 80, "middle");
    expect(estimated.x).toBe(40);
    expect(estimated.width).toBe(80);
    expect(estimated.height).toBe(32);
    expect(estimated.y).toBe(80 - 16);
  });

  it("el círculo de la acción se traza al mostrarse y no aparece ya empezado", () => {
    expect(combineActionMark(null, null)).toBeNull();
    expect(combineActionMark(0, null)).toBeNull();
    const mid = combineActionMark(chalkMarkProgress(MARK_DRAW_MS / 2, false), null);
    expect(mid?.hot).toBe(false);
    expect(mid?.progress).toBeGreaterThan(0.02);
    expect(mid?.progress).toBeLessThan(1);
    expect(combineActionMark(1, null)).toEqual({ progress: 1, hot: false });
    expect(combineActionMark(1, 0.1)?.progress).toBe(1);
    expect(combineActionMark(1, 0.1)?.hot).toBe(true);
    expect(combineActionMark(chalkMarkProgress(0, true), null)).toEqual({ progress: 1, hot: false });
  });
});

function actionInkBox(width: number, height: number): GlyphBox {
  const origin = actionLabelOrigin(width);
  return { x: origin.textX, y: origin.midY - height / 2, width, height };
}

function curveSamples(segments: readonly ChalkSegment[]) {
  const points: { x: number; y: number }[] = [];
  for (const part of segments) {
    const qx = part.qx ?? part.x1;
    const qy = part.qy ?? part.y1;
    for (let i = 0; i <= 10; i += 1) {
      const t = i / 10;
      const u = 1 - t;
      points.push({
        x: u * u * part.x1 + 2 * u * t * qx + t * t * part.x2,
        y: u * u * part.y1 + 2 * u * t * qy + t * t * part.y2,
      });
    }
  }
  return points;
}

function ringClearance(segments: readonly ChalkSegment[], ink: GlyphBox): number {
  let min = Infinity;
  for (const point of curveSamples(segments)) {
    const dx = Math.max(ink.x - point.x, 0, point.x - (ink.x + ink.width));
    const dy = Math.max(ink.y - point.y, 0, point.y - (ink.y + ink.height));
    const outside = dx > 0 || dy > 0;
    const gap = outside
      ? Math.hypot(dx, dy)
      : -Math.min(point.x - ink.x, ink.x + ink.width - point.x, point.y - ink.y, ink.y + ink.height - point.y);
    min = Math.min(min, gap);
  }
  return min;
}

function samplesOf(segments: readonly ChalkSegment[]) {
  const points: { x: number; y: number }[] = [];
  for (const part of segments) {
    points.push({ x: part.x1, y: part.y1 });
    if (part.qx != null && part.qy != null) {
      points.push({
        x: 0.25 * part.x1 + 0.5 * part.qx + 0.25 * part.x2,
        y: 0.25 * part.y1 + 0.5 * part.qy + 0.25 * part.y2,
      });
    }
  }
  const last = segments[segments.length - 1];
  if (last) points.push({ x: last.x2, y: last.y2 });
  return points;
}

function expectIrregularChalkCircle(
  segments: readonly ChalkSegment[],
  zone: { x: number; y: number; w: number; h: number },
) {
  expect(segments.length).toBeGreaterThan(8);
  expect(segments.every((part) => part.qx != null && part.qy != null)).toBe(true);
  const aligned = segments.filter((part) => {
    const dx = Math.abs(part.x2 - part.x1);
    const dy = Math.abs(part.y2 - part.y1);
    return dx < 2 || dy < 2;
  }).length;
  expect(aligned / segments.length).toBeLessThan(0.5);

  const points = samplesOf(segments);
  const box = pointBounds(points);
  expect(box.h).toBeGreaterThan(20);
  expect(box.w).toBeGreaterThan(box.h);
  expect(box.x).toBeGreaterThanOrEqual(zone.x - 2);
  expect(box.y).toBeGreaterThanOrEqual(zone.y - 2);
  expect(box.x + box.w).toBeLessThanOrEqual(zone.x + zone.w + 2);
  expect(box.y + box.h).toBeLessThanOrEqual(zone.y + zone.h + 2);
  const tracesZone =
    Math.abs(box.x - zone.x) < 8 &&
    Math.abs(box.y - zone.y) < 8 &&
    Math.abs(box.w - zone.w) < 8 &&
    Math.abs(box.h - zone.h) < 8;
  expect(tracesZone).toBe(false);

  let onEdge = 0;
  for (const point of points) {
    const onX = Math.abs(point.x - box.x) <= 2.5 || Math.abs(point.x - (box.x + box.w)) <= 2.5;
    const onY = Math.abs(point.y - box.y) <= 2.5 || Math.abs(point.y - (box.y + box.h)) <= 2.5;
    if (onX || onY) onEdge += 1;
  }
  expect(onEdge / points.length).toBeLessThan(0.72);

  let cx = 0;
  let cy = 0;
  for (const point of points) {
    cx += point.x;
    cy += point.y;
  }
  cx /= points.length;
  cy /= points.length;
  const radii = points.map((point) => Math.hypot(point.x - cx, point.y - cy));
  const minR = Math.min(...radii);
  const maxR = Math.max(...radii);
  expect(maxR / minR).toBeGreaterThan(1.12);
  const corner = Math.hypot(zone.x - cx, zone.y - cy);
  expect(corner).toBeGreaterThan(maxR);

  const weights = segments.map((part) => part.weight ?? 1);
  expect(Math.max(...weights) - Math.min(...weights)).toBeGreaterThan(0.25);

  const first = points[0]!;
  const last = points[points.length - 1]!;
  let span = 0;
  let prev = Math.atan2(first.y - cy, first.x - cx);
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i]!;
    const angle = Math.atan2(point.y - cy, point.x - cx);
    let delta = angle - prev;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    span += delta;
    prev = angle;
  }
  expect(Math.abs(span)).toBeGreaterThan(Math.PI * 2 + 0.25);
  expect(Math.abs(span)).toBeLessThan(Math.PI * 2.9);
  const pathLen = segments.reduce((sum, part) => sum + part.len, 0);
  const gap = Math.hypot(last.x - first.x, last.y - first.y);
  expect(pathLen).toBeGreaterThan(gap * 4);
  let nearest = Infinity;
  for (let i = 0; i < Math.min(5, points.length - 1); i += 1) {
    const point = points[i]!;
    nearest = Math.min(nearest, Math.hypot(last.x - point.x, last.y - point.y));
  }
  expect(nearest).toBeLessThan(Math.max(box.w, box.h) * 0.2);

  const top = points.reduce((best, point) => (point.y < best.y ? point : best));
  expect(Math.abs(top.x - cx)).toBeGreaterThan(1.5);
}
