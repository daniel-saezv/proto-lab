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

const IDEA_INK = "#100c08";
const IDEA_CLOUD = "#fffaf6";
const IDEA_HALO = "#fffdf8";

/**
 * Plano del rótulo. Cabe en la panza de la nube, no en la caja: los lóbulos
 * se estrechan y una letra en la esquina se saldría. El margen lo mide
 * `LABEL_PAD`.
 */
export const CLOUD_LABEL = { width: 0.6, height: 0.62, y: -0.02, minPx: 64 } as const;

/** Holgura, en unidades de la malla, entre la tinta y el contorno. */
export const LABEL_PAD = 0.03;

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
  // Reasignar el tamaño vacía el lienzo. Si ya mide eso, la textura WebGL
  // se quedaría negra un fotograma al marcar la nube.
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) return;
  context.clearRect(0, 0, width, height);
  const palette = ideaPalette(picked);
  drawLabel(context, text, width, height, palette.ink);
}

/**
 * La tinta del lienzo, halo incluido, cae dentro del contorno con margen.
 * `out` nombra el primer punto que se sale.
 */
export function inkInsideCotton(
  canvas: HTMLCanvasElement,
  plane: { width: number; height: number; y: number } = CLOUD_LABEL,
  pad = LABEL_PAD,
): string {
  const context = canvas.getContext("2d");
  if (!context || canvas.width < 2 || canvas.height < 2) return "empty";
  const { width, height } = canvas;
  const pixels = context.getImageData(0, 0, width, height).data;
  let seen = 0;
  const step = 2;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const alpha = pixels[(y * width + x) * 4 + 3] ?? 0;
      if (alpha < 24) continue;
      seen += 1;
      const localX = (x / width - 0.5) * plane.width;
      const localY = plane.y + (0.5 - y / height) * plane.height;
      if (!insideCotton(localX, localY, pad)) return `out ${localX.toFixed(3)},${localY.toFixed(3)}`;
    }
  }
  return seen >= 8 ? "ok" : "blank";
}

function drawLabel(
  context: CanvasRenderingContext2D,
  text: string,
  width: number,
  height: number,
  ink: string,
) {
  const maxWidth = width * 0.98;
  const maxHeight = height * 0.96;
  let size = Math.max(CLOUD_LABEL.minPx, Math.floor(height * 0.34));
  let lines = wrapLines(context, text, maxWidth, size);
  while (size > 28 && !labelFits(context, lines, size, maxWidth, maxHeight)) {
    size -= 2;
    lines = wrapLines(context, text, maxWidth, size);
  }
  const spans = lines.map((line) => glyphSpan(context, line, size));
  const step = size * 1.02;
  const first = spans[0];
  const last = spans[spans.length - 1];
  const block = (first?.ascent ?? 0) + (last?.descent ?? 0) + Math.max(0, lines.length - 1) * step;
  let baseline = height / 2 - block / 2 + (first?.ascent ?? step / 2);
  const linesAt = lines.map((line) => {
    const at = baseline;
    baseline += step;
    return { line, at };
  });
  context.textAlign = "center";
  context.textBaseline = "alphabetic";
  context.lineJoin = "round";
  context.font = `${IDEA_FONT_WEIGHT} ${size}px ${IDEA_FONT}`;
  context.strokeStyle = IDEA_HALO;
  context.lineWidth = haloWidth(size);
  for (const { line, at } of linesAt) context.strokeText(line, width / 2, at);
  context.fillStyle = ink;
  context.strokeStyle = ink;
  context.lineWidth = Math.max(2, size * 0.045);
  for (const { line, at } of linesAt) {
    context.strokeText(line, width / 2, at);
    context.fillText(line, width / 2, at);
  }
}

function haloWidth(size: number): number {
  return Math.max(10, size * 0.2);
}

/** Ancho y alto de la tinta, con el halo. Así el ¿ y el ? cuentan. */
function glyphSpan(
  context: CanvasRenderingContext2D,
  line: string,
  size: number,
): { width: number; ascent: number; descent: number } {
  context.font = `${IDEA_FONT_WEIGHT} ${size}px ${IDEA_FONT}`;
  const measured = context.measureText(line);
  const stroke = haloWidth(size);
  const left = measured.actualBoundingBoxLeft;
  const right = measured.actualBoundingBoxRight;
  const ink = left + right > 1 ? left + right : measured.width;
  return {
    width: ink + stroke,
    ascent: (measured.actualBoundingBoxAscent || size * 0.82) + stroke / 2,
    descent: (measured.actualBoundingBoxDescent || size * 0.24) + stroke / 2,
  };
}

function labelFits(
  context: CanvasRenderingContext2D,
  lines: readonly string[],
  size: number,
  maxWidth: number,
  maxHeight: number,
): boolean {
  const spans = lines.map((line) => glyphSpan(context, line, size));
  const step = size * 1.02;
  const block =
    (spans[0]?.ascent ?? 0) + (spans[spans.length - 1]?.descent ?? 0) + Math.max(0, lines.length - 1) * step;
  return block <= maxHeight && spans.every((span) => span.width <= maxWidth);
}

function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number, size: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (glyphSpan(context, next, size).width <= maxWidth || !current) current = next;
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

/** Encaje de la malla: el campo pasa a ancho 1 y queda centrado. */
let cloudFrame: { fit: number; midX: number; midY: number } | null = null;

/**
 * El punto, en el plano de la malla, cae dentro del algodón con `pad` de
 * margen. El rótulo se comprueba con esto, no con la caja del lóbulo.
 */
export function insideCotton(localX: number, localY: number, pad = 0): boolean {
  if (!cloudFrame) buildIdeaGeometry().dispose();
  const frame = cloudFrame;
  if (!frame) return false;
  const diagonal = pad * 0.7071;
  const offsets = [
    [0, 0],
    [pad, 0],
    [-pad, 0],
    [0, pad],
    [0, -pad],
    [diagonal, diagonal],
    [diagonal, -diagonal],
    [-diagonal, diagonal],
    [-diagonal, -diagonal],
  ];
  return offsets.every(([dx, dy]) => {
    const x = frame.midX + (localX + (dx ?? 0)) / frame.fit;
    const y = frame.midY + (localY + (dy ?? 0)) / frame.fit;
    return cloudField(x, y, 0) >= CLOUD_ISO;
  });
}

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

/**
 * Algodón del taller. Los uniformes los rellena el mundo con el sol, el
 * hemisferio y la lámpara del escritorio, para que el color y la dirección
 * sean los de la sala. El detalle es ruido en el espacio del objeto.
 */
export function createCloudCottonMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    toneMapped: true,
    fog: false,
    uniforms: {
      uSunDir: { value: new Vector3(0, 1, 0) },
      uSunColor: { value: new Vector3(1, 0.94, 0.82) },
      uSkyColor: { value: new Vector3(0.7, 0.78, 1) },
      uGroundColor: { value: new Vector3(0.16, 0.12, 0.08) },
      uHemi: { value: 1 },
      uDeskPos: { value: new Vector3() },
      uDeskColor: { value: new Vector3(1, 0.75, 0.45) },
      uDeskIntensity: { value: 0 },
      uDeskDistance: { value: 3.1 },
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vLocal;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vLocal = position;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: `
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyColor;
      uniform vec3 uGroundColor;
      uniform float uHemi;
      uniform vec3 uDeskPos;
      uniform vec3 uDeskColor;
      uniform float uDeskIntensity;
      uniform float uDeskDistance;
      varying vec3 vNormal;
      varying vec3 vWorld;
      varying vec3 vLocal;

      float fiberHash(vec3 p) {
        p = fract(p * 0.1031);
        p += dot(p, p.zyx + 31.32);
        return fract((p.x + p.y) * p.z);
      }

      float fiberNoise(vec3 p) {
        vec3 i = floor(p);
        vec3 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float n000 = fiberHash(i);
        float n100 = fiberHash(i + vec3(1.0, 0.0, 0.0));
        float n010 = fiberHash(i + vec3(0.0, 1.0, 0.0));
        float n110 = fiberHash(i + vec3(1.0, 1.0, 0.0));
        float n001 = fiberHash(i + vec3(0.0, 0.0, 1.0));
        float n101 = fiberHash(i + vec3(1.0, 0.0, 1.0));
        float n011 = fiberHash(i + vec3(0.0, 1.0, 1.0));
        float n111 = fiberHash(i + vec3(1.0, 1.0, 1.0));
        return mix(
          mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
          mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
          f.z
        );
      }

      void main() {
        vec3 n = normalize(vNormal);
        vec3 view = normalize(cameraPosition - vWorld);
        vec3 sunDir = normalize(uSunDir);
        float wool = fiberNoise(vLocal * 8.0);
        float nap = fiberNoise(vLocal * 16.0);
        float nx = fiberNoise(vLocal * 8.0 + vec3(0.18, 0.0, 0.0)) - wool;
        float ny = fiberNoise(vLocal * 8.0 + vec3(0.0, 0.18, 0.0)) - wool;
        n = normalize(n + vec3(nx, ny, nx * 0.35) * 0.85);
        float crease = clamp(length(fwidth(n)) * 5.0, 0.0, 1.0);
        float ao = mix(1.0, 0.58, crease) * mix(0.72, 1.0, n.y * 0.5 + 0.5);
        vec3 warmFill = mix(uGroundColor, uDeskColor, 0.55);
        vec3 hemi = mix(warmFill, uSkyColor, clamp(n.y * 0.55 + 0.42, 0.0, 1.0)) * uHemi;
        float wrap = clamp(dot(n, sunDir) * 0.72 + 0.22, 0.0, 1.0);
        float scatter = pow(clamp(dot(-n, sunDir), 0.0, 1.0), 1.6) * pow(clamp(dot(view, -sunDir), 0.0, 1.0), 1.15);
        vec3 sun = uSunColor * (wrap * 0.2 + scatter * 0.07);
        vec3 toDesk = uDeskPos - vWorld;
        float lightDistance = length(toDesk);
        vec3 deskDir = toDesk / max(lightDistance, 0.001);
        float reach = clamp(1.0 - pow(lightDistance / max(uDeskDistance, 0.001), 4.0), 0.0, 1.0);
        float atten = reach * reach / max(lightDistance * lightDistance, 0.08);
        float deskWrap = clamp(dot(n, deskDir) * 0.55 + 0.5, 0.0, 1.0);
        vec3 desk = uDeskColor * uDeskIntensity * atten * deskWrap;
        vec3 albedo = vec3(1.0, 0.992, 0.982);
        albedo *= 0.98 + wool * 0.05 + nap * 0.02;
        vec3 color = albedo * (hemi * 0.18 + sun + desk * 0.09) * ao;
        color = mix(color, vec3(1.0), 0.07);
        float rim = pow(1.0 - max(dot(n, view), 0.0), 2.0);
        vec3 rimColor = mix(uSkyColor, uDeskColor, 0.82);
        color += rimColor * rim * 0.2;
        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
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
  cloudFrame = { fit, midX, midY };
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

/** Mitad de la nube en NDC, con el borde de selección incluido si `pad` > 1. */
export function slotNdcHalf(
  slot: CloudSlot,
  aspect: number,
  fovDeg: number,
  height: number,
  pad: number,
): { halfW: number; halfH: number } {
  const fullHeight = 2 * Math.tan((fovDeg * Math.PI) / 360) * slot.depth;
  const fullWidth = fullHeight * aspect;
  return {
    halfW: (slot.scale * pad) / fullWidth,
    halfH: (slot.scale * height * pad) / fullHeight,
  };
}

/** Cuatro nubes alrededor del busto, con hueco entre sus cajas. */
export function layoutCloudSlots(nowCount: number, aspect: number, fovDeg: number): CloudSlot[] {
  const wide = aspect > 1.7;
  const desktop = aspect >= 1.15 && !wide;
  const depth = wide ? 0.82 : desktop ? 0.7 : 0.54;
  const widthFrac = wide ? 0.13 : desktop ? 0.155 : 0.3;
  return nowSpots(nowCount, aspect, widthFrac).map((spot) => ({
    ndcX: spot.x,
    ndcY: spot.y,
    depth,
    scale: worldWidth(fovDeg, depth, aspect, widthFrac),
    aspect: 1,
  }));
}

function nowSpots(count: number, aspect: number, widthFrac: number): Array<{ x: number; y: number }> {
  if (count === 4) return conceptSpots(aspect);
  const halfW = widthFrac * CLOUD_AURA_SCALE + 0.03;
  const step = halfW * 2 + 0.04;
  const start = -step * (count - 1) * 0.5;
  return Array.from({ length: count }, (_, index) => ({ x: start + index * step, y: 0.04 }));
}

/** La composición del concepto: una nube grande a la izquierda y tres a la derecha. */
function conceptSpots(aspect: number): Array<{ x: number; y: number }> {
  if (aspect > 1.7) {
    return [
      { x: -0.64, y: 0.12 },
      { x: -0.22, y: 0.12 },
      { x: 0.22, y: 0.12 },
      { x: 0.64, y: 0.12 },
    ];
  }
  if (aspect >= 1.15) {
    return [
      { x: -0.62, y: 0.38 },
      { x: 0.22, y: 0.46 },
      { x: 0.66, y: -0.06 },
      { x: -0.08, y: -0.2 },
    ];
  }
  return [
    { x: -0.5, y: 0.5 },
    { x: 0.42, y: 0.62 },
    { x: -0.42, y: 0.08 },
    { x: 0.5, y: 0.22 },
  ];
}

/** Punto de la escena a `depth` metros de la cámara, en el NDC del hueco. */
export function cloudAnchor(camera: PerspectiveCamera, slot: CloudSlot, target: Vector3): Vector3 {
  target.set(slot.ndcX, slot.ndcY, 0.5).unproject(camera);
  target.sub(camera.position).normalize();
  return camera.position.clone().addScaledVector(target, slot.depth);
}
