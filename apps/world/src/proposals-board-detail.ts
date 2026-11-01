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

/** Progreso 0–1 del trazo de énfasis. `null` en un control es el reposo, sin trazo caliente. */
export type DetailEmphasis = {
  back: number | null;
  action: number | null;
  /** Trazo del botón de acción al abrir el detalle. Sigue en 1 cuando ya se dibujó. */
  actionDraw: number | null;
};

/**
 * Cómo se pinta el círculo de la acción.
 * Sin reloj ni foco no hay trazo: no aparece ya empezado.
 * Si el foco llega a medias, el color pasa a ámbar y el progreso no vuelve a cero.
 */
export function combineActionMark(
  draw: number | null,
  hot: number | null,
): { progress: number; hot: boolean } | null {
  if (draw == null && hot == null) return null;
  const progress = Math.max(draw ?? 0, hot ?? 0);
  if (progress <= 0.02) return null;
  return { progress, hot: hot != null };
}

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

/** Caja de tinta medida: origen del `fillText` menos el bearing, alto real del glifo. */
export type GlyphBox = { x: number; y: number; width: number; height: number };

export type GlyphBaseline = "alphabetic" | "middle";

function fontPxOf(font: string): number {
  const match = /(\d+(?:\.\d+)?)px/.exec(font);
  const px = match ? Number(match[1]) : 26;
  return Number.isFinite(px) && px > 0 ? px : 26;
}

function finiteMetric(value: number | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Caja de tinta de un texto ya medido.
 * `actualBoundingBox*` es relativo a la baseline activa (`alphabetic` o `middle`).
 * Si el navegador no da esas medidas, se estima con el tamaño de la fuente.
 */
export function measureGlyphBox(
  context: CanvasRenderingContext2D,
  text: string,
  originX: number,
  baselineY: number,
  baseline: GlyphBaseline,
): GlyphBox {
  const metrics = context.measureText(text);
  const left = metrics.actualBoundingBoxLeft;
  const right = metrics.actualBoundingBoxRight;
  const ascent = metrics.actualBoundingBoxAscent;
  const descent = metrics.actualBoundingBoxDescent;
  if (
    finiteMetric(left) &&
    finiteMetric(right) &&
    finiteMetric(ascent) &&
    finiteMetric(descent) &&
    left + right > 0.5 &&
    ascent + descent > 0.5
  ) {
    return {
      x: originX - left,
      y: baselineY - ascent,
      width: left + right,
      height: ascent + descent,
    };
  }
  const width = Math.max(metrics.width, 1);
  const fontPx = fontPxOf(context.font);
  if (baseline === "middle") {
    const half = fontPx * 0.5;
    return { x: originX, y: baselineY - half, width, height: fontPx };
  }
  const ascentFb = fontPx * 0.78;
  const descentFb = fontPx * 0.22;
  return { x: originX, y: baselineY - ascentFb, width, height: ascentFb + descentFb };
}

/**
 * Óvalo de tiza alrededor de la caja de tinta.
 * El margen es en píxeles, no un porcentaje del radio: un título ancho no se come el trazo.
 * La irregularidad empuja poco hacia dentro para rozar sin cruzar las letras.
 * El mismo elemento no tiembla entre fotogramas. El trazo da algo más de una vuelta.
 */
/** Exponente para que las esquinas del texto queden dentro y el trazo no las corte. */
function wrapExponent(halfW: number, halfH: number, pad: number): number {
  const ax = halfW / (halfW + pad);
  const by = halfH / (halfH + pad);
  let n = 2;
  while (n < 6.5 && ax ** n + by ** n > 0.72) n += 0.2;
  return n;
}

export function chalkRingSegments(x: number, y: number, width: number, height: number): ChalkSegment[] {
  const seed = ringSeed(x, y, width, height);
  const boxW = Math.max(width, 1);
  const boxH = Math.max(height, 1);
  const pad = 8.2 + hashUnit(seed, 1) * 1.6;
  const halfW = boxW / 2;
  const halfH = boxH / 2;
  const cx = x + halfW;
  const cy = y + halfH;
  const rx = halfW + pad;
  const ry = halfH + pad;
  const exponent = wrapExponent(halfW, halfH, pad) + (hashUnit(seed, 2) - 0.5) * 0.2;
  const power = 2 / exponent;
  const tiltMag = Math.min(0.035, 2.4 / Math.max(rx, 1));
  const tilt = (hashUnit(seed, 3) < 0.5 ? -1 : 1) * tiltMag * (0.72 + 0.28 * hashUnit(seed, 4));
  const overlap = 0.45 + hashUnit(seed, 5) * 0.38;
  const start = -Math.PI * 0.72 + (hashUnit(seed, 6) - 0.5) * 0.5;
  const wobbleAmp = 0.85 + hashUnit(seed, 7) * 0.45;
  const wobbleFine = 0.35 + hashUnit(seed, 8) * 0.2;
  const phase1 = hashUnit(seed, 9) * Math.PI * 2;
  const phase2 = hashUnit(seed, 10) * Math.PI * 2;
  const phaseW = hashUnit(seed, 11) * Math.PI * 2;
  const steps = 16;
  const sweep = Math.PI * 2 + overlap;
  const cosT = Math.cos(tilt);
  const sinT = Math.sin(tilt);

  const point = (theta: number, salt: number) => {
    const ct = Math.cos(theta);
    const st = Math.sin(theta);
    let localX = Math.sign(ct) * Math.pow(Math.abs(ct), power) * rx;
    let localY = Math.sign(st) * Math.pow(Math.abs(st), power) * ry;
    const span = Math.hypot(localX, localY) || 1;
    const radial = Math.sin(2 * theta + phase1) * wobbleAmp + Math.sin(3 * theta + phase2) * wobbleFine;
    const jitter = (hashUnit(seed, salt) - 0.5) * 0.6;
    const scale = (span + radial + jitter) / span;
    localX *= scale;
    localY *= scale;
    return {
      x: cx + localX * cosT - localY * sinT,
      y: cy + localX * sinT + localY * cosT,
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

export function rowChalkCue(layout: BoardRowLayout, ink: GlyphBox): { chevron: ChalkSegment[]; ring: ChalkSegment[] } {
  return {
    chevron: chalkChevronSegments(WHITEBOARD_WIDTH - 58, layout.y + 22, 7),
    ring: chalkRingSegments(ink.x, ink.y, ink.width, ink.height),
  };
}

export function detailBackCue(ink: GlyphBox): ChalkSegment[] {
  return chalkRingSegments(ink.x, ink.y, ink.width, ink.height);
}

/** Origen del rótulo de la acción, centrado en su zona junto al chevron. */
export function actionLabelOrigin(labelWidth: number): { textX: number; midY: number; chevronX: number } {
  const action = detailActionRect();
  const midY = action.y + action.h / 2;
  const textW = Math.max(1, Math.min(labelWidth, action.w - 80));
  const chevronSize = 8;
  const gap = 16;
  const group = chevronSize + gap + textW;
  const left = action.x + (action.w - group) / 2;
  return { textX: left + chevronSize + gap, midY, chevronX: left };
}

export function detailActionCue(
  ink: GlyphBox,
  labelWidth = ink.width,
): { ring: ChalkSegment[]; chevron: ChalkSegment[]; textX: number } {
  const origin = actionLabelOrigin(labelWidth);
  return {
    chevron: chalkChevronSegments(origin.chevronX, origin.midY, 8),
    ring: chalkRingSegments(ink.x, ink.y, ink.width, ink.height),
    textX: origin.textX,
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
  context.textBaseline = "alphabetic";
  const maxTitle = WHITEBOARD_WIDTH - 56 - 80;
  for (const layout of layouts) {
    if (layout.number <= 0) continue;
    const row = rows.find((item) => item.number === layout.number);
    const title = truncate(context, row ? `#${row.number} · ${row.title}` : `#${layout.number}`, maxTitle);
    const ink = measureGlyphBox(context, title, 28, layout.y + 34, "alphabetic");
    const cue = rowChalkCue(layout, ink);
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
  const backX = back.x + 36;
  const backY = back.y + back.h / 2;
  const backInk = measureGlyphBox(context, backLabel, backX, backY, "middle");
  context.fillStyle = emphasis.back == null ? CUE : INK_WARM;
  context.fillText(backLabel, backX, backY);
  paintEmphasisRing(context, detailBackCue(backInk), emphasis.back);
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
    const origin = actionLabelOrigin(labelWidth);
    const ink = measureGlyphBox(context, model.actionLabel, origin.textX, origin.midY, "middle");
    const cue = detailActionCue(ink, labelWidth);
    paintOpenCue(context, cue.chevron, 1, emphasis.action == null ? CUE : AMBER, 2.8);
    context.fillStyle = emphasis.action == null ? CUE : INK_WARM;
    context.fillText(model.actionLabel, cue.textX, origin.midY);
    const actionMark = combineActionMark(emphasis.actionDraw, emphasis.action);
    if (actionMark) {
      paintOpenCue(
        context,
        cue.ring,
        actionMark.progress,
        actionMark.hot ? AMBER : CUE,
        actionMark.hot ? 3.2 : 2.2,
      );
    }
  }
  context.restore();
}
