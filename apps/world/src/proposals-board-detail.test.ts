import { describe, expect, it } from "vitest";
import { computeRowLayouts, WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH } from "./proposals-board-metrics";
import {
  detailActionRect,
  detailBackRect,
  detailFits,
  detailRegionsDisjoint,
  hitBoard,
  rowHitRect,
} from "./proposals-board-detail";

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
});
