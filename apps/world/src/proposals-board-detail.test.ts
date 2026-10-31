import { describe, expect, it } from "vitest";
import type { ChalkSegment } from "./proposals-board-chalk";
import { computeRowLayouts, WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH } from "./proposals-board-metrics";
import {
  chalkMarkProgress,
  detailActionCue,
  detailActionRect,
  detailBackCue,
  detailBackRect,
  detailFits,
  detailRegionsDisjoint,
  hitBoard,
  MARK_DRAW_MS,
  rowChalkCue,
  rowHitRect,
  strokeIsOpen,
} from "./proposals-board-detail";

function bounds(segments: readonly ChalkSegment[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const part of segments) {
    minX = Math.min(minX, part.x1, part.x2);
    minY = Math.min(minY, part.y1, part.y2);
    maxX = Math.max(maxX, part.x1, part.x2);
    maxY = Math.max(maxY, part.y1, part.y2);
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

  it("el énfasis es un trazo abierto y no el recuadro de la zona", () => {
    expect(chalkMarkProgress(0, true)).toBe(1);
    expect(chalkMarkProgress(0, false)).toBe(0);
    expect(chalkMarkProgress(MARK_DRAW_MS / 2, false)).toBeGreaterThan(0);
    expect(chalkMarkProgress(MARK_DRAW_MS / 2, false)).toBeLessThan(1);
    expect(chalkMarkProgress(MARK_DRAW_MS, false)).toBe(1);

    const layout = computeRowLayouts(1)[0]!;
    layout.number = 7;
    const row = rowHitRect(layout);
    const cue = rowChalkCue(layout, 180);
    expect(strokeIsOpen(cue.chevron)).toBe(true);
    expect(strokeIsOpen(cue.underline)).toBe(true);
    const line = bounds(cue.underline);
    const mark = bounds(cue.chevron);
    expect(line.h).toBeLessThan(12);
    expect(line.h).toBeLessThan(row.h * 0.25);
    expect(line.w).toBeLessThan(row.w * 0.5);
    expect(line.x).toBeGreaterThanOrEqual(row.x);
    expect(line.y).toBeGreaterThanOrEqual(row.y);
    expect(line.x + line.w).toBeLessThanOrEqual(row.x + row.w);
    expect(line.y + line.h).toBeLessThanOrEqual(row.y + row.h);
    expect(mark.x).toBeGreaterThanOrEqual(row.x);
    expect(mark.y).toBeGreaterThanOrEqual(row.y);
    expect(mark.x + mark.w).toBeLessThanOrEqual(row.x + row.w);

    const back = detailBackRect();
    const backLine = bounds(detailBackCue(150));
    expect(strokeIsOpen(detailBackCue(150))).toBe(true);
    expect(backLine.w).toBeLessThan(back.w * 0.5);
    expect(backLine.h).toBeLessThan(12);
    expect(backLine.y).toBeGreaterThanOrEqual(back.y);
    expect(backLine.y + backLine.h).toBeLessThanOrEqual(back.y + back.h);

    const action = detailActionRect();
    const actionCue = detailActionCue(220);
    const actionLine = bounds(actionCue.underline);
    expect(strokeIsOpen(actionCue.chevron)).toBe(true);
    expect(strokeIsOpen(actionCue.underline)).toBe(true);
    expect(actionLine.w).toBeLessThan(action.w * 0.5);
    expect(actionLine.y).toBeGreaterThanOrEqual(action.y);
    expect(actionLine.y + actionLine.h).toBeLessThanOrEqual(action.y + action.h);
  });
});
