import { CHALK_STROKE, drawChalkSegments, paintWhiteboardFrame, seg, type ChalkSegment } from "./proposals-board-chalk";
import { computeRowLayouts, WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH, type BoardRowLayout } from "./proposals-board-metrics";
import {
  paintBoardHeader,
  paintRowRevealStroke,
  paintSingleRow,
  paintWhiteboardBody,
  type BoardPaintModel,
} from "./proposals-board-paint";

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
};

/** Progreso 0–1 del trazo de énfasis. `null` en un control es el reposo, sin subrayado caliente. */
export type DetailEmphasis = {
  back: number | null;
  action: number | null;
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
const INK_WARM = "#fffaf0";
const INK_MUTED = "rgba(244, 239, 228, 0.72)";
const CUE = "rgba(244, 239, 228, 0.72)";
const AMBER = "#ffb703";

export type ChalkAppearance = { stroke: number; text: number };

/** Cuánto tarda en trazarse el subrayado al enfocar o al pasar por encima. */
export const MARK_DRAW_MS = 340;

export function chalkMarkProgress(elapsedMs: number, reduced: boolean): number {
  if (reduced) return 1;
  const t = Math.min(1, Math.max(0, elapsedMs / MARK_DRAW_MS));
  return t * t * (3 - 2 * t);
}

/** Subrayado a mano: dos trazos con una panza, no una regla ni un recuadro. */
export function chalkUnderlineSegments(x: number, y: number, width: number): ChalkSegment[] {
  const mid = x + width * 0.47;
  return [seg(x, y, mid, y + 2.4), seg(mid, y + 2.4, x + width, y - 0.8)];
}

/** Marca › abierta. No cierra un rombo ni una caja. */
export function chalkChevronSegments(x: number, y: number, size: number): ChalkSegment[] {
  const tip = x + size * 0.85;
  return [seg(x, y - size, tip, y), seg(tip, y, x, y + size)];
}

export function strokeIsOpen(segments: readonly ChalkSegment[]): boolean {
  if (segments.length === 0 || segments.length >= 4) return false;
  const first = segments[0];
  const last = segments[segments.length - 1];
  if (!first || !last) return false;
  return Math.hypot(last.x2 - first.x1, last.y2 - first.y1) > 6;
}

export function rowChalkCue(layout: BoardRowLayout, titleWidth: number): { chevron: ChalkSegment[]; underline: ChalkSegment[] } {
  const width = Math.max(84, Math.min(titleWidth, 300));
  return {
    chevron: chalkChevronSegments(WHITEBOARD_WIDTH - 58, layout.y + 22, 7),
    underline: chalkUnderlineSegments(28, layout.y + 40, width),
  };
}

export function detailBackCue(labelWidth: number): ChalkSegment[] {
  const back = detailBackRect();
  const width = Math.max(96, Math.min(labelWidth, 240));
  return chalkUnderlineSegments(back.x + 36, back.y + back.h / 2 + 24, width);
}

export function detailActionCue(labelWidth: number): { underline: ChalkSegment[]; chevron: ChalkSegment[]; textX: number } {
  const action = detailActionRect();
  const midY = action.y + action.h / 2;
  const textW = Math.max(120, Math.min(labelWidth, action.w - 140));
  const chevronSize = 8;
  const gap = 16;
  const group = chevronSize + gap + textW;
  const left = action.x + (action.w - group) / 2;
  return {
    chevron: chalkChevronSegments(left, midY, chevronSize),
    underline: chalkUnderlineSegments(left + chevronSize + gap, midY + 24, textW),
    textX: left + chevronSize + gap,
  };
}

function truncate(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (context.measureText(text).width <= maxWidth) return text;
  let trimmed = text;
  while (trimmed.length > 1 && context.measureText(`${trimmed}…`).width > maxWidth) {
    trimmed = trimmed.slice(0, -1);
  }
  return `${trimmed}…`;
}

function paintOpenCue(
  context: CanvasRenderingContext2D,
  segments: readonly ChalkSegment[],
  progress: number,
  color: string,
  width: number,
) {
  drawChalkSegments(context, segments, progress, color, width);
}

export function paintListAffordances(
  context: CanvasRenderingContext2D,
  layouts: readonly BoardRowLayout[],
  rows: readonly { number: number; title: string }[],
  markOf: (number: number) => number | null,
) {
  context.save();
  context.font = "700 26px sans-serif";
  context.textAlign = "left";
  const maxTitle = WHITEBOARD_WIDTH - 56 - 80;
  for (const layout of layouts) {
    if (layout.number <= 0) continue;
    const row = rows.find((item) => item.number === layout.number);
    const title = row ? `#${row.number} · ${row.title}` : `#${layout.number}`;
    const titleWidth = Math.min(context.measureText(title).width, maxTitle);
    const cue = rowChalkCue(layout, titleWidth);
    const hot = markOf(layout.number);
    paintOpenCue(context, cue.chevron, 1, hot == null ? CUE : AMBER, 2.6);
    if (hot != null && hot > 0.02) paintOpenCue(context, cue.underline, hot, AMBER, 3.2);
  }
  context.restore();
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

function paintEmphasisUnderline(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  hot: number | null,
) {
  const drawn = hot == null ? width * 0.62 : width;
  paintOpenCue(context, chalkUnderlineSegments(x, y, drawn), hot == null ? 1 : hot, hot == null ? CUE : AMBER, hot == null ? 2.2 : 3.2);
}

export function paintDetailBoard(
  context: CanvasRenderingContext2D,
  model: DetailPaintModel,
  appearance: ChalkAppearance,
  emphasis: DetailEmphasis,
) {
  paintWhiteboardFrame(context);
  const back = detailBackRect();
  const action = model.actionLabel ? detailActionRect() : null;
  if (appearance.stroke > 0.02) {
    drawChalkSegments(context, [seg(36, 332, WHITEBOARD_WIDTH - 36, 332)], appearance.stroke, CHALK_STROKE, 2);
  }
  const titleY = 188;
  if (appearance.text <= 0.02) return;
  context.save();
  context.globalAlpha = appearance.text;
  context.font = "700 32px sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  const backLabel = "← Tablón";
  const backWidth = context.measureText(backLabel).width;
  context.fillStyle = emphasis.back == null ? CUE : INK_WARM;
  context.fillText(backLabel, back.x + 36, back.y + back.h / 2);
  paintEmphasisUnderline(context, back.x + 36, back.y + back.h / 2 + 24, Math.min(backWidth, 240), emphasis.back);
  context.textBaseline = "alphabetic";
  context.fillStyle = INK;
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
    context.font = "700 36px sans-serif";
    context.textAlign = "left";
    context.textBaseline = "middle";
    const labelWidth = context.measureText(model.actionLabel).width;
    const cue = detailActionCue(labelWidth);
    const midY = action.y + action.h / 2;
    paintOpenCue(context, cue.chevron, 1, emphasis.action == null ? CUE : AMBER, 2.8);
    context.fillStyle = emphasis.action == null ? CUE : INK_WARM;
    context.fillText(model.actionLabel, cue.textX, midY);
    const underline = cue.underline[0];
    if (underline) {
      paintEmphasisUnderline(context, underline.x1, midY + 24, Math.min(labelWidth, action.w - 140), emphasis.action);
    }
  }
  context.restore();
}
