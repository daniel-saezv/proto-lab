import { BufferAttribute, BufferGeometry, Vector3, type PerspectiveCamera } from "three";
import { workshopTableClear } from "./workshop-cinematic";
import type { WorkshopTrailMark } from "./workshop-view";

/** Un trazo en la cuadrícula del glifo (x 0–4, y 0–6). */
type Stroke = readonly [number, number, number, number];

/**
 * Fuente de trazos: pocos segmentos por letra para caber en el presupuesto.
 * Mayúsculas y tildes se pliegan aquí.
 */
const FONT: Record<string, readonly Stroke[]> = {
  a: [[0.3, 2.3, 2.6, 2.3], [2.6, 0.2, 2.6, 2.7], [0.3, 0.2, 2.6, 0.2], [0.3, 0.2, 0.3, 2.3]],
  b: [[0.4, 0.2, 0.4, 5.4], [0.4, 2.4, 2.6, 2.4], [2.6, 0.2, 2.6, 2.4], [0.4, 0.2, 2.6, 0.2]],
  c: [[2.5, 2.2, 0.4, 2.2], [0.4, 0.2, 0.4, 2.2], [0.4, 0.2, 2.5, 0.2]],
  d: [[2.5, 0.2, 2.5, 5.4], [0.4, 2.4, 2.5, 2.4], [0.4, 0.2, 0.4, 2.4], [0.4, 0.2, 2.5, 0.2]],
  e: [[0.3, 1.2, 2.6, 1.2], [2.6, 1.2, 2.6, 2.4], [0.3, 2.4, 2.6, 2.4], [0.3, 0.2, 0.3, 2.4], [0.3, 0.2, 2.4, 0.2]],
  f: [[1.2, 0.2, 1.2, 5.2], [1.2, 5.2, 2.6, 5.2], [0.5, 3.2, 2.2, 3.2]],
  g: [[0.3, 2.4, 2.6, 2.4], [2.6, -1.2, 2.6, 2.4], [0.3, 0.2, 2.6, 0.2], [0.3, 0.2, 0.3, 2.4], [0.3, -1.2, 2.6, -1.2]],
  h: [[0.4, 0.2, 0.4, 5.4], [0.4, 2.4, 2.6, 2.4], [2.6, 0.2, 2.6, 2.4]],
  i: [[1.3, 0.2, 1.3, 2.4], [1.3, 3.2, 1.3, 3.7]],
  j: [[1.6, -1.2, 1.6, 2.4], [0.3, -1.2, 1.6, -1.2], [1.6, 3.2, 1.6, 3.7]],
  k: [[0.4, 0.2, 0.4, 5.4], [2.6, 2.5, 0.4, 1.2], [0.9, 1.2, 2.6, 0.2]],
  l: [[1.2, 0.2, 1.2, 5.4]],
  m: [[0.2, 0.2, 0.2, 2.5], [0.2, 2.5, 1.5, 1.3], [1.5, 1.3, 2.8, 2.5], [2.8, 2.5, 4.1, 1.3], [4.1, 0.2, 4.1, 2.5]],
  n: [[0.3, 0.2, 0.3, 2.5], [0.3, 2.5, 2.6, 0.2], [2.6, 0.2, 2.6, 2.5]],
  o: [[0.4, 1.3, 1.5, 2.5], [1.5, 2.5, 2.6, 1.3], [2.6, 1.3, 1.5, 0.2], [1.5, 0.2, 0.4, 1.3]],
  p: [[0.4, -1.2, 0.4, 2.5], [0.4, 2.5, 2.6, 2.5], [2.6, 0.2, 2.6, 2.5], [0.4, 0.2, 2.6, 0.2]],
  q: [[2.6, -1.2, 2.6, 2.5], [0.4, 2.5, 2.6, 2.5], [0.4, 0.2, 0.4, 2.5], [0.4, 0.2, 2.6, 0.2]],
  r: [[0.4, 0.2, 0.4, 2.5], [0.4, 2.2, 2.4, 2.5]],
  s: [[2.5, 2.3, 0.4, 2.3], [0.4, 1.2, 0.4, 2.3], [0.4, 1.2, 2.5, 1.2], [2.5, 0.2, 2.5, 1.2], [0.4, 0.2, 2.5, 0.2]],
  t: [[0.6, 4.2, 2.4, 4.2], [1.5, 0.2, 1.5, 4.2], [1.5, 0.2, 2.5, 0.2]],
  u: [[0.4, 2.5, 0.4, 0.4], [0.4, 0.4, 2.6, 0.4], [2.6, 0.2, 2.6, 2.5]],
  v: [[0.2, 2.5, 1.5, 0.2], [1.5, 0.2, 2.8, 2.5]],
  w: [[0.2, 2.5, 1.1, 0.2], [1.1, 0.2, 2.1, 1.8], [2.1, 1.8, 3.1, 0.2], [3.1, 0.2, 4.0, 2.5]],
  x: [[0.3, 2.5, 2.6, 0.2], [2.6, 2.5, 0.3, 0.2]],
  y: [[0.3, 2.5, 1.5, 1.0], [2.7, 2.5, 0.6, -1.2]],
  z: [[0.3, 2.5, 2.6, 2.5], [2.6, 2.5, 0.3, 0.2], [0.3, 0.2, 2.6, 0.2]],
  ñ: [[0.6, 3.3, 2.2, 3.6], [0.3, 0.2, 0.3, 2.5], [0.3, 2.5, 2.6, 0.2], [2.6, 0.2, 2.6, 2.5]],
  "0": [[0.5, 0.3, 0.5, 4.6], [0.5, 4.6, 2.4, 4.6], [2.4, 0.3, 2.4, 4.6], [0.5, 0.3, 2.4, 0.3]],
  "1": [[1.0, 3.6, 1.6, 4.6], [1.6, 0.2, 1.6, 4.6], [0.8, 0.2, 2.4, 0.2]],
  "2": [[0.4, 4.2, 2.4, 4.6], [2.4, 2.4, 2.4, 4.6], [0.4, 2.4, 2.4, 2.4], [0.4, 0.2, 0.4, 2.4], [0.4, 0.2, 2.6, 0.2]],
  "3": [[0.4, 4.4, 2.4, 4.4], [2.4, 2.4, 2.4, 4.4], [0.6, 2.4, 2.4, 2.4], [2.4, 0.2, 2.4, 2.4], [0.4, 0.2, 2.4, 0.2]],
  "4": [[2.2, 0.2, 2.2, 4.6], [0.3, 1.6, 2.6, 1.6], [0.3, 1.6, 2.0, 4.4]],
  "5": [[0.4, 4.6, 2.6, 4.6], [0.4, 2.4, 0.4, 4.6], [0.4, 2.4, 2.4, 2.4], [2.4, 0.2, 2.4, 2.4], [0.4, 0.2, 2.4, 0.2]],
  "6": [[2.2, 4.4, 0.5, 2.6], [0.5, 0.2, 0.5, 2.6], [0.5, 0.2, 2.4, 0.2], [2.4, 0.2, 2.4, 2.0], [0.5, 2.0, 2.4, 2.0]],
  "7": [[0.3, 4.6, 2.6, 4.6], [2.6, 4.6, 1.1, 0.2]],
  "8": [[0.5, 2.4, 0.5, 4.5], [0.5, 4.5, 2.4, 4.5], [2.4, 2.4, 2.4, 4.5], [0.5, 2.4, 2.4, 2.4], [0.5, 0.2, 0.5, 2.4], [0.5, 0.2, 2.4, 0.2], [2.4, 0.2, 2.4, 2.4]],
  "9": [[2.4, 0.4, 2.4, 4.5], [0.5, 2.4, 0.5, 4.5], [0.5, 4.5, 2.4, 4.5], [0.5, 2.4, 2.4, 2.4]],
  "?": [[0.4, 4.2, 2.2, 4.8], [2.2, 3.0, 2.2, 4.8], [0.8, 2.2, 2.2, 3.0], [1.4, 0.8, 1.4, 1.6], [1.4, 0.1, 1.4, 0.45]],
  "¿": [[2.6, 0.4, 0.8, -0.2], [0.8, 1.6, 0.8, -0.2], [2.2, 2.4, 0.8, 1.6], [1.6, 3.6, 1.6, 4.4], [1.6, 4.8, 1.6, 5.15]],
  "!": [[1.5, 1.4, 1.5, 5.2], [1.5, 0.1, 1.5, 0.55]],
  "¡": [[1.5, 0.2, 1.5, 4.0], [1.5, 4.7, 1.5, 5.15]],
  ".": [[1.3, 0.1, 1.3, 0.45]],
  ",": [[1.5, 0.5, 1.1, -0.5]],
  ":": [[1.4, 0.3, 1.4, 0.6], [1.4, 1.8, 1.4, 2.1]],
  ";": [[1.4, 1.8, 1.4, 2.1], [1.5, 0.5, 1.1, -0.4]],
  "-": [[0.4, 1.3, 2.4, 1.3]],
  "'": [[1.4, 3.4, 1.2, 2.6]],
  '"': [[0.8, 3.6, 0.6, 2.6], [1.8, 3.6, 1.6, 2.6]],
  "(": [[2.0, 5.0, 1.0, 2.6], [1.0, 0.2, 2.0, -0.6]],
  ")": [[1.0, 5.0, 2.0, 2.6], [2.0, 0.2, 1.0, -0.6]],
};

const ACCENT: Record<string, string> = {
  á: "a",
  é: "e",
  í: "i",
  ó: "o",
  ú: "u",
  ü: "u",
};

export type WorkshopIdeaRole = "now" | "past";

export type WorkshopIdeaMesh = {
  id: string;
  text: string;
  role: WorkshopIdeaRole;
  picked: boolean;
};

export type CloudSlot = {
  ndcX: number;
  ndcY: number;
  depth: number;
  /** Diámetro en metros. La geometría cabe en 1×1. */
  scale: number;
};

const COLS = 18;
const ADVANCE = 3.15;
const LINE = 7.4;
/** Tope de una idea de 120 caracteres con esta fuente. 12 ideas quedan bajo 40k con la sala. */
export const IDEA_TRIANGLE_CAP = 3400;

export function workshopIdeaMeshes(
  options: readonly string[],
  picked: ReadonlySet<string>,
  trail: readonly WorkshopTrailMark[],
): WorkshopIdeaMesh[] {
  const past: WorkshopIdeaMesh[] = [];
  for (const mark of trail) {
    mark.ideas.forEach((text, index) => {
      const clean = text.trim();
      if (!clean) return;
      past.push({ id: `past-${mark.round}-${index}`, text: clean, role: "past", picked: true });
    });
  }
  const now = options.map((text, index) => ({
    id: `now-${index}`,
    text,
    role: "now" as const,
    picked: picked.has(text),
  }));
  return [...past, ...now];
}

function glyphStrokes(char: string): readonly Stroke[] {
  const lower = char.toLocaleLowerCase("es");
  if (FONT[lower]) return FONT[lower];
  const base = ACCENT[lower];
  if (!base || !FONT[base]) return FONT["?"] ?? [];
  const accent: Stroke = lower === "ü" ? [0.5, 3.5, 2.2, 3.5] : [0.6, 3.2, 2.0, 3.7];
  return [...FONT[base], accent];
}

function advanceOf(char: string): number {
  if (char === " ") return 1.7;
  const lower = char.toLocaleLowerCase("es");
  if (lower === "m" || lower === "w") return 4.5;
  if ("ilí¡!.,'".includes(lower) || char === "í") return 1.7;
  return ADVANCE;
}

function wrapIdea(text: string): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && next.length > COLS) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [""];
}

type Seg = { ax: number; ay: number; bx: number; by: number };

function layoutStrokes(text: string): Seg[] {
  const lines = wrapIdea(text);
  const segs: Seg[] = [];
  lines.forEach((line, row) => {
    let x = 0;
    const y = (lines.length - 1 - row) * LINE;
    for (const char of line) {
      if (char !== " ") {
        for (const stroke of glyphStrokes(char)) {
          segs.push({ ax: x + stroke[0], ay: y + stroke[1], bx: x + stroke[2], by: y + stroke[3] });
        }
      }
      x += advanceOf(char);
    }
  });
  return segs;
}

function pushTri(out: number[], ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number) {
  out.push(ax, ay, az, bx, by, bz, cx, cy, cz);
}

/** Caja abierta (frente, dorso y cantos largos): 8 triángulos. */
function pushSlab(out: number[], ax: number, ay: number, bx: number, by: number, half: number, z0: number, z1: number) {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy) || 1;
  const px = (-dy / len) * half;
  const py = (dx / len) * half;
  const p = [
    [ax + px, ay + py],
    [bx + px, by + py],
    [bx - px, by - py],
    [ax - px, ay - py],
  ];
  pushTri(out, p[0][0], p[0][1], z1, p[1][0], p[1][1], z1, p[2][0], p[2][1], z1);
  pushTri(out, p[0][0], p[0][1], z1, p[2][0], p[2][1], z1, p[3][0], p[3][1], z1);
  pushTri(out, p[0][0], p[0][1], z0, p[2][0], p[2][1], z0, p[1][0], p[1][1], z0);
  pushTri(out, p[0][0], p[0][1], z0, p[3][0], p[3][1], z0, p[2][0], p[2][1], z0);
  pushTri(out, p[0][0], p[0][1], z1, p[1][0], p[1][1], z1, p[1][0], p[1][1], z0);
  pushTri(out, p[0][0], p[0][1], z1, p[1][0], p[1][1], z0, p[0][0], p[0][1], z0);
  pushTri(out, p[3][0], p[3][1], z1, p[3][0], p[3][1], z0, p[2][0], p[2][1], z0);
  pushTri(out, p[3][0], p[3][1], z1, p[2][0], p[2][1], z0, p[2][0], p[2][1], z1);
}

/** La nube y las letras caben en 1×1: el hueco de pantalla manda el tamaño. */
function fitUnitSquare(positions: Float32Array) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < positions.length; index += 3) {
    minX = Math.min(minX, positions[index] ?? 0);
    maxX = Math.max(maxX, positions[index] ?? 0);
    minY = Math.min(minY, positions[index + 1] ?? 0);
    maxY = Math.max(maxY, positions[index + 1] ?? 0);
  }
  const span = Math.max(0.001, maxX - minX, maxY - minY);
  const scale = 0.96 / span;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  for (let index = 0; index < positions.length; index += 3) {
    positions[index] = ((positions[index] ?? 0) - cx) * scale;
    positions[index + 1] = ((positions[index + 1] ?? 0) - cy) * scale;
  }
}

function pushDisc(out: number[], cx: number, cy: number, z: number, rx: number, ry: number) {
  const sides = 10;
  for (let i = 0; i < sides; i += 1) {
    const a0 = (i / sides) * Math.PI * 2;
    const a1 = ((i + 1) / sides) * Math.PI * 2;
    pushTri(out, cx, cy, z, cx + Math.cos(a0) * rx, cy + Math.sin(a0) * ry, z, cx + Math.cos(a1) * rx, cy + Math.sin(a1) * ry, z);
  }
}

/** Una sola geometría: la nube y las letras, con las letras al final. */
export function buildIdeaGeometry(text: string): BufferGeometry {
  const segs = layoutStrokes(text.trim() || "?");
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const seg of segs) {
    minX = Math.min(minX, seg.ax, seg.bx);
    minY = Math.min(minY, seg.ay, seg.by);
    maxX = Math.max(maxX, seg.ax, seg.bx);
    maxY = Math.max(maxY, seg.ay, seg.by);
  }
  const width = Math.max(0.001, maxX - minX);
  const height = Math.max(0.001, maxY - minY);
  const fit = Math.min(0.92 / width, 0.62 / height);
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const mapX = (x: number) => (x - cx) * fit;
  const mapY = (y: number) => (y - cy) * fit;
  const half = 0.12 * fit;

  const cloud: number[] = [];
  const padX = Math.max(0.34, width * fit * 0.56 + 0.08);
  const padY = Math.max(0.22, height * fit * 0.58 + 0.07);
  pushDisc(cloud, 0, -0.02, -0.04, padX, padY * 0.92);
  pushDisc(cloud, -padX * 0.46, padY * 0.62, -0.05, padX * 0.42, padY * 0.4);
  pushDisc(cloud, padX * 0.38, padY * 0.7, -0.05, padX * 0.34, padY * 0.34);

  const letters: number[] = [];
  for (const seg of segs) {
    pushSlab(letters, mapX(seg.ax), mapY(seg.ay), mapX(seg.bx), mapY(seg.by), half, 0.02, 0.045);
  }
  const positions = new Float32Array(cloud.length + letters.length);
  positions.set(cloud, 0);
  positions.set(letters, cloud.length);
  fitUnitSquare(positions);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  const colors = new Float32Array(positions.length);
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
  geometry.userData.cloudVerts = cloud.length / 3;
  paintIdeaColors(geometry, "now", false);
  return geometry;
}

export function ideaTriangleCount(geometry: BufferGeometry): number {
  const position = geometry.getAttribute("position");
  return position ? position.count / 3 : 0;
}

const INK_NOW: readonly [number, number, number] = [0.11, 0.08, 0.05];
const INK_PAST: readonly [number, number, number] = [0.28, 0.26, 0.24];
const CLOUD_NOW: readonly [number, number, number] = [0.9, 0.94, 1];
const CLOUD_PICK: readonly [number, number, number] = [1, 0.74, 0.16];
const CLOUD_PAST: readonly [number, number, number] = [0.5, 0.54, 0.62];

export function paintIdeaColors(geometry: BufferGeometry, role: WorkshopIdeaRole, picked: boolean) {
  const color = geometry.getAttribute("color") as BufferAttribute;
  const cloudVerts = Number(geometry.userData.cloudVerts) || 0;
  const cloud = picked ? CLOUD_PICK : role === "past" ? CLOUD_PAST : CLOUD_NOW;
  const ink = role === "past" ? INK_PAST : INK_NOW;
  for (let i = 0; i < color.count; i += 1) {
    const tone = i < cloudVerts ? cloud : ink;
    color.setXYZ(i, tone[0], tone[1], tone[2]);
  }
  color.needsUpdate = true;
}

function worldSpan(fovDeg: number, depth: number, ndcSpan: number): number {
  const full = 2 * Math.tan((fovDeg * Math.PI) / 360) * depth;
  return full * (ndcSpan / 2);
}

function slotScale(fovDeg: number, depth: number, ndcSpan: number, prominence: number): number {
  return Math.max(0.08, worldSpan(fovDeg, depth, ndcSpan) * prominence);
}

/**
 * Huecos en el encuadre libre, por encima del panel y delante de la mesa.
 * La cara queda entre las nubes. Las de antes van más arriba, más lejos y más pequeñas.
 */
export function layoutCloudSlots(nowCount: number, pastCount: number, aspect: number, fovDeg: number): {
  now: CloudSlot[];
  past: CloudSlot[];
} {
  const panel = 1 - 2 * workshopTableClear(aspect);
  const wide = aspect >= 1.15;
  const nowDepth = aspect > 1.7 ? 1.05 : wide ? 1.22 : 0.96;
  const pastDepth = wide ? 1.68 : 1.42;
  const nowSpan = aspect > 1.7 ? 0.7 : wide ? 0.32 : 0.28;
  const now = wide
    ? placeRow(nowCount, -0.78, 0.78, panel + (aspect > 1.7 ? 0.5 : 0.34), nowDepth, fovDeg, 1, nowSpan, aspect)
    : placeGrid(nowCount, 2, -0.76, 0.76, panel + 0.06, 0.86, nowDepth, fovDeg, 1, nowSpan, aspect);
  const nowTop = now.reduce((max, slot) => Math.max(max, slot.ndcY), panel + 0.4);
  const pastCols = Math.min(wide ? 6 : 4, Math.max(pastCount, 1));
  const pastRows = Math.ceil(pastCount / pastCols);
  const pastBottom = Math.min(0.9, nowTop + (aspect > 1.7 ? 0.32 : 0.18));
  const pastTop = Math.min(0.94, pastBottom + Math.max(0, pastRows - 1) * 0.14);
  const past = placeGrid(pastCount, pastCols, -0.74, 0.74, pastBottom, pastTop, pastDepth, fovDeg, 0.62, nowSpan * 0.72, aspect);
  return { now, past };
}

/** El ancho en pantalla cabe en la celda: el alto NDC no es el ancho NDC. */
function fitSpan(cellW: number, cellH: number, aspect: number, cap: number): number {
  return Math.max(0.12, Math.min(cap, cellH * 0.9, cellW * aspect * 0.9));
}

function placeRow(
  count: number,
  x0: number,
  x1: number,
  y: number,
  depth: number,
  fovDeg: number,
  prominence: number,
  spanCap: number,
  aspect: number,
): CloudSlot[] {
  return placeGrid(count, Math.max(count, 1), x0, x1, y, y, depth, fovDeg, prominence, spanCap, aspect);
}

function placeGrid(
  count: number,
  columns: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  depth: number,
  fovDeg: number,
  prominence: number,
  spanCap: number,
  aspect: number,
): CloudSlot[] {
  if (count <= 0) return [];
  const cols = Math.max(1, Math.min(columns, count));
  const rows = Math.ceil(count / cols);
  const cellW = (x1 - x0) / cols;
  const cellH = rows <= 1 ? Math.max(0.34, spanCap / 0.85) : (y1 - y0) / rows;
  const span = fitSpan(cellW, cellH, aspect, spanCap);
  const slots: CloudSlot[] = [];
  for (let index = 0; index < count; index += 1) {
    const col = index % cols;
    const row = Math.floor(index / cols);
    const ndcX = x0 + ((col + 0.5) / cols) * (x1 - x0);
    const ndcY = rows <= 1 ? y0 : y1 - ((row + 0.5) / rows) * (y1 - y0);
    slots.push({ ndcX, ndcY, depth, scale: slotScale(fovDeg, depth, span, prominence) });
  }
  return slots;
}

/** Punto de la escena a `depth` metros de la cámara, en el NDC del hueco. */
export function cloudAnchor(camera: PerspectiveCamera, slot: CloudSlot, target: Vector3): Vector3 {
  target.set(slot.ndcX, slot.ndcY, 0.5).unproject(camera);
  target.sub(camera.position).normalize();
  return camera.position.clone().addScaledVector(target, slot.depth);
}
