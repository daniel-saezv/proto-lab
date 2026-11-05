import {
  BufferAttribute,
  BufferGeometry,
  CircleGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  type PerspectiveCamera,
} from "three";

export type WorkshopIdeaRole = "now";

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
  /** Ancho en metros. La geometría de la nube mide 1 en X. */
  scale: number;
  aspect: number;
};

/** Lienzo del rótulo, solo la letra. La nube se ilumina aparte. */
export const IDEA_CANVAS = { width: 768, height: 512 } as const;

/**
 * Una superficie suave compartida. Cuatro nubes, el rótulo y el halo
 * siguen por debajo de 40k triángulos junto con la sala del primer plano.
 */
export const IDEA_TRIANGLE_CAP = 8_000;

/** Familia incluida en el repo (Nunito, SIL OFL). Redondeada y pesada. */
export const IDEA_FONT_FAMILY = "ProtoNunito";
export const IDEA_FONT_URL = "/fonts/nunito-latin-800.woff2";
export const IDEA_FONT = `"${IDEA_FONT_FAMILY}", "Trebuchet MS", "Segoe UI", sans-serif`;

/**
 * El halo es un disco en el plano de la nube. El mural pinta código en
 * `#7dff6b`: cualquier alfa por debajo de 1 mezcla esos glifos y salen
 * puntitos verdes (el antialiasing del borde hace lo mismo si el fragmento
 * es semitransparente). El cuerpo es opaco del todo y el borde se descarta
 * de golpe. La suavidad es un degradado de color, no de alfa.
 */
export const GLOW_EDGE_END = 0.97;
/** No hay alfa intermedio: o el fragmento es opaco o se descarta. */
export const GLOW_MIN_ALPHA = 1;
/** Amarillo del concepto, en lineal, para el shader (sRGB #ffc430). */
export const GLOW_LINEAR = [1, 0.552, 0.0296] as const;
/** Centro más claro, para que el anillo no sea un plástico plano. */
export const GLOW_CORE_LINEAR = [1, 0.82, 0.28] as const;

/**
 * El disco (radio 1) se escala así en el espacio local de la nube (ancho 1,
 * el borde queda hacia ±0,5). 0,64 deja un cerco justo por fuera del algodón,
 * como el resplandor del concepto, sin un sol que tape al Inventor.
 */
export const CLOUD_GLOW_SCALE = 0.64;

const IDEA_INK = "#1a1208";
const IDEA_CLOUD = "#fff6ee";

export function workshopIdeaMeshes(
  options: readonly string[],
  picked: ReadonlySet<string>,
): WorkshopIdeaMesh[] {
  return options.map((text, index) => ({
    id: `now-${index}`,
    text,
    role: "now" as const,
    picked: picked.has(text),
  }));
}

export function ideaPalette(picked: boolean): { ink: string; cloud: string; glow: string } {
  return {
    ink: IDEA_INK,
    cloud: IDEA_CLOUD,
    glow: picked ? "#ffc430" : "transparent",
  };
}

/** 1 dentro del disco, 0 fuera. Sin franja semitransparente. */
export function glowOpacity(radius: number): number {
  const clamped = Math.min(1, Math.max(0, radius));
  return clamped >= GLOW_EDGE_END ? 0 : 1;
}

let fontLoad: Promise<boolean> | null = null;

/** Carga la Nunito del repo. Si falla, el rótulo usa la fuente de reserva. */
export function loadIdeaFont(): Promise<boolean> {
  if (fontLoad) return fontLoad;
  fontLoad = (async () => {
    if (typeof FontFace === "undefined" || typeof document === "undefined") return false;
    try {
      const face = new FontFace(IDEA_FONT_FAMILY, `url(${IDEA_FONT_URL})`, {
        weight: "800",
        style: "normal",
      });
      await face.load();
      document.fonts.add(face);
      return true;
    } catch {
      return false;
    }
  })();
  return fontLoad;
}

/** Rótulo oscuro sobre transparente. La nube blanca va en otra malla, con la luz de la sala. */
export function paintIdeaCanvas(canvas: HTMLCanvasElement, text: string, picked: boolean): void {
  const { width, height } = IDEA_CANVAS;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  const palette = ideaPalette(picked);
  drawLabel(context, text, width, height, palette.ink, 0.92, 0.86, 40);
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
  let size = Math.floor(height * 0.4);
  let lines = wrapLines(context, text, maxWidth, size);
  while (size > minSize) {
    const block = lines.length * size * 1.08;
    const fits = block <= maxHeight && lines.every((line) => measure(context, line, size) <= maxWidth);
    if (fits) break;
    size -= 2;
    lines = wrapLines(context, text, maxWidth, size);
  }
  context.fillStyle = ink;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `800 ${size}px ${IDEA_FONT}`;
  const lineHeight = size * 1.08;
  const block = lines.length * lineHeight;
  let y = height / 2 - block / 2 + lineHeight / 2;
  for (const line of lines) {
    context.fillText(line, width / 2, y);
    y += lineHeight;
  }
}

function measure(context: CanvasRenderingContext2D, line: string, size: number): number {
  context.font = `800 ${size}px ${IDEA_FONT}`;
  return context.measureText(line).width;
}

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number, size: number): string[] {
  context.font = `800 ${size}px ${IDEA_FONT}`;
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
 * Lóbulos que se funden. El campo es la suma de bolas suaves, no la unión
 * radial: la unión deja aristas donde se cruzan las esferas.
 */
const CLOUD_LOBES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.0, 0.02, 0.02, 0.5],
  [-0.38, 0.0, 0.0, 0.36],
  [0.4, -0.02, 0.0, 0.36],
  [-0.2, 0.34, 0.02, 0.3],
  [0.22, 0.36, 0.02, 0.28],
  [0.02, 0.46, 0.0, 0.2],
  [-0.26, -0.26, 0.03, 0.32],
  [0.28, -0.24, 0.02, 0.32],
  [0.0, -0.32, 0.02, 0.22],
];

const CLOUD_ISO = 0.42;
const CLOUD_DEPTH = 0.58;

function cloudField(x: number, y: number, z: number): number {
  let field = 0;
  for (const [lx, ly, lz, radius] of CLOUD_LOBES) {
    const dx = x - lx;
    const dy = y - ly;
    const dz = z - lz;
    const reach = radius * radius;
    const dist = dx * dx + dy * dy + dz * dz;
    if (dist >= reach) continue;
    const q = 1 - dist / reach;
    field += q * q;
  }
  return field;
}

function cloudReach(dirX: number, dirY: number, dirZ: number): number {
  let lo = 0;
  let hi = 1.45;
  if (cloudField(dirX * 0.04, dirY * 0.04, dirZ * 0.04) < CLOUD_ISO) return 0.16;
  for (let step = 0; step < 14; step += 1) {
    const mid = (lo + hi) * 0.5;
    if (cloudField(dirX * mid, dirY * mid, dirZ * mid) >= CLOUD_ISO) lo = mid;
    else hi = mid;
  }
  return lo;
}

function cloudGradient(x: number, y: number, z: number): [number, number, number] {
  const e = 0.014;
  return [
    cloudField(x + e, y, z) - cloudField(x - e, y, z),
    cloudField(x, y + e, z) - cloudField(x, y - e, z),
    cloudField(x, y, z + e) - cloudField(x, y, z - e),
  ];
}

/** Halo: círculo denso. El borde visible lo recorta el shader, no la malla. */
export function buildCloudGlowGeometry(): BufferGeometry {
  const glow = new CircleGeometry(1, 48);
  glow.computeBoundingSphere();
  return glow;
}

export function createCloudGlowMaterial(): ShaderMaterial {
  const [red, green, blue] = GLOW_LINEAR;
  const [coreRed, coreGreen, coreBlue] = GLOW_CORE_LINEAR;
  const material = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    premultipliedAlpha: true,
    toneMapped: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      varying vec2 vUv;
      void main() {
        float radius = length(vUv - vec2(0.5)) * 2.0;
        if (radius >= ${GLOW_EDGE_END.toFixed(4)}) discard;
        float edge = smoothstep(0.42, 0.96, radius);
        vec3 core = vec3(${coreRed.toFixed(4)}, ${coreGreen.toFixed(4)}, ${coreBlue.toFixed(4)});
        vec3 rim = vec3(${red.toFixed(4)}, ${green.toFixed(4)}, ${blue.toFixed(4)});
        gl_FragColor = vec4(mix(core, rim, edge), 1.0);
        #include <colorspace_fragment>
        #include <premultiplied_alpha_fragment>
      }
    `,
  });
  return material;
}

/** Nube de pensamiento: lóbulos fundidos, más ancha que profunda, normales hacia fuera. */
export function buildIdeaGeometry(): BufferGeometry {
  const cloud = new SphereGeometry(1, 64, 40);
  const position = cloud.getAttribute("position");
  const normals = new Float32Array(position.count * 3);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const y = position.getY(i);
    const z = position.getZ(i);
    const length = Math.hypot(x, y, z) || 1;
    const dirX = x / length;
    const dirY = y / length;
    const dirZ = z / length;
    const reach = cloudReach(dirX, dirY, dirZ);
    const px = dirX * reach;
    const py = dirY * reach;
    const pz = dirZ * reach;
    position.setXYZ(i, px, py, pz);
    const gradient = cloudGradient(px, py, pz);
    const gx = -gradient[0];
    const gy = -gradient[1];
    const gz = -gradient[2];
    const glen = Math.hypot(gx, gy, gz) || 1;
    normals[i * 3] = gx / glen;
    normals[i * 3 + 1] = gy / glen;
    normals[i * 3 + 2] = gz / glen;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  const width = Math.max(0.001, maxX - minX);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const fit = 1 / width;
  let faceZ = 0;
  for (let i = 0; i < position.count; i += 1) {
    const x = (position.getX(i) - midX) * fit;
    const y = (position.getY(i) - midY) * fit;
    const z = position.getZ(i) * fit * CLOUD_DEPTH;
    position.setXYZ(i, x, y, z);
    const nx = normals[i * 3] ?? 0;
    const ny = normals[i * 3 + 1] ?? 0;
    const nz = (normals[i * 3 + 2] ?? 0) / CLOUD_DEPTH;
    const nlen = Math.hypot(nx, ny, nz) || 1;
    normals[i * 3] = nx / nlen;
    normals[i * 3 + 1] = ny / nlen;
    normals[i * 3 + 2] = nz / nlen;
    if (z > faceZ) faceZ = z;
  }
  position.needsUpdate = true;
  cloud.setAttribute("normal", new BufferAttribute(normals, 3));
  cloud.computeBoundingSphere();
  cloud.userData.faceZ = faceZ;
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

/** Cuatro nubes alrededor del busto: una a la izquierda y el resto a la derecha. */
export function layoutCloudSlots(nowCount: number, aspect: number, fovDeg: number): CloudSlot[] {
  const wide = aspect > 1.7;
  const desktop = aspect >= 1.15 && !wide;
  const nowDepth = wide ? 0.86 : desktop ? 0.74 : 0.58;
  const widthFrac = wide ? 0.16 : desktop ? 0.24 : 0.36;
  return nowSpots(nowCount, aspect).map((spot, index) => ({
    ndcX: spot.x,
    ndcY: spot.y,
    depth: nowDepth - index * 0.015,
    scale: worldWidth(fovDeg, nowDepth, aspect, widthFrac * (index === 0 ? 1.06 : 0.92)),
    aspect: 1,
  }));
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
      { x: -0.58, y: 0.04 },
      { x: -0.14, y: 0.3 },
      { x: 0.34, y: 0.12 },
      { x: 0.6, y: -0.24 },
    ];
  }
  if (aspect >= 1.15) {
    return [
      { x: -0.5, y: 0.06 },
      { x: 0.3, y: 0.36 },
      { x: 0.52, y: 0.02 },
      { x: 0.16, y: -0.32 },
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
