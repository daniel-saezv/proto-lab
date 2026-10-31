import { CHALK_STROKE, drawChalkSegments, paintWhiteboardFrame, seg } from "./proposals-board-chalk";
import { computeRowLayouts, WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH, type BoardRowLayout } from "./proposals-board-metrics";
import {
  paintBoardHeader,
  paintRowRevealStroke,
  paintSingleRow,
  paintWhiteboardBody,
  type BoardPaintModel,
} from "./proposals-board-paint";
import type { BoardFocus } from "./proposals-board-session";

export type BoardRect = { x: number; y: number; w: number; h: number };

/** Zona de «volver a la lista». Alta a propósito para el dedo en vertical. */
export function detailBackRect(): BoardRect {
  return { x: 24, y: 16, w: 520, h: 132 };
}

/** Zona de la acción (preview o lab). Ocupa el ancho de la pizarra. */
export function detailActionRect(): BoardRect {
  return { x: 28, y: WHITEBOARD_HEIGHT - 176, w: WHITEBOARD_WIDTH - 56, h: 148 };
}

export function rowHitRect(layout: BoardRowLayout): BoardRect {
  return { x: 12, y: layout.y, w: WHITEBOARD_WIDTH - 24, h: layout.height };
}

export function rectCenter(rect: BoardRect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

export function pointInRect(x: number, y: number, rect: BoardRect): boolean {
  return x >= rect.x && y >= rect.y && x < rect.x + rect.w && y < rect.y + rect.h;
}

export type BoardHit =
  | { zone: "row"; number: number }
  | { zone: "back" }
  | { zone: "action" };

export function hitBoard(
  x: number,
  y: number,
  screen: "list" | "detail",
  rows: readonly BoardRowLayout[],
  hasAction: boolean,
): BoardHit | null {
  if (screen === "detail") {
    if (pointInRect(x, y, detailBackRect())) return { zone: "back" };
    if (hasAction && pointInRect(x, y, detailActionRect())) return { zone: "action" };
    return null;
  }
  for (const row of rows) {
    if (row.number <= 0) continue;
    if (pointInRect(x, y, rowHitRect(row))) return { zone: "row", number: row.number };
  }
  return null;
}

export type DetailPaintModel = {
  number: number;
  title: string;
  meta: string;
  phaseLabel: string;
  actionLabel: string | null;
  focused: "back" | "action" | null;
};

export function detailFits(rect: BoardRect): boolean {
  return rect.x >= 0 && rect.y >= 0 && rect.x + rect.w <= WHITEBOARD_WIDTH && rect.y + rect.h <= WHITEBOARD_HEIGHT;
}

export function detailRegionsDisjoint(): boolean {
  const back = detailBackRect();
  const action = detailActionRect();
  return back.y + back.h <= action.y;
}

const INK = "#f4efe4";
const INK_MUTED = "rgba(244, 239, 228, 0.72)";
const AMBER = "#ffb703";
const FOCUS = "rgba(255, 183, 3, 0.95)";

export type ChalkAppearance = { stroke: number; text: number };

function chalkRect(context: CanvasRenderingContext2D, rect: BoardRect, progress: number, color: string, width: number) {
  if (progress <= 0) return;
  const { x, y, w, h } = rect;
  drawChalkSegments(
    context,
    [seg(x, y, x + w, y), seg(x + w, y, x + w, y + h), seg(x + w, y + h, x, y + h), seg(x, y + h, x, y)],
    progress,
    color,
    width,
  );
}

function diamond(context: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  const h = size / 2;
  drawChalkSegments(
    context,
    [seg(cx, cy - h, cx + h, cy), seg(cx + h, cy, cx, cy + h), seg(cx, cy + h, cx - h, cy), seg(cx - h, cy, cx, cy - h)],
    1,
    color,
    2.5,
  );
}

function truncate(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && context.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

export function paintListAffordances(
  context: CanvasRenderingContext2D,
  layouts: readonly BoardRowLayout[],
  focus: BoardFocus | null,
) {
  for (const layout of layouts) {
    if (layout.number <= 0) continue;
    diamond(context, WHITEBOARD_WIDTH - 52, layout.y + 30, 16, AMBER);
    if (focus?.zone === "row" && focus.number === layout.number) {
      const rect = rowHitRect(layout);
      chalkRect(context, { x: rect.x, y: rect.y + 6, w: rect.w, h: rect.h - 12 }, 1, FOCUS, 3);
    }
  }
}

export function paintListSketch(context: CanvasRenderingContext2D, model: BoardPaintModel, progress: number): BoardRowLayout[] {
  paintWhiteboardFrame(context);
  drawChalkSegments(context, [seg(32, 46, 168, 46)], progress, CHALK_STROKE, 3);
  const layouts = model.rows.length === 0 ? [] : layoutsFor(model);
  const marginX = 28;
  const trackWidth = WHITEBOARD_WIDTH - marginX * 2;
  model.rows.forEach((row, index) => {
    const layout = layouts[index];
    if (!layout) return;
    paintRowRevealStroke(context, layout, row, progress, marginX, trackWidth);
  });
  return layouts;
}

export function paintListIncoming(context: CanvasRenderingContext2D, model: BoardPaintModel, t: number): BoardRowLayout[] {
  paintWhiteboardFrame(context);
  if (t >= 1) return paintWhiteboardBody(context, model);
  if (t > 0.12) paintBoardHeader(context, model.partial);
  else drawChalkSegments(context, [seg(32, 46, 168, 46)], Math.max(t / 0.12, 0.05), CHALK_STROKE, 3);
  const layouts = layoutsFor(model);
  const marginX = 28;
  const trackWidth = WHITEBOARD_WIDTH - marginX * 2;
  const count = model.rows.length;
  model.rows.forEach((row, index) => {
    const layout = layouts[index];
    if (!layout) return;
    const start = count <= 1 ? 0 : (index / count) * 0.45;
    const local = Math.min(1, Math.max(0, (t - start) / 0.42));
    const eased = local * local * (3 - 2 * local);
    if (eased >= 1) paintSingleRow(context, layout, row, model.pulseT, model.reducedMotion, marginX, trackWidth);
    else if (eased > 0) paintRowRevealStroke(context, layout, row, eased, marginX, trackWidth);
  });
  return layouts;
}

export function paintListOutgoing(context: CanvasRenderingContext2D, model: BoardPaintModel, t: number): BoardRowLayout[] {
  if (t > 0.82) {
    paintWhiteboardFrame(context);
    return paintWhiteboardBody(context, model);
  }
  return paintListSketch(context, model, t / 0.82);
}

function layoutsFor(model: BoardPaintModel): BoardRowLayout[] {
  const layouts = computeRowLayouts(model.rows.length);
  model.rows.forEach((row, index) => {
    const layout = layouts[index];
    if (layout) layout.number = row.number;
  });
  return layouts;
}

export function paintDetailBoard(
  context: CanvasRenderingContext2D,
  model: DetailPaintModel,
  appearance: ChalkAppearance,
) {
  paintWhiteboardFrame(context);
  const back = detailBackRect();
  const action = model.actionLabel ? detailActionRect() : null;
  if (appearance.stroke > 0.02) {
    chalkRect(context, back, appearance.stroke, model.focused === "back" ? FOCUS : CHALK_STROKE, 3);
    drawChalkSegments(context, [seg(36, 332, WHITEBOARD_WIDTH - 36, 332)], appearance.stroke, CHALK_STROKE, 2);
    if (action) {
      chalkRect(context, action, appearance.stroke, model.focused === "action" ? FOCUS : AMBER, 4);
      if (appearance.stroke > 0.45) diamond(context, action.x + 36, action.y + action.h / 2, 18, AMBER);
    }
  }
  const titleY = 188;
  if (appearance.text <= 0.02) return;
  context.save();
  context.globalAlpha = appearance.text;
  context.fillStyle = INK;
  context.font = "700 32px sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText("← Tablón", back.x + 28, back.y + back.h / 2);
  context.textBaseline = "alphabetic";
  context.font = "700 40px sans-serif";
  const title = truncate(context, `#${model.number}  ${model.title}`, WHITEBOARD_WIDTH - 72);
  context.fillText(title, 36, titleY);
  context.fillStyle = INK_MUTED;
  context.font = "600 24px sans-serif";
  context.fillText(model.meta, 36, 236);
  context.fillStyle = AMBER;
  context.font = "700 34px sans-serif";
  context.fillText(model.phaseLabel, 36, 292);
  if (action && model.actionLabel) {
    context.fillStyle = INK;
    context.font = "700 36px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(model.actionLabel, action.x + action.w / 2 + 12, action.y + action.h / 2);
  }
  context.restore();
}
