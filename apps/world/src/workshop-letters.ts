import {
  BufferAttribute,
  BufferGeometry,
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

/** Familia incluida en el repo (Fredoka, SIL OFL). Redonda, de juego. */
export const IDEA_FONT_FAMILY = "ProtoFredoka";
export const IDEA_FONT_URL = "/fonts/fredoka-latin-700.woff2";
export const IDEA_FONT_WEIGHT = "700";
export const IDEA_FONT = `"${IDEA_FONT_FAMILY}", "Trebuchet MS", "Segoe UI", sans-serif`;

/**
 * El resplandor es otra copia de la nube, un poco más grande y opaca.
 * El mural pinta código en `#7dff6b`: un halo con alfa deja ver esos glifos
 * como puntitos verdes. Aquí no hay alfa. El algodón blanco tapa el centro
 * y el borde amarillo sigue los lóbulos.
 */
export const CLOUD_AURA_SCALE = 1.09;

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

/** Aparición: de cero a uno, con un pequeño rebote. */
export function cloudPop(t: number): number {
  const u = Math.min(1, Math.max(0, t));
  const s = u - 1;
  const c1 = 1.35;
  const c3 = c1 + 1;
  return 1 + c3 * s * s * s + c1 * s * s;
}

let fontLoad: Promise<boolean> | null = null;

/** Carga la Fredoka del repo. Si falla, el rótulo usa la fuente de reserva. */
export function loadIdeaFont(): Promise<boolean> {
  if (fontLoad) return fontLoad;
  fontLoad = (async () => {
    if (typeof FontFace === "undefined" || typeof document === "undefined") return false;
    try {
      const face = new FontFace(IDEA_FONT_FAMILY, `url(${IDEA_FONT_URL})`, {
        weight: IDEA_FONT_WEIGHT,
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
  context.strokeStyle = ink;
  context.lineJoin = "round";
  context.lineWidth = Math.max(3, size * 0.07);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `${IDEA_FONT_WEIGHT} ${size}px ${IDEA_FONT}`;
  const lineHeight = size * 1.05;
  const block = lines.length * lineHeight;
  let y = height / 2 - block / 2 + lineHeight / 2;
  for (const line of lines) {
    context.strokeText(line, width / 2, y);
    context.fillText(line, width / 2, y);
    y += lineHeight;
  }
}

function measure(context: CanvasRenderingContext2D, line: string, size: number): number {
  context.font = `${IDEA_FONT_WEIGHT} ${size}px ${IDEA_FONT}`;
  return context.measureText(line).width;
}

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number, size: number): string[] {
  context.font = `${IDEA_FONT_WEIGHT} ${size}px ${IDEA_FONT}`;
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
  [0.0, 0.0, 0.0, 0.42],
  [-0.36, 0.04, 0.02, 0.3],
  [0.38, 0.02, 0.0, 0.31],
  [-0.2, 0.3, 0.02, 0.27],
  [0.22, 0.32, 0.0, 0.28],
  [0.0, 0.42, 0.02, 0.2],
  [-0.28, -0.24, 0.02, 0.27],
  [0.3, -0.22, 0.0, 0.28],
  [0.0, -0.34, 0.02, 0.22],
  [-0.06, 0.12, 0.05, 0.16],
];

const CLOUD_ISO = 0.36;
const CLOUD_DEPTH = 0.46;

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

const CLOUD_VARYING = `
  varying vec3 vNormal;
  varying vec3 vView;
  void main() {
    vec4 world = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - world.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/** Algodón blanco: luz suave, sin el aplastado de un Lambert muy emisivo. */
export function createCloudCottonMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    toneMapped: false,
    fog: false,
    vertexShader: CLOUD_VARYING,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec3 n = normalize(vNormal);
        vec3 view = normalize(vView);
        float wrap = clamp(dot(n, normalize(vec3(-0.22, 0.78, 0.5))) * 0.5 + 0.62, 0.0, 1.0);
        float up = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);
        float rim = pow(1.0 - max(dot(n, view), 0.0), 2.4);
        vec3 shadow = vec3(0.80, 0.75, 0.72);
        vec3 cotton = vec3(1.0, 0.988, 0.965);
        vec3 color = mix(shadow, cotton, smoothstep(0.12, 0.82, wrap));
        color += vec3(1.0, 0.94, 0.84) * up * 0.07;
        color = mix(color, vec3(1.0, 0.97, 0.92), rim * 0.28);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Borde amarillo opaco. El alfa mezclaría el verde del mural. */
export function createCloudAuraMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    toneMapped: false,
    fog: false,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    vertexShader: CLOUD_VARYING,
    fragmentShader: `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vec3 n = normalize(vNormal);
        float rim = pow(1.0 - max(dot(n, normalize(vView)), 0.0), 1.2);
        vec3 gold = vec3(1.0, 0.55, 0.04);
        vec3 hot = vec3(1.0, 0.88, 0.38);
        vec3 color = mix(gold, hot, rim);
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
}

/** Nube de pensamiento: lóbulos fundidos, más ancha que profunda, normales hacia fuera. */
export function buildIdeaGeometry(): BufferGeometry {
  const cloud = new SphereGeometry(1, 42, 28);
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
  const widthFrac = wide ? 0.15 : desktop ? 0.18 : 0.34;
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
