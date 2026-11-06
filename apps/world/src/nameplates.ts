/**
 * Indicadores del lobby: un solo icono en pastilla (el foco) y, como mucho,
 * el mismo glifo suelto para el resto de interactuables cercanos.
 * La colisión es en pantalla. El mundo proyecta y aplica el resultado.
 */

export const NAMEPLATE_UPDATE_SUFFIX = " · nuevo";

export const NAMEPLATE_METRICS = {
  /** Alto de la pastilla (padding + borde + línea). */
  nameHeight: 32,
  /** Hueco entre el ancla y la base de la pastilla. */
  nameLift: 10,
  /** Caja del punto, halo incluido. */
  pipSize: 14,
  /** El punto queda un poco por encima del ancla. */
  pipLift: 8,
  /** Separación mínima entre cajas visibles. */
  gap: 8,
  /** Más lejos que esto no hay ni punto. */
  pipDistance: 9,
  /** Sin estar en rango, el nombre solo si estás relativamente cerca. */
  gazeDistance: 6.5,
  /** Coseno mínimo en el plano (1 = de frente al jugador). */
  gazeMin: 0.86,
  /** Holgura de mirada para no parpadear entre dos objetivos parecidos. */
  gazeStick: 0.07,
  /** Si el foco anterior está mucho más lejos, se cede aunque la mirada sea parecida. */
  gazeDistanceStick: 1,
  charPx: 8.4,
  padPx: 28,
  /**
   * Ancho de la pastilla cuando solo lleva el glifo (padding + borde + 18px).
   * El aviso de prototipo nuevo se suma aparte.
   */
  markWidth: 48,
} as const;

/**
 * Glifos de texto, la misma línea que la corchea de la radio: heredan el
 * color de la pastilla y no salen como emoji a color.
 * El cohete lleva el selector de presentación de texto (U+FE0E).
 */
export const NAMEPLATE_GLYPH = {
  note: "\u266A",
  talk: "\u{1F5E8}",
  look: "\u270E",
  play: "\u{1F680}\uFE0E",
} as const;

export type NameplateMark = keyof typeof NAMEPLATE_GLYPH;

/** Cada interactuable con indicador. Quien no está aquí no lleva pastilla. */
export const NAMEPLATE_MARK_BY_ID = {
  radio: "note",
  inventor: "talk",
  remolon: "talk",
  brasa: "talk",
  naipe: "talk",
  croquis: "talk",
  chalkboard: "look",
  arcade: "play",
} as const satisfies Record<string, NameplateMark>;

export function nameplateMark(id: string): NameplateMark | null {
  if (Object.prototype.hasOwnProperty.call(NAMEPLATE_MARK_BY_ID, id)) {
    return NAMEPLATE_MARK_BY_ID[id as keyof typeof NAMEPLATE_MARK_BY_ID];
  }
  return null;
}

export type NameplateMode = "name" | "pip" | "hidden";

export type NameplateCandidate = {
  id: string;
  /** Centro del ancla en píxeles, origen arriba a la izquierda. */
  x: number;
  y: number;
  inView: boolean;
  /** Distancia al jugador en el plano del suelo. */
  distance: number;
  inRange: boolean;
  /** 1 = justo delante del jugador, 0 = a 90° o detrás. */
  gaze: number;
  /** Ancho estimado de la pastilla con el nombre, en px. */
  nameWidth: number;
};

export type NameplateDecision = {
  id: string;
  mode: NameplateMode;
  /** Pastilla ámbar: es el objetivo de interacción y se está viendo. */
  near: boolean;
};

export function estimateNameWidth(text: string, withUpdate = false): number {
  const extra = withUpdate ? NAMEPLATE_UPDATE_SUFFIX.length : 0;
  return Math.ceil((text.length + extra) * NAMEPLATE_METRICS.charPx + NAMEPLATE_METRICS.padPx);
}

/** Caja de la pastilla de icono. Con aviso de prototipo nuevo, suma el sufijo. */
export function estimateMarkWidth(withUpdate = false): number {
  if (!withUpdate) return NAMEPLATE_METRICS.markWidth;
  return NAMEPLATE_METRICS.markWidth + Math.ceil(NAMEPLATE_UPDATE_SUFFIX.length * NAMEPLATE_METRICS.charPx);
}

/** Mirada horizontal del jugador. `forward` no tiene que estar normalizado. */
export function planarGaze(
  originX: number,
  originZ: number,
  forwardX: number,
  forwardZ: number,
  targetX: number,
  targetZ: number,
): number {
  const dx = targetX - originX;
  const dz = targetZ - originZ;
  const len = Math.hypot(dx, dz);
  const forwardLen = Math.hypot(forwardX, forwardZ);
  if (len < 1e-5 || forwardLen < 1e-5) return 1;
  const dot = (dx * forwardX + dz * forwardZ) / (len * forwardLen);
  return dot > 0 ? dot : 0;
}

/**
 * Proyecta con la matriz view-projection de Three (column-major, con
 * división perspectiva). `inView` coincide con el frustum de CSS2DRenderer.
 */
export function projectToScreen(
  x: number,
  y: number,
  z: number,
  viewProjection: ArrayLike<number>,
  width: number,
  height: number,
): { x: number; y: number; inView: boolean } {
  if (width <= 0 || height <= 0) return { x: 0, y: 0, inView: false };
  const e = viewProjection;
  const clipW = (e[3] ?? 0) * x + (e[7] ?? 0) * y + (e[11] ?? 0) * z + (e[15] ?? 0);
  if (clipW <= 1e-5) return { x: 0, y: 0, inView: false };
  const inv = 1 / clipW;
  const ndcX = ((e[0] ?? 0) * x + (e[4] ?? 0) * y + (e[8] ?? 0) * z + (e[12] ?? 0)) * inv;
  const ndcY = ((e[1] ?? 0) * x + (e[5] ?? 0) * y + (e[9] ?? 0) * z + (e[13] ?? 0)) * inv;
  const ndcZ = ((e[2] ?? 0) * x + (e[6] ?? 0) * y + (e[10] ?? 0) * z + (e[14] ?? 0)) * inv;
  return {
    x: ndcX * (width / 2) + width / 2,
    y: -ndcY * (height / 2) + height / 2,
    inView: ndcX >= -1 && ndcX <= 1 && ndcY >= -1 && ndcY <= 1 && ndcZ >= -1 && ndcZ <= 1,
  };
}

export function resolveNameplates(
  candidates: readonly NameplateCandidate[],
  previousFocusId: string | null = null,
): { focusId: string | null; decisions: NameplateDecision[] } {
  const focus = pickFocus(candidates, previousFocusId);
  const preliminary = new Map<string, NameplateMode>();
  for (const candidate of candidates) {
    if (focus && candidate.id === focus.id) preliminary.set(candidate.id, "name");
    else if (candidate.inView && candidate.distance <= NAMEPLATE_METRICS.pipDistance) preliminary.set(candidate.id, "pip");
    else preliminary.set(candidate.id, "hidden");
  }

  const boxes: ScreenBox[] = [];
  for (const candidate of candidates) {
    const mode = preliminary.get(candidate.id);
    if (mode === "name" || mode === "pip") boxes.push(boxFor(candidate, mode));
  }
  boxes.sort(compareBoxes);
  const kept: ScreenBox[] = [];
  const keptIds = new Set<string>();
  for (const box of boxes) {
    if (kept.some((other) => overlaps(box, other, NAMEPLATE_METRICS.gap))) continue;
    kept.push(box);
    keptIds.add(box.id);
  }

  return {
    focusId: focus?.id ?? null,
    decisions: candidates.map((candidate) => {
      const mode = preliminary.get(candidate.id) ?? "hidden";
      const visible = mode !== "hidden" && keptIds.has(candidate.id);
      return {
        id: candidate.id,
        mode: visible ? mode : "hidden",
        near: visible && mode === "name" && candidate.inRange,
      };
    }),
  };
}

/**
 * Ancla de un indicador. El CSS2DObject centra un elemento de tamaño cero
 * en el punto 3D. El nombre queda solo para el lector: en pantalla manda el glifo.
 */
export function createNameplateElement(
  text: string,
  mark: NameplateMark,
): { anchor: HTMLDivElement; plate: HTMLSpanElement } {
  const anchor = document.createElement("div");
  anchor.className = "nameplate-anchor";
  anchor.dataset.mode = "hidden";
  anchor.dataset.kind = mark;
  anchor.style.setProperty("--nameplate-glyph", `"${NAMEPLATE_GLYPH[mark]}"`);
  const plate = document.createElement("span");
  plate.className = "nameplate";
  const label = document.createElement("span");
  label.className = "sr-only";
  label.textContent = text;
  plate.append(label);
  plate.setAttribute("aria-hidden", "true");
  const pip = document.createElement("span");
  pip.className = "nameplate-pip nameplate-pip--mark";
  pip.setAttribute("aria-hidden", "true");
  anchor.append(plate, pip);
  return { anchor, plate };
}

type ScreenBox = {
  id: string;
  left: number;
  top: number;
  right: number;
  bottom: number;
  priority: number;
  gaze: number;
};

function pickFocus(
  candidates: readonly NameplateCandidate[],
  previousFocusId: string | null,
): NameplateCandidate | null {
  let closestRanged: NameplateCandidate | null = null;
  for (const candidate of candidates) {
    if (!candidate.inRange) continue;
    closestRanged = closestRanged ? closer(closestRanged, candidate) : candidate;
  }
  if (closestRanged) return closestRanged.inView ? closestRanged : null;

  let best: NameplateCandidate | null = null;
  for (const candidate of candidates) {
    if (!gazeEligible(candidate)) continue;
    best = best ? betterGaze(best, candidate) : candidate;
  }
  if (!best) return null;
  if (!previousFocusId || previousFocusId === best.id) return best;
  const previous = candidates.find((candidate) => candidate.id === previousFocusId);
  if (!previous || !gazeEligible(previous)) return best;
  const gazeClose = previous.gaze >= best.gaze - NAMEPLATE_METRICS.gazeStick;
  const notMuchFarther = previous.distance <= best.distance + NAMEPLATE_METRICS.gazeDistanceStick;
  return gazeClose && notMuchFarther ? previous : best;
}

function gazeEligible(candidate: NameplateCandidate): boolean {
  return candidate.inView && candidate.distance <= NAMEPLATE_METRICS.gazeDistance && candidate.gaze >= NAMEPLATE_METRICS.gazeMin;
}

function closer(a: NameplateCandidate, b: NameplateCandidate): NameplateCandidate {
  if (b.distance < a.distance - 1e-6) return b;
  if (a.distance < b.distance - 1e-6) return a;
  return betterGaze(a, b);
}

function betterGaze(a: NameplateCandidate, b: NameplateCandidate): NameplateCandidate {
  if (b.gaze > a.gaze + 1e-6) return b;
  if (a.gaze > b.gaze + 1e-6) return a;
  if (b.distance < a.distance - 1e-6) return b;
  if (a.distance < b.distance - 1e-6) return a;
  return a.id <= b.id ? a : b;
}

function boxFor(candidate: NameplateCandidate, mode: "name" | "pip"): ScreenBox {
  if (mode === "name") {
    const width = Math.max(24, candidate.nameWidth);
    const height = NAMEPLATE_METRICS.nameHeight;
    const left = candidate.x - width / 2;
    const bottom = candidate.y - NAMEPLATE_METRICS.nameLift;
    return {
      id: candidate.id,
      left,
      top: bottom - height,
      right: left + width,
      bottom,
      priority: 1_000_000,
      gaze: candidate.gaze,
    };
  }
  const size = NAMEPLATE_METRICS.pipSize;
  const left = candidate.x - size / 2;
  const bottom = candidate.y - NAMEPLATE_METRICS.pipLift;
  return {
    id: candidate.id,
    left,
    top: bottom - size,
    right: left + size,
    bottom,
    priority: 1_000 - candidate.distance,
    gaze: candidate.gaze,
  };
}

function compareBoxes(a: ScreenBox, b: ScreenBox): number {
  if (b.priority !== a.priority) return b.priority - a.priority;
  if (b.gaze !== a.gaze) return b.gaze - a.gaze;
  if (a.id < b.id) return -1;
  if (a.id > b.id) return 1;
  return 0;
}

function overlaps(a: ScreenBox, b: ScreenBox, gap: number): boolean {
  return a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;
}
