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
export const DOODLE_STROKE = "rgba(244, 239, 228, 0.62)";

export type BoardDoodleId = "gatito" | "perrito" | "pajaro" | "caracol" | "avion" | "pez" | "barco";

const HEADER_DOODLES: readonly BoardDoodleId[] = ["gatito", "perrito", "pajaro", "caracol"];
const FOOTER_DOODLES: readonly BoardDoodleId[] = ["avion", "pez", "barco"];

/** Esquina alta derecha: por debajo del título y a la izquierda del «·». */
const HEADER_AT = { x: 742, y: 8 };
/** Pie izquierdo, bajo la última fila y lejos del «+N». */
const FOOTER_AT = { x: 28, y: 514 };

function shift(parts: readonly ChalkSegment[], dx: number, dy: number): ChalkSegment[] {
  return parts.map((part) => {
    const next: ChalkSegment = {
      x1: part.x1 + dx,
      y1: part.y1 + dy,
      x2: part.x2 + dx,
      y2: part.y2 + dy,
      len: part.len,
    };
    if (part.qx != null && part.qy != null) {
      next.qx = part.qx + dx;
      next.qy = part.qy + dy;
    }
    return next;
  });
}

function oval(cx: number, cy: number, rx: number, ry: number): ChalkSegment[] {
  return [
    quadSeg(cx + rx, cy, cx + rx, cy - ry, cx, cy - ry),
    quadSeg(cx, cy - ry, cx - rx, cy - ry, cx - rx, cy),
    quadSeg(cx - rx, cy, cx - rx, cy + ry, cx, cy + ry),
    quadSeg(cx, cy + ry, cx + rx, cy + ry, cx + rx, cy),
  ];
}

function doodleLocal(id: BoardDoodleId): ChalkSegment[] {
  if (id === "gatito") {
    return [
      ...oval(46, 24, 16, 14),
      seg(34, 14, 40, 2),
      seg(40, 2, 48, 12),
      seg(48, 12, 56, 2),
      seg(56, 2, 60, 14),
      seg(40, 24, 42, 24),
      seg(52, 24, 54, 24),
      seg(46, 28, 44, 32),
      seg(46, 28, 48, 32),
      seg(30, 28, 14, 26),
      seg(62, 28, 76, 26),
      quadSeg(58, 32, 86, 28, 112, 36),
      quadSeg(60, 38, 88, 48, 108, 40),
      seg(78, 46, 76, 52),
      seg(96, 44, 98, 52),
      quadSeg(112, 34, 136, 16, 118, 8),
    ];
  }
  if (id === "perrito") {
    return [
      ...oval(50, 24, 15, 13),
      quadSeg(38, 16, 18, 22, 28, 40),
      seg(58, 14, 66, 4),
      seg(66, 4, 62, 16),
      seg(44, 24, 46, 24),
      seg(56, 24, 58, 24),
      seg(50, 28, 48, 32),
      seg(50, 32, 52, 38),
      quadSeg(62, 30, 92, 26, 120, 34),
      quadSeg(64, 36, 94, 46, 116, 38),
      seg(82, 44, 80, 52),
      seg(104, 42, 106, 52),
      quadSeg(120, 32, 142, 20, 128, 12),
    ];
  }
  if (id === "pajaro") {
    return [
      ...oval(48, 30, 22, 12),
      ...oval(78, 20, 10, 9),
      seg(86, 18, 104, 16),
      seg(104, 16, 88, 22),
      seg(76, 18, 78, 18),
      quadSeg(40, 26, 28, 8, 58, 22),
      seg(40, 40, 36, 52),
      seg(58, 40, 62, 52),
    ];
  }
  if (id === "caracol") {
    return [
      ...oval(40, 24, 16, 14),
      quadSeg(32, 26, 24, 34, 36, 30),
      quadSeg(52, 34, 86, 42, 118, 32),
      seg(104, 30, 100, 14),
      seg(100, 14, 106, 12),
      seg(112, 30, 118, 12),
      seg(118, 12, 124, 14),
    ];
  }
  if (id === "avion") {
    return [
      quadSeg(8, 12, 90, 8, 168, 12),
      quadSeg(20, 14, 90, 18, 150, 14),
      seg(78, 10, 108, 2),
      seg(108, 2, 118, 12),
      seg(16, 12, 4, 2),
      seg(4, 2, 24, 10),
      seg(150, 12, 156, 12),
    ];
  }
  if (id === "pez") {
    return [
      ...oval(78, 12, 36, 9),
      seg(42, 12, 18, 2),
      seg(18, 2, 24, 12),
      seg(24, 12, 18, 20),
      seg(18, 20, 42, 12),
      seg(96, 10, 98, 10),
      seg(70, 6, 86, 2),
    ];
  }
  return [
    quadSeg(8, 14, 80, 20, 150, 12),
    seg(8, 14, 150, 12),
    seg(70, 14, 70, 2),
    seg(70, 4, 98, 12),
    seg(98, 12, 70, 14),
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

export function paintWhiteboardFrame(context: CanvasRenderingContext2D) {
  context.fillStyle = BOARD_SLATE;
  context.fillRect(0, 0, WHITEBOARD_WIDTH, WHITEBOARD_HEIGHT);
  drawChalkSegments(context, boardDoodleSegments(), 1, DOODLE_STROKE, 2);
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
