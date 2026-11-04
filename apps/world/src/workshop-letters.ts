import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
  type PerspectiveCamera,
} from "three";
import type { WorkshopTrailMark } from "./workshop-view";

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
  /** Ancho en metros. La nube actual es redonda; el alto de una idea pasada es este ancho partido del aspecto. */
  scale: number;
  aspect: number;
};

/** Lienzo de la nube actual: texto grande y nube ancha. */
export const IDEA_CANVAS = { width: 768, height: 512 } as const;
/** Lienzo de una idea ya elegida: una línea, sin nube. */
export const PAST_CANVAS = { width: 640, height: 160 } as const;

const PAST_ASPECT = PAST_CANVAS.width / PAST_CANVAS.height;

/**
 * Una sola superficie: la envolvente de los lóbulos. Cuatro nubes, con su halo,
 * más la sala del primer plano siguen por debajo de 40k triángulos.
 */
export const IDEA_TRIANGLE_CAP = 8_000;

/** El texto vive en la franja superior del lienzo. El borde de esa franja es blanco. */
const PLATE_V0 = 0.22;

const IDEA_FONT = '"Segoe UI", "Trebuchet MS", "Liberation Sans", "DejaVu Sans", sans-serif';

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

export function ideaPalette(role: WorkshopIdeaRole, picked: boolean): { ink: string; cloud: string; glow: string } {
  if (role === "past") return { ink: "#d9d3c7", cloud: "transparent", glow: "transparent" };
  return {
    ink: "#1a1208",
    cloud: "#fffdf8",
    glow: picked ? "#ffc430" : "transparent",
  };
}

export function ideaCanvasSize(role: WorkshopIdeaRole): { width: number; height: number } {
  return role === "past" ? PAST_CANVAS : IDEA_CANVAS;
}

/** Nube blanca y texto oscuro en negrita, o la idea ya elegida en letra clara. */
export function paintIdeaCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  role: WorkshopIdeaRole,
  picked: boolean,
): void {
  const { width, height } = ideaCanvasSize(role);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  const palette = ideaPalette(role, picked);
  if (role === "now") {
    const faceBottom = Math.round(height * (1 - PLATE_V0));
    context.fillStyle = palette.cloud;
    context.fillRect(0, 0, width, height);
    drawLabel(context, text, width, faceBottom, palette.ink, 0.5, 0.48, 32);
    return;
  }
  context.save();
  context.shadowColor = "rgba(0, 0, 0, 0.7)";
  context.shadowBlur = 10;
  drawLabel(context, text, width, height, palette.ink, 0.94, 0.78, 36);
  context.restore();
}

function drawLabel(
  context: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  ink: string,
  widthFrac: number,
  heightFrac: number,
  minSize: number,
) {
  const maxWidth = width * widthFrac;
  const maxHeight = height * heightFrac;
  let size = Math.floor(height * 0.34);
  let lines = wrapLines(context, text, maxWidth, size);
  while (size > minSize) {
    const block = lines.length * size * 1.12;
    const fits = block <= maxHeight && lines.every((line) => measure(context, line, size) <= maxWidth);
    if (fits) break;
    size -= 2;
    lines = wrapLines(context, text, maxWidth, size);
  }
  context.fillStyle = ink;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `700 ${size}px ${IDEA_FONT}`;
  const lineHeight = size * 1.12;
  const block = lines.length * lineHeight;
  let y = height / 2 - block / 2 + lineHeight / 2;
  for (const line of lines) {
    context.fillText(line, width / 2, y);
    y += lineHeight;
  }
}

function measure(context: CanvasRenderingContext2D, line: string, size: number): number {
  context.font = `700 ${size}px ${IDEA_FONT}`;
  return context.measureText(line).width;
}

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number, size: number): string[] {
  context.font = `700 ${size}px ${IDEA_FONT}`;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (context.measureText(next).width <= maxWidth || !current) current = next;
    else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Un cuerpo y lóbulos que se meten en él. El primero lleva el texto en la cara que mira a la cámara.
 */
const CLOUD_LOBES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0, 0.0, 0.04, 0.5],
  [-0.32, 0.04, 0.0, 0.36],
  [0.34, 0.02, 0.0, 0.36],
  [-0.14, 0.28, 0.04, 0.3],
  [0.16, 0.3, 0.02, 0.28],
  [0.0, 0.36, 0.02, 0.22],
  [-0.2, -0.2, 0.06, 0.32],
  [0.22, -0.18, 0.05, 0.32],
];

const CLOUD_WIDTH_SEGMENTS = 64;
const CLOUD_HEIGHT_SEGMENTS = 48;

/** Radio exterior de la unión de esferas en esa dirección. El origen queda dentro. */
function outerRadius(dirX: number, dirY: number, dirZ: number): number {
  let far = 0.08;
  for (const [lx, ly, lz, radius] of CLOUD_LOBES) {
    const toward = dirX * lx + dirY * ly + dirZ * lz;
    const discriminant = toward * toward - (lx * lx + ly * ly + lz * lz - radius * radius);
    if (discriminant <= 0) continue;
    const distance = toward + Math.sqrt(discriminant);
    if (distance > far) far = distance;
  }
  return far;
}

function stampCloudUv(geometry: BufferGeometry) {
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i += 1) {
    const u = Math.min(0.88, Math.max(0.12, 0.5 + position.getX(i) * 0.52));
    const vNorm = Math.min(0.86, Math.max(0.14, 0.48 + position.getY(i) * 0.55));
    uv[i * 2] = u;
    uv[i * 2 + 1] = PLATE_V0 + vNorm * (1 - PLATE_V0);
  }
  geometry.setAttribute("uv", new BufferAttribute(uv, 2));
}

/** Halo suave, un disco con el degradado. La nube tapa el centro y queda el borde. */
export function buildCloudGlowGeometry(): BufferGeometry {
  const glow = new CircleGeometry(1, 40);
  glow.computeBoundingSphere();
  return glow;
}

export function buildIdeaGeometry(role: WorkshopIdeaRole = "now"): BufferGeometry {
  if (role === "past") return new PlaneGeometry(1, 1);
  const cloud = new SphereGeometry(1, CLOUD_WIDTH_SEGMENTS, CLOUD_HEIGHT_SEGMENTS);
  const position = cloud.getAttribute("position");
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const length = Math.hypot(x, y, z) || 1;
    const reach = outerRadius(x / length, y / length, z / length);
    position.setXYZ(i, (x / length) * reach, (y / length) * reach, (z / length) * reach);
  }
  position.needsUpdate = true;
  stampCloudUv(cloud);
  cloud.computeVertexNormals();
  cloud.computeBoundingSphere();
  return cloud;
}

export function ideaTriangleCount(geometry: BufferGeometry): number {
  const index = geometry.getIndex();
  if (index) return index.count / 3;
  const position = geometry.getAttribute("position");
  return position ? position.count / 3 : 0;
}

function worldWidth(fovDeg: number, depth: number, aspect: number, widthFrac: number): number {
  const fullHeight = 2 * Math.tan((fovDeg * Math.PI) / 360) * depth;
  return fullHeight * aspect * widthFrac;
}

/**
 * Cuatro nubes alrededor del busto: una a la izquierda y el resto a la derecha.
 * Las ya elegidas van arriba, más lejos y más pequeñas.
 */
export function layoutCloudSlots(
  nowCount: number,
  pastCount: number,
  aspect: number,
  fovDeg: number,
): { now: CloudSlot[]; past: CloudSlot[] } {
  const wide = aspect > 1.7;
  const desktop = aspect >= 1.15 && !wide;
  const nowDepth = wide ? 0.82 : desktop ? 0.74 : 0.58;
  const pastDepth = nowDepth + (wide ? 0.28 : 0.22);
  const widthFrac = wide ? 0.18 : desktop ? 0.24 : 0.36;
  const now = nowSpots(nowCount, aspect).map((spot, index) => ({
    ndcX: spot.x,
    ndcY: spot.y,
    depth: nowDepth - index * 0.015,
    scale: worldWidth(fovDeg, nowDepth, aspect, widthFrac * (index === 0 ? 1.06 : 0.92)),
    aspect: 1,
  }));
  const pastWidth = wide ? 0.16 : desktop ? 0.18 : 0.28;
  const past = Array.from({ length: pastCount }, (_, index) => {
    const span = pastCount <= 1 ? 0 : 1.3;
    const ndcX = pastCount <= 1 ? 0 : -span / 2 + ((index + 0.5) / pastCount) * span;
    return {
      ndcX,
      ndcY: 0.86 - (index % 2) * 0.02,
      depth: pastDepth,
      scale: worldWidth(fovDeg, pastDepth, aspect, pastWidth),
      aspect: PAST_ASPECT,
    };
  });
  return { now, past };
}

function nowSpots(count: number, aspect: number): Array<{ x: number; y: number }> {
  if (count === 4) return conceptSpots(aspect);
  return Array.from({ length: count }, (_, index) => {
    const t = count === 1 ? 0.5 : index / (count - 1);
    return { x: -0.72 + t * 1.44, y: index % 2 === 0 ? 0.16 : -0.16 };
  });
}

/** La composición del concepto: una nube grande a la izquierda y tres a la derecha. */
function conceptSpots(aspect: number): Array<{ x: number; y: number }> {
  if (aspect > 1.7) {
    return [
      { x: -0.48, y: 0.02 },
      { x: -0.14, y: 0.32 },
      { x: 0.32, y: 0.14 },
      { x: 0.5, y: -0.2 },
    ];
  }
  if (aspect >= 1.15) {
    return [
      { x: -0.48, y: 0.06 },
      { x: 0.28, y: 0.38 },
      { x: 0.5, y: 0.02 },
      { x: 0.18, y: -0.34 },
    ];
  }
  return [
    { x: -0.6, y: 0.02 },
    { x: 0.46, y: 0.38 },
    { x: 0.54, y: 0.0 },
    { x: 0.14, y: -0.36 },
  ];
}

/** Punto de la escena a `depth` metros de la cámara, en el NDC del hueco. */
export function cloudAnchor(camera: PerspectiveCamera, slot: CloudSlot, target: Vector3): Vector3 {
  target.set(slot.ndcX, slot.ndcY, 0.5).unproject(camera);
  target.sub(camera.position).normalize();
  return camera.position.clone().addScaledVector(target, slot.depth);
}
