import { CHALK_STROKE, drawChalkSegments, paintWhiteboardFrame, quadSeg, seg, type ChalkSegment } from "./proposals-board-chalk";
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

/** Cuánto tarda en trazarse el círculo de tiza al enfocar o al pasar por encima. */
export const MARK_DRAW_MS = 340;

/** Porción del círculo que queda en reposo, tenue. */
const REST_MARK = 0.62;

export function chalkMarkProgress(elapsedMs: number, reduced: boolean): number {
  if (reduced) return 1;
  const t = Math.min(1, Math.max(0, elapsedMs / MARK_DRAW_MS));
  return t * t * (3 - 2 * t);
}

function ringSeed(x: number, y: number, w: number, h: number): number {
  const mix = (n: number, k: number) => Math.imul(n ^ k, 0x9e3779b1);
  let n = 0x811c9dc5;
  n = mix(n, Math.round(x));
  n = mix(n, Math.round(y));
  n = mix(n, Math.round(w));
  n = mix(n, Math.round(h));
  return n >>> 0;
}

function hashUnit(seed: number, salt: number): number {
  let n = Math.imul(seed ^ Math.imul(salt, 0x9e3779b1), 0x85ebca6b);
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

/**
 * Óvalo de tiza alrededor de una caja de texto.
 * El radio, la inclinación y el grosor salen de la caja: el mismo elemento no tiembla entre fotogramas.
 * El trazo da algo más de una vuelta para que el final pase el inicio.
 */
export function chalkRingSegments(x: number, y: number, width: number, height: number): ChalkSegment[] {
  const seed = ringSeed(x, y, width, height);
  const padX = 7 + hashUnit(seed, 1) * 3;
  const padY = 4 + hashUnit(seed, 2) * 2.5;
  const cx = x + width / 2;
  const cy = y + height / 2;
  const rx = width / 2 + padX;
  const ry = Math.max(12, height / 2 + padY);
  const tiltMag = Math.min(0.07, 5.2 / Math.max(rx, 1));
  const tilt = (hashUnit(seed, 3) < 0.5 ? -1 : 1) * tiltMag * (0.72 + 0.28 * hashUnit(seed, 4));
  const overlap = 0.45 + hashUnit(seed, 5) * 0.38;
  const start = -Math.PI * 0.72 + (hashUnit(seed, 6) - 0.5) * 0.5;
  const wobbleA = 0.028 + hashUnit(seed, 7) * 0.02;
  const wobbleB = 0.016 + hashUnit(seed, 8) * 0.014;
  const phase1 = hashUnit(seed, 9) * Math.PI * 2;
  const phase2 = hashUnit(seed, 10) * Math.PI * 2;
  const phaseW = hashUnit(seed, 11) * Math.PI * 2;
  const steps = 16;
  const sweep = Math.PI * 2 + overlap;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);

  const point = (theta: number, salt: number) => {
    const wobble = 1 + wobbleA * Math.sin(2 * theta + phase1) + wobbleB * Math.sin(3 * theta + phase2);
    const localX = Math.cos(theta) * rx * wobble;
    const localY = Math.sin(theta) * ry * wobble;
    const jitter = (hashUnit(seed, salt) - 0.5) * 1.6;
    const jx = jitter * Math.cos(theta + 1.1);
    const jy = jitter * Math.sin(theta + 0.6) * 0.55;
    return {
      x: cx + localX * cosT - localY * sinT + jx,
      y: cy + localX * sinT + localY * cosT + jy,
    };
  };

  const segments: ChalkSegment[] = [];
  for (let i = 0; i < steps; i += 1) {
    const t0 = start + (i / steps) * sweep;
    const t1 = start + ((i + 1) / steps) * sweep;
    const tm = (t0 + t1) / 2;
    const p0 = point(t0, i * 3 + 1);
    const mid = point(tm, i * 3 + 2);
    const p1 = point(t1, i * 3 + 3);
    const qx = 2 * mid.x - 0.5 * p0.x - 0.5 * p1.x;
    const qy = 2 * mid.y - 0.5 * p0.y - 0.5 * p1.y;
    const weight = 0.66 + 0.64 * (0.5 + 0.5 * Math.sin(t0 * 3 + phaseW));
    segments.push(quadSeg(p0.x, p0.y, qx, qy, p1.x, p1.y, weight));
  }
  return segments;
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

export function rowChalkCue(layout: BoardRowLayout, titleWidth: number): { chevron: ChalkSegment[]; ring: ChalkSegment[] } {
  const width = Math.max(84, Math.min(titleWidth, 300));
  const textTop = layout.y + 12;
  return {
    chevron: chalkChevronSegments(WHITEBOARD_WIDTH - 58, layout.y + 22, 7),
    ring: chalkRingSegments(28, textTop, width, 28),
  };
}

export function detailBackCue(labelWidth: number): ChalkSegment[] {
  const back = detailBackRect();
  const width = Math.max(96, Math.min(labelWidth, 240));
  const font = 32;
  const midY = back.y + back.h / 2;
  return chalkRingSegments(back.x + 36, midY - font / 2, width, font);
}

export function detailActionCue(labelWidth: number): { ring: ChalkSegment[]; chevron: ChalkSegment[]; textX: number } {
  const action = detailActionRect();
  const midY = action.y + action.h / 2;
  const textW = Math.max(120, Math.min(labelWidth, action.w - 140));
  const chevronSize = 8;
  const gap = 16;
  const group = chevronSize + gap + textW;
  const left = action.x + (action.w - group) / 2;
  const font = 36;
  const textX = left + chevronSize + gap;
  return {
    chevron: chalkChevronSegments(left, midY, chevronSize),
    ring: chalkRingSegments(textX, midY - font / 2, textW, font),
    textX,
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
    if (hot != null && hot > 0.02) paintOpenCue(context, cue.ring, hot, AMBER, 3.2);
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

function paintEmphasisRing(context: CanvasRenderingContext2D, segments: readonly ChalkSegment[], hot: number | null) {
  const progress = hot == null ? REST_MARK : hot;
  if (progress <= 0.02) return;
  paintOpenCue(context, segments, progress, hot == null ? CUE : AMBER, hot == null ? 2.2 : 3.2);
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
  paintEmphasisRing(context, detailBackCue(backWidth), emphasis.back);
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
    paintEmphasisRing(context, cue.ring, emphasis.action);
  }
  context.restore();
}
