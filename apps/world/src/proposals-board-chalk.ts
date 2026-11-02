import { computeRowLayouts, WHITEBOARD_HEIGHT, WHITEBOARD_WIDTH } from "./proposals-board-metrics";

export const CHALK_STROKE = "rgba(244, 239, 228, 0.42)";
export const CHALK_STROKE_DIM = "rgba(244, 239, 228, 0.22)";
/**
 * Verde único de la pizarra. El repintado parcial del carril usa el mismo
 * color: un degradado dejaría un parche plano en cada pulso.
 */
export const BOARD_SLATE = "#184438";
export const SKELETON_ROW_COUNT = 3;
export const LOADING_LOOP_MS = 2200;
export const REVEAL_TOTAL_MS = 780;
export const ANIM_FRAME_MS = 33;

export type ChalkSegment = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  len: number;
  /** Control de una Bézier cuadrática. Sin él, el trazo es recto. */
  qx?: number;
  qy?: number;
  /** Grosor relativo al lineWidth del trazo. 1 si falta. */
  weight?: number;
  /**
   * Tiempo relativo del tramo. 1 si falta: se avanza con la longitud.
   * Por encima de 1 la mano frena; por debajo, acelera.
   */
  pace?: number;
};

export function seg(x1: number, y1: number, x2: number, y2: number): ChalkSegment {
  const len = Math.hypot(x2 - x1, y2 - y1);
  return { x1, y1, x2, y2, len };
}

/** Arco de tiza. La longitud se aproxima muestreando la cuadrática. */
export function quadSeg(
  x1: number,
  y1: number,
  qx: number,
  qy: number,
  x2: number,
  y2: number,
  weight?: number,
): ChalkSegment {
  const steps = 8;
  let len = 0;
  let px = x1;
  let py = y1;
  for (let i = 1; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    const x = u * u * x1 + 2 * u * t * qx + t * t * x2;
    const y = u * u * y1 + 2 * u * t * qy + t * t * y2;
    len += Math.hypot(x - px, y - py);
    px = x;
    py = y;
  }
  return { x1, y1, x2, y2, qx, qy, len, weight };
}

function splitQuadratic(part: ChalkSegment, t: number): { qx: number; qy: number; x2: number; y2: number } {
  const qx = part.qx ?? part.x1;
  const qy = part.qy ?? part.y1;
  const clamped = Math.min(1, Math.max(0, t));
  const mx = part.x1 + (qx - part.x1) * clamped;
  const my = part.y1 + (qy - part.y1) * clamped;
  const nx = qx + (part.x2 - qx) * clamped;
  const ny = qy + (part.y2 - qy) * clamped;
  return {
    qx: mx,
    qy: my,
    x2: mx + (nx - mx) * clamped,
    y2: my + (ny - my) * clamped,
  };
}

function buildSkeletonRowSegments(layoutIndex: number): ChalkSegment[] {
  const layouts = computeRowLayouts(SKELETON_ROW_COUNT);
  const layout = layouts[layoutIndex];
  if (!layout) return [];
  const marginX = 28;
  const trackWidth = WHITEBOARD_WIDTH - marginX * 2;
  const titleY = layout.y + 28;
  const segments: ChalkSegment[] = [];
  segments.push(seg(marginX, titleY, marginX + trackWidth * 0.55, titleY));
  const cy = layout.trackY + layout.trackHeight / 2;
  const step = trackWidth / 6;
  for (let i = 0; i < 6; i += 1) {
    const cx = marginX + step * i + step / 2;
    const d = Math.min(14, layout.trackHeight * 0.45);
    segments.push(seg(cx - d * 0.6, cy - d * 0.6, cx + d * 0.6, cy + d * 0.6));
    segments.push(seg(cx + d * 0.6, cy - d * 0.6, cx + d * 0.6, cy + d * 0.6));
    segments.push(seg(cx + d * 0.6, cy + d * 0.6, cx - d * 0.6, cy + d * 0.6));
    segments.push(seg(cx - d * 0.6, cy + d * 0.6, cx - d * 0.6, cy - d * 0.6));
    if (i < 5) {
      const nx = marginX + step * (i + 1) + step / 2;
      segments.push(seg(cx + d * 0.55, cy, nx - d * 0.55, cy));
    }
  }
  return segments;
}

const SKELETON_ROWS: ChalkSegment[][] = Array.from({ length: SKELETON_ROW_COUNT }, (_, i) =>
  buildSkeletonRowSegments(i),
);

export function skeletonRowTotalLength(rowIndex: number): number {
  const row = SKELETON_ROWS[rowIndex];
  if (!row) return 0;
  let total = 0;
  for (const part of row) total += part.len;
  return total;
}

export function skeletonGrandTotalLength(): number {
  let total = 0;
  for (let i = 0; i < SKELETON_ROW_COUNT; i += 1) total += skeletonRowTotalLength(i);
  return total;
}

/** Progreso 0–1 a lo largo de todos los trazos del esqueleto (para carga). */
export function loadingSkeletonProgress(timeMs: number, reducedMotion: boolean): number {
  if (reducedMotion) return 1;
  const loop = (timeMs % LOADING_LOOP_MS) / LOADING_LOOP_MS;
  const eased = 0.5 - Math.cos(loop * Math.PI * 2) * 0.5;
  return 0.12 + eased * 0.88;
}

/** Progreso 0–1 de aparición de una fila real (índice y filas totales). */
export function revealRowProgress(revealStartMs: number, nowMs: number, rowIndex: number, rowCount: number): number {
  if (rowCount <= 0) return 1;
  const stagger = REVEAL_TOTAL_MS / rowCount;
  const rowStart = revealStartMs + rowIndex * stagger;
  const rowDur = Math.min(stagger * 0.95, REVEAL_TOTAL_MS * 0.45);
  const t = (nowMs - rowStart) / rowDur;
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t * t * (3 - 2 * t);
}

export function revealComplete(revealStartMs: number, nowMs: number, rowCount: number): boolean {
  if (rowCount <= 0) return true;
  return nowMs - revealStartMs >= REVEAL_TOTAL_MS + 40;
}

function drawStraightChalk(
  context: CanvasRenderingContext2D,
  segments: readonly ChalkSegment[],
  progress: number,
  stroke: string,
  lineWidth: number,
) {
  let total = 0;
  for (const part of segments) total += part.len;
  let budget = progress * total;
  context.beginPath();
  for (const part of segments) {
    if (budget <= 0) break;
    if (budget >= part.len) {
      context.moveTo(part.x1, part.y1);
      context.lineTo(part.x2, part.y2);
      budget -= part.len;
      continue;
    }
    const t = part.len > 0 ? budget / part.len : 0;
    context.moveTo(part.x1, part.y1);
    context.lineTo(part.x1 + (part.x2 - part.x1) * t, part.y1 + (part.y2 - part.y1) * t);
    budget = 0;
  }
  context.strokeStyle = stroke;
  context.lineWidth = lineWidth;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.stroke();
}

/** Tiempo que cuesta pintar el tramo. El ritmo de la mano no sigue solo la longitud. */
function segmentCost(part: ChalkSegment): number {
  const pace = part.pace ?? 1;
  return part.len * (pace > 0 ? pace : 1);
}

/** Presión de tiza: el tramo más cargado es más opaco, sin apagar el trazo. */
function pressureAlpha(weight: number | undefined): number {
  if (weight == null) return 1;
  const grip = Math.min(1, Math.max(0, (weight - 0.55) / 0.7));
  return 0.84 + 0.16 * grip;
}

/** Curvas, grosor y opacidad por tramo. Cada pieza se pinta sola. */
function drawVariedChalk(
  context: CanvasRenderingContext2D,
  segments: readonly ChalkSegment[],
  progress: number,
  stroke: string,
  lineWidth: number,
) {
  let total = 0;
  for (const part of segments) total += segmentCost(part);
  let budget = progress * total;
  const previousAlpha = context.globalAlpha;
  context.strokeStyle = stroke;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const part of segments) {
    if (budget <= 0) break;
    const cost = segmentCost(part);
    const take = Math.min(budget, cost);
    const t = cost > 0 ? take / cost : 1;
    context.beginPath();
    context.lineWidth = lineWidth * (part.weight ?? 1);
    context.globalAlpha = previousAlpha * pressureAlpha(part.weight);
    context.moveTo(part.x1, part.y1);
    if (part.qx != null && part.qy != null) {
      if (t >= 0.999) context.quadraticCurveTo(part.qx, part.qy, part.x2, part.y2);
      else {
        const split = splitQuadratic(part, t);
        context.quadraticCurveTo(split.qx, split.qy, split.x2, split.y2);
      }
    } else if (t >= 0.999) {
      context.lineTo(part.x2, part.y2);
    } else {
      context.lineTo(part.x1 + (part.x2 - part.x1) * t, part.y1 + (part.y2 - part.y1) * t);
    }
    context.stroke();
    budget -= take;
  }
  context.globalAlpha = previousAlpha;
}

export function drawChalkSegments(
  context: CanvasRenderingContext2D,
  segments: readonly ChalkSegment[],
  progress: number,
  stroke: string,
  lineWidth: number,
) {
  if (progress <= 0 || segments.length === 0) return;
  const varied = segments.some((part) => part.qx != null || (part.weight != null && part.weight !== 1));
  if (varied) {
    drawVariedChalk(context, segments, progress, stroke, lineWidth);
    return;
  }
  drawStraightChalk(context, segments, progress, stroke, lineWidth);
}

/** Tiza de los dibujos de margen. Más baja que el texto y distinta del ámbar del énfasis. */
export const DOODLE_STROKE = "rgba(244, 239, 228, 0.86)";
/** Polvo del mismo color: ablanda el canto sin tapar el trazo. */
const DOODLE_DUST = "rgba(244, 239, 228, 0.95)";

/**
 * Cuánto tarda la mano en trazar la pareja de dibujos al abrir la vista.
 * Cabecera y pie van seguidos, en el orden de los segmentos.
 */
export const DOODLE_DRAW_MS = 1500;

export type BoardDoodleId = "gatito" | "perrito" | "pajaro" | "caracol" | "avion" | "pez" | "barco";

const HEADER_DOODLES: readonly BoardDoodleId[] = ["gatito", "perrito", "pajaro", "caracol"];
const FOOTER_DOODLES: readonly BoardDoodleId[] = ["avion", "pez", "barco"];

/** Esquina alta derecha: por debajo del título y a la izquierda del «·». */
const HEADER_AT = { x: 742, y: 8 };
/** Pie izquierdo, bajo la última fila y lejos del «+N». */
const FOOTER_AT = { x: 28, y: 514 };

function shift(parts: readonly ChalkSegment[], dx: number, dy: number): ChalkSegment[] {
  return parts.map((part) => ({
    ...part,
    x1: part.x1 + dx,
    y1: part.y1 + dy,
    x2: part.x2 + dx,
    y2: part.y2 + dy,
    qx: part.qx == null ? undefined : part.qx + dx,
    qy: part.qy == null ? undefined : part.qy + dy,
  }));
}

function ink(part: ChalkSegment, weight: number, pace = 1): ChalkSegment {
  part.weight = weight;
  part.pace = pace;
  return part;
}

function line(x1: number, y1: number, x2: number, y2: number, weight = 1, pace = 1): ChalkSegment {
  return ink(seg(x1, y1, x2, y2), weight, pace);
}

function bow(
  x1: number,
  y1: number,
  qx: number,
  qy: number,
  x2: number,
  y2: number,
  weight = 1,
  pace = 1,
): ChalkSegment {
  return ink(quadSeg(x1, y1, qx, qy, x2, y2, weight), weight, pace);
}

function oval(cx: number, cy: number, rx: number, ry: number, weight = 1.2): ChalkSegment[] {
  return [
    bow(cx + rx, cy, cx + rx, cy - ry, cx, cy - ry, weight, 1.05),
    bow(cx, cy - ry, cx - rx, cy - ry, cx - rx, cy, weight),
    bow(cx - rx, cy, cx - rx, cy + ry, cx, cy + ry, weight),
    bow(cx, cy + ry, cx + rx, cy + ry, cx + rx, cy, weight, 0.95),
  ];
}

/**
 * Siluetas en coordenadas locales. La cabecera cabe en y −4…60 y x −42…178;
 * el pie, en y −2…22 y x −12…232. El orden es el de la mano.
 */
function doodleLocal(id: BoardDoodleId): ChalkSegment[] {
  if (id === "gatito") {
    return [
      ...oval(42, 24, 16, 13, 1.28),
      bow(30, 15, 24, 1, 38, 14, 1.15, 0.9),
      bow(44, 14, 52, 0, 58, 15, 1.15, 0.9),
      line(34, 23, 37, 23, 1.45, 0.7),
      line(48, 22, 51, 22, 1.45, 0.7),
      line(41, 28, 38, 31, 1.05, 0.75),
      line(41, 28, 44, 31, 1.05, 0.75),
      bow(38, 32, 42, 36, 48, 31, 0.95, 0.8),
      line(56, 26, 74, 21, 0.62, 0.65),
      line(56, 30, 76, 30, 0.62, 0.65),
      line(56, 33, 72, 37, 0.62, 0.65),
      bow(30, 36, 16, 48, 44, 54, 1.32, 1.1),
      bow(44, 54, 78, 58, 104, 44, 1.32, 1.1),
      bow(104, 44, 98, 32, 58, 34, 1.18),
      line(34, 52, 30, 58, 1.12),
      line(48, 54, 50, 58, 1.12),
      bow(98, 38, 128, 20, 114, 6, 1.22, 1.15),
      bow(114, 6, 102, 2, 110, 14, 1.05, 0.85),
    ];
  }
  if (id === "perrito") {
    return [
      ...oval(40, 22, 15, 12, 1.26),
      bow(32, 12, 14, 6, 16, 24, 1.22, 1),
      bow(16, 24, 12, 40, 30, 36, 1.18, 0.95),
      bow(52, 20, 74, 16, 76, 26, 1.18),
      bow(52, 28, 72, 34, 76, 26, 1.12),
      line(74, 24, 78, 26, 1.4, 0.65),
      line(34, 20, 38, 20, 1.45, 0.7),
      bow(62, 28, 68, 38, 58, 32, 1.05, 0.8),
      bow(28, 32, 16, 48, 46, 54, 1.3, 1.1),
      bow(46, 54, 84, 58, 110, 40, 1.3, 1.1),
      bow(110, 40, 98, 28, 56, 30, 1.16),
      line(40, 52, 36, 58, 1.12),
      line(74, 50, 78, 58, 1.12),
      bow(104, 36, 128, 8, 114, 2, 1.22, 1.1),
      bow(114, 2, 100, 6, 118, 14, 1.05, 0.85),
    ];
  }
  if (id === "pajaro") {
    return [
      ...oval(52, 32, 22, 11, 1.26),
      ...oval(80, 22, 10, 9, 1.22),
      line(88, 20, 108, 16, 1.18, 0.85),
      line(108, 16, 90, 26, 1.12, 0.85),
      line(78, 20, 81, 20, 1.5, 0.65),
      bow(44, 28, 16, 8, 66, 24, 1.24, 1.05),
      bow(46, 34, 26, 44, 70, 34, 1.08),
      line(32, 28, 8, 16, 1.12),
      line(32, 34, 10, 38, 1.05),
      line(46, 42, 42, 54, 1.08),
      line(62, 42, 68, 54, 1.08),
      line(42, 54, 32, 54, 1),
      line(68, 54, 78, 54, 1),
    ];
  }
  if (id === "caracol") {
    return [
      bow(58, 30, 64, 10, 36, 8, 1.38, 1.15),
      bow(36, 8, 8, 10, 12, 30, 1.38, 1.1),
      bow(12, 30, 14, 50, 38, 44, 1.32, 1.05),
      bow(38, 44, 54, 40, 48, 26, 1.2),
      bow(48, 26, 46, 16, 32, 20, 1.12),
      bow(32, 20, 28, 30, 40, 30, 1.05, 0.9),
      bow(48, 36, 82, 46, 116, 34, 1.28, 1.1),
      bow(116, 34, 132, 24, 122, 18, 1.16),
      line(120, 22, 110, 6, 0.78, 0.7),
      line(110, 6, 108, 3, 1.35, 0.55),
      line(124, 22, 136, 8, 0.78, 0.7),
      line(136, 8, 138, 5, 1.35, 0.55),
      line(122, 24, 125, 24, 1.4, 0.6),
      line(46, 44, 118, 42, 0.72, 0.8),
    ];
  }
  if (id === "avion") {
    return [
      bow(8, 10, 86, 6, 168, 8, 1.34, 1.12),
      bow(12, 14, 86, 18, 158, 12, 1.28, 1.08),
      line(168, 8, 158, 12, 1.2),
      line(26, 9, 16, 1, 1.16, 0.85),
      line(16, 1, 42, 8, 1.16, 0.85),
      line(20, 13, 6, 17, 1.05),
      bow(72, 10, 112, 0, 134, 9, 1.36, 1.05),
      bow(76, 13, 114, 16, 132, 11, 1.2),
      bow(126, 8, 146, 1, 158, 8, 1.12, 0.9),
      line(138, 4, 150, 5, 0.75, 0.65),
      line(164, 3, 174, 15, 0.9, 0.7),
    ];
  }
  if (id === "pez") {
    return [
      ...oval(92, 11, 38, 7, 1.3),
      line(54, 11, 24, 2, 1.22),
      line(24, 2, 34, 11, 1.08),
      line(34, 11, 24, 20, 1.08),
      line(24, 20, 54, 11, 1.22),
      bow(80, 5, 100, 0, 118, 5, 1.16),
      bow(82, 17, 102, 21, 120, 16, 1.1),
      line(118, 9, 122, 9, 1.5, 0.6),
      line(128, 10, 136, 13, 0.9, 0.7),
      bow(108, 7, 102, 11, 108, 15, 0.85, 0.75),
    ];
  }
  return [
    bow(6, 13, 80, 21, 158, 12, 1.46, 1.15),
    bow(10, 10, 80, 7, 150, 9, 1.32, 1.05),
    line(10, 10, 6, 13, 1.15),
    line(150, 9, 158, 12, 1.15),
    line(40, 10, 40, 4, 1.12),
    line(40, 4, 58, 4, 1.12),
    line(58, 4, 58, 10, 1.12),
    line(78, 10, 78, 1, 1.18, 0.9),
    bow(80, 2, 118, 0, 124, 9, 1.24, 1),
    line(124, 9, 80, 10, 1.12),
    line(78, 1, 94, 2, 1.05, 0.75),
    line(94, 2, 78, 4, 1.05, 0.75),
    line(28, 13, 33, 13, 1.4, 0.6),
    bow(4, 17, 52, 21, 104, 16, 0.82, 0.85),
    bow(104, 16, 146, 21, 184, 16, 0.82, 0.85),
  ];
}

function doodleAnchor(id: BoardDoodleId): { x: number; y: number } {
  return HEADER_DOODLES.includes(id) ? HEADER_AT : FOOTER_AT;
}

export function doodleSegments(id: BoardDoodleId): ChalkSegment[] {
  const at = doodleAnchor(id);
  return shift(doodleLocal(id), at.x, at.y);
}

let shownDoodles: readonly BoardDoodleId[] = ["gatito", "avion"];
let doodleProgress = 1;
let doodleStartedAt: number | null = null;

function doodleEase(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

/** Empieza el trazo de la pareja actual. Con movimiento reducido aparece ya hecha. */
export function beginBoardDoodleDraw(nowMs: number, reducedMotion: boolean): void {
  if (reducedMotion) {
    doodleStartedAt = null;
    doodleProgress = 1;
    return;
  }
  doodleStartedAt = nowMs;
  doodleProgress = 0;
}

/** Deja la pareja terminada. La escena conserva ese dibujo, no uno a medias. */
export function settleBoardDoodles(): void {
  doodleStartedAt = null;
  doodleProgress = 1;
}

/** Avanza el trazo según el reloj de la pizarra. Al completar, queda en 1. */
export function noteBoardDoodleTime(nowMs: number): number {
  if (doodleStartedAt == null) {
    doodleProgress = 1;
    return 1;
  }
  const t = (nowMs - doodleStartedAt) / DOODLE_DRAW_MS;
  if (t >= 1) {
    doodleStartedAt = null;
    doodleProgress = 1;
    return 1;
  }
  doodleProgress = t <= 0 ? 0 : doodleEase(t);
  return doodleProgress;
}

export function boardDoodleProgress(): number {
  return doodleProgress;
}

export function boardDoodlesSettled(): boolean {
  return doodleStartedAt == null;
}

function pickOne(ids: readonly BoardDoodleId[], random: () => number): BoardDoodleId {
  const index = Math.min(ids.length - 1, Math.floor(random() * ids.length));
  return ids[index]!;
}

/** Nueva pareja al entrar en la vista. El pie y la cabecera no se pisan. */
export function rerollBoardDoodles(random: () => number = Math.random): readonly BoardDoodleId[] {
  shownDoodles = [pickOne(HEADER_DOODLES, random), pickOne(FOOTER_DOODLES, random)];
  return shownDoodles;
}

export function boardDoodleIds(): readonly BoardDoodleId[] {
  return shownDoodles;
}

export function boardDoodleSegments(): ChalkSegment[] {
  return shownDoodles.flatMap((id) => doodleSegments(id));
}

/** Subrayado corto bajo «Tablón». No cruza el ancho: es un gesto, no una regla. */
export function titleChalkSwash(): ChalkSegment[] {
  return [quadSeg(36, 64, 96, 56, 154, 66)];
}

/** Figura de margen: canto de tiza y un polvo corto, sin grano que rompa la silueta. */
function paintDoodleChalk(
  context: CanvasRenderingContext2D,
  segments: readonly ChalkSegment[],
  progress: number,
) {
  if (progress <= 0 || segments.length === 0) return;
  const alpha = context.globalAlpha;
  const blur = context.shadowBlur;
  const shadow = context.shadowColor;
  context.shadowColor = DOODLE_DUST;
  context.shadowBlur = 1.7;
  context.globalAlpha = alpha;
  drawChalkSegments(context, segments, progress, DOODLE_STROKE, 2.45);
  context.globalAlpha = alpha;
  context.shadowBlur = blur;
  context.shadowColor = shadow;
}

/**
 * Trazo que señala un clic. Misma geometría y el mismo avance: solo el cuerpo
 * de la tiza (grosor, polvo y grano). El polvo es una sombra corta para no
 * comerse la tinta.
 */
export function paintCueChalk(
  context: CanvasRenderingContext2D,
  segments: readonly ChalkSegment[],
  progress: number,
  stroke: string,
  lineWidth: number,
) {
  if (progress <= 0 || segments.length === 0) return;
  const alpha = context.globalAlpha;
  const blur = context.shadowBlur;
  const shadow = context.shadowColor;
  context.shadowColor = stroke;
  context.shadowBlur = Math.max(1.35, lineWidth * 0.48);
  context.globalAlpha = alpha * 0.94;
  drawChalkSegments(context, segments, progress, stroke, lineWidth * 1.12);
  context.shadowBlur = 0;
  context.globalAlpha = alpha * 0.4;
  context.setLineDash([2.4, 1.55]);
  context.lineDashOffset = 0.85;
  drawChalkSegments(context, segments, progress, stroke, lineWidth * 0.9);
  context.setLineDash([]);
  context.lineDashOffset = 0;
  context.globalAlpha = alpha;
  context.shadowBlur = blur;
  context.shadowColor = shadow;
}

export function paintWhiteboardFrame(context: CanvasRenderingContext2D) {
  context.fillStyle = BOARD_SLATE;
  context.fillRect(0, 0, WHITEBOARD_WIDTH, WHITEBOARD_HEIGHT);
  paintDoodleChalk(context, boardDoodleSegments(), doodleProgress);
}

export function paintSkeletonBoard(
  context: CanvasRenderingContext2D,
  timeMs: number,
  reducedMotion: boolean,
  headerDone: boolean,
) {
  paintWhiteboardFrame(context);
  context.fillStyle = "#f4efe4";
  context.font = "700 36px sans-serif";
  context.textAlign = "left";
  context.textBaseline = "alphabetic";
  if (headerDone || reducedMotion) {
    context.fillText("Tablón", 32, 46);
    drawChalkSegments(context, titleChalkSwash(), 1, CHALK_STROKE, 2.2);
  } else {
    drawChalkSegments(context, [seg(32, 46, 170, 46)], loadingSkeletonProgress(timeMs, false) * 0.4, CHALK_STROKE, 3);
  }
  const progress = loadingSkeletonProgress(timeMs, reducedMotion);
  let offset = 0;
  const grand = skeletonGrandTotalLength();
  for (let i = 0; i < SKELETON_ROW_COUNT; i += 1) {
    const rowLen = skeletonRowTotalLength(i);
    const rowProgress = Math.max(0, Math.min(1, (progress * grand - offset) / rowLen));
    drawChalkSegments(context, SKELETON_ROWS[i]!, rowProgress, CHALK_STROKE, 2.5);
    offset += rowLen;
  }
}

export function paintEmptyChalkIcon(context: CanvasRenderingContext2D, centerX: number, centerY: number) {
  const segments = [
    seg(centerX - 28, centerY + 8, centerX + 28, centerY + 8),
    seg(centerX - 22, centerY + 8, centerX - 14, centerY - 22),
    seg(centerX + 22, centerY + 8, centerX + 14, centerY - 22),
    seg(centerX - 14, centerY - 22, centerX + 14, centerY - 22),
    seg(centerX, centerY - 22, centerX, centerY - 32),
  ];
  drawChalkSegments(context, segments, 1, CHALK_STROKE, 2.5);
}

export function paintRetryChalk(context: CanvasRenderingContext2D, timeMs: number, x: number, y: number) {
  const pulse = 0.5 + Math.sin((timeMs / 1000) * Math.PI * 2) * 0.35;
  context.strokeStyle = `rgba(255, 183, 3, ${0.35 + pulse * 0.35})`;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, 14, 0.3, Math.PI * 1.85);
  context.stroke();
  context.beginPath();
  context.moveTo(x + 12, y - 4);
  context.lineTo(x + 16, y - 10);
  context.lineTo(x + 8, y - 8);
  context.stroke();
}

export { SKELETON_ROWS };
