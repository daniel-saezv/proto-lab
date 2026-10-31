import { describe, expect, it } from "vitest";
import { boardDataSignature, selectBoardRows } from "./proposals-board-paint";
import { WHITEBOARD_MAX_ROWS } from "./proposals-board-metrics";
import type { ProposalStatusItem } from "./proposals-status-api";

const item = (n: number): ProposalStatusItem => ({
  number: n,
  title: `T${n}`,
  kind: "propuesta",
  slug: null,
  phase: "recibida",
  updatedAt: "2026-01-01T00:00:00Z",
});

describe("proposals-board-paint", () => {
  it("limita filas visibles y calcula overflow", () => {
    const items = Array.from({ length: 7 }, (_, i) => item(i + 1));
    const { rows, overflow } = selectBoardRows(items);
    expect(rows).toHaveLength(WHITEBOARD_MAX_ROWS);
    expect(overflow).toBe(2);
  });

  it("cambia la firma cuando cambia la fase", () => {
    const a = boardDataSignature([item(1)], false);
    const b = boardDataSignature([{ ...item(1), phase: "aprobada" }], false);
    expect(a).not.toBe(b);
  });
});
