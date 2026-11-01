import { quadSeg, type ChalkSegment } from "./proposals-board-chalk";
import { pickChalkClip, type ChalkSpan } from "./chalk-mark-sound";

/** Caja de tinta medida. La marca se apoya fuera de este rectángulo. */
export type ChalkBox = { x: number; y: number; width: number; height: number };

export type ChalkMarkDraw = (box: ChalkBox) => ChalkSegment[];

/**
 * Una forma del catálogo.
 * Para añadir otra: una función que devuelva trazos fuera de la caja, y una entrada en `CHALK_MARK_CATALOG`.
 */
export type ChalkMarkDef = {
  id: string;
  /** Cuánto del recorte acompaña al trazo. La animación sigue siendo de 340 ms. */
  sound: ChalkSpan;
  draw: ChalkMarkDraw;
};

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

function wrapExponent(halfW: number, halfH: number, pad: number): number {
  const ax = halfW / (halfW + pad);
  const by = halfH / (halfH + pad);
  let n = 2;
  while (n < 6.5 && ax ** n + by ** n > 0.72) n += 0.2;
  return n;
}

/** Óvalo irregular alrededor del texto. El mismo código de siempre: envuelve sin cruzar. */
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
  const wobbleAmp = 1.45 + hashUnit(seed, 7) * 0.7;
  const wobbleFine = 0.6 + hashUnit(seed, 8) * 0.35;
  const wobbleGrain = 0.32 + hashUnit(seed, 12) * 0.22;
  const lump = 1.05 + hashUnit(seed, 13) * 0.75;
  const phase1 = hashUnit(seed, 9) * Math.PI * 2;
  const phase2 = hashUnit(seed, 10) * Math.PI * 2;
  const phase3 = hashUnit(seed, 15) * Math.PI * 2;
  const phase4 = hashUnit(seed, 16) * Math.PI * 2;
  const phaseW = hashUnit(seed, 11) * Math.PI * 2;
  const phaseW2 = hashUnit(seed, 14) * Math.PI * 2;
  const phaseP = hashUnit(seed, 17) * Math.PI * 2;
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
    const raw =
      Math.sin(2 * theta + phase1) * wobbleAmp +
      Math.sin(3 * theta + phase2) * wobbleFine +
      Math.sin(5 * theta + phase3) * wobbleGrain +
      Math.sin(theta + phase4) * lump +
      (hashUnit(seed, salt) - 0.5) * 0.9;
    const inwardLimit = -1.15;
    const radial = raw < inwardLimit ? inwardLimit + (raw - inwardLimit) * 0.15 : raw;
    const scale = (span + radial) / span;
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
    const wave = 0.5 + 0.5 * Math.sin(t0 * 3 + phaseW);
    const weight = Math.min(1.28, Math.max(0.55, 0.58 + 0.5 * wave + 0.12 * Math.sin(t0 * 5 + phaseW2)));
    const pace = 0.86 + 0.24 * (0.5 + 0.5 * Math.sin(t0 * 2.5 + phaseP));
    const part = quadSeg(p0.x, p0.y, qx, qy, p1.x, p1.y, weight);
    part.pace = pace;
    segments.push(part);
  }
  return segments;
}

type Point = { x: number; y: number };

/** Curva por puntos. El abombamiento solo empuja en `outward`, nunca hacia la tinta. */
function quadsOutward(spine: readonly Point[], seed: number, outward: (mid: Point, bow: number) => Point): ChalkSegment[] {
  const segments: ChalkSegment[] = [];
  const steps = spine.length - 1;
  for (let i = 0; i < steps; i += 1) {
    const p0 = spine[i];
    const p1 = spine[i + 1];
    if (!p0 || !p1) continue;
    const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
    const bow = 0.35 + hashUnit(seed, 40 + i) * 0.85;
    const control = outward(mid, bow);
    const t0 = steps <= 1 ? 0 : i / steps;
    const weight = Math.min(1.28, Math.max(0.55, 0.62 + (i % 3) * 0.22));
    const pace = i % 2 === 0 ? 0.86 : 1.1;
    const phase = t0 * Math.PI * 2 + hashUnit(seed, 7);
    const waved = Math.min(1.28, Math.max(0.55, weight + 0.08 * Math.sin(phase * 3)));
    const part = quadSeg(p0.x, p0.y, control.x, control.y, p1.x, p1.y, waved);
    part.pace = pace;
    segments.push(part);
  }
  return segments;
}

function underlineSpine(box: ChalkBox, seed: number, drop: number): Point[] {
  const y = box.y + box.height + drop;
  const x0 = box.x - 1.5;
  const x1 = box.x + Math.max(box.width, 1) + 3;
  const steps = 6;
  const points: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const wave = Math.sin(t * Math.PI * 2 + hashUnit(seed, 3) * 4) * 0.45;
    const flick = i === steps ? 2.1 : 0;
    points.push({ x: x0 + (x1 - x0) * t, y: y + wave + flick });
  }
  return points;
}

function drawUnderline(box: ChalkBox): ChalkSegment[] {
  const seed = ringSeed(box.x, box.y, box.width, box.height);
  return quadsOutward(underlineSpine(box, seed, 2.6), seed, (mid, bow) => ({ x: mid.x, y: mid.y + bow }));
}

function drawDoubleUnderline(box: ChalkBox): ChalkSegment[] {
  const seed = ringSeed(box.x, box.y, box.width, box.height + 1);
  const first = quadsOutward(underlineSpine(box, seed, 2.4), seed, (mid, bow) => ({ x: mid.x, y: mid.y + bow }));
  const second = quadsOutward(underlineSpine(box, seed + 17, 6.2), seed + 9, (mid, bow) => ({ x: mid.x, y: mid.y + bow }));
  return [...first, ...second];
}

function bracketSide(box: ChalkBox, seed: number, side: -1 | 1): ChalkSegment[] {
  const gap = 4.2;
  const reach = 7;
  const x = side < 0 ? box.x - gap : box.x + box.width + gap;
  const top = box.y - 2.4;
  const bot = box.y + box.height + 2.4;
  const away = side < 0 ? -1 : 1;
  const cap = (y: number): Point[] => [
    { x: x + away * reach, y },
    { x: x + away * reach * 0.45, y: y + side * 0.2 },
    { x, y },
  ];
  const vertical: Point[] = [];
  const steps = 4;
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const wave = Math.sin(t * Math.PI + hashUnit(seed, 5)) * 0.35;
    vertical.push({ x: x + away * wave, y: top + (bot - top) * t });
  }
  const outward = (mid: Point, bow: number) => ({ x: mid.x + away * bow, y: mid.y });
  return [
    ...quadsOutward(cap(top), seed, outward),
    ...quadsOutward(vertical, seed + 3, outward),
    ...quadsOutward(cap(bot).slice().reverse(), seed + 5, outward),
  ];
}

function drawBrackets(box: ChalkBox): ChalkSegment[] {
  const seed = ringSeed(box.x + 2, box.y, box.width, box.height);
  return [...bracketSide(box, seed, -1), ...bracketSide(box, seed + 11, 1)];
}

function drawOval(box: ChalkBox): ChalkSegment[] {
  return chalkRingSegments(box.x, box.y, box.width, box.height);
}

export const CHALK_MARK_CATALOG: readonly ChalkMarkDef[] = [
  { id: "oval", sound: "long", draw: drawOval },
  { id: "underline", sound: "short", draw: drawUnderline },
  { id: "double", sound: "medium", draw: drawDoubleUnderline },
  { id: "brackets", sound: "medium", draw: drawBrackets },
];

export type ChalkMarkId = (typeof CHALK_MARK_CATALOG)[number]["id"];

export function chalkMarkIds(): ChalkMarkId[] {
  return CHALK_MARK_CATALOG.map((mark) => mark.id);
}

export function chalkMarkDef(id: ChalkMarkId): ChalkMarkDef {
  return CHALK_MARK_CATALOG.find((mark) => mark.id === id) ?? CHALK_MARK_CATALOG[0]!;
}

export function chalkMarkSound(id: ChalkMarkId): ChalkSpan {
  return chalkMarkDef(id).sound;
}

/** Trazo de esa forma, estable para la misma caja. */
export function drawChalkMark(id: ChalkMarkId, box: ChalkBox): ChalkSegment[] {
  return chalkMarkDef(id).draw(box);
}

/**
 * Otra forma que la última de ese sitio. La primera vez puede ser cualquiera.
 * `random` en [0, 1).
 */
export function pickChalkMark(last: ChalkMarkId | null, random: () => number): ChalkMarkId {
  const ids = chalkMarkIds();
  const previous = last == null ? -1 : ids.indexOf(last);
  const index = pickChalkClip(ids.length, previous < 0 ? null : previous, random);
  return ids[index] ?? "oval";
}
