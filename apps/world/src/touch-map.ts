import { shapeStick } from "./locomotion";

/** Mitad de pantalla que corresponde a un toque (movimiento vs cámara). */
export function touchScreenSide(clientX: number, viewportWidth: number): "left" | "right" {
  if (viewportWidth <= 0) return "left";
  return clientX < viewportWidth * 0.5 ? "left" : "right";
}

/**
 * Escala del stick derecho. El horizontal (giro) queda un poco por debajo
 * del valor inicial (18). El vertical (inclinar hacia el personaje) es
 * menos de la mitad: en el teléfono se sentía demasiado vivo.
 */
export const TOUCH_LOOK_RATE = 15;
export const TOUCH_LOOK_RATE_Y = 7;
/** Exponente >1 suaviza gestos pequeños; a fondo sigue llegando a ~1. */
export const TOUCH_LOOK_CURVE = 1.45;

/** Vector nipplejs (-1…1) → avance/lateral con la misma curva que el joystick fijo. */
export function movementFromStickVector(vectorX: number, vectorY: number): { forward: number; right: number } {
  // En pantalla nipplejs, Y positivo = empujar hacia arriba (avanzar en el lobby).
  const shaped = shapeStick(vectorX, vectorY);
  return { forward: shaped.y, right: shaped.x };
}

function curveLookAxis(value: number): number {
  const sign = Math.sign(value);
  const mag = Math.abs(value);
  if (mag === 0) return 0;
  return sign * mag ** TOUCH_LOOK_CURVE;
}

/** Stick de cámara: deflexión curvada, con tasa distinta en cada eje. */
export function lookRatesFromStickVector(
  vectorX: number,
  vectorY: number,
  rate = TOUCH_LOOK_RATE,
  rateY = TOUCH_LOOK_RATE_Y,
): { lookX: number; lookY: number } {
  return {
    lookX: curveLookAxis(vectorX) * rate,
    lookY: curveLookAxis(vectorY) * rateY,
  };
}

const INTERACTIVE_SELECTOR =
  "button, a[href], input, textarea, select, label, [role='dialog'], #dialogue, #game-selector, #install-help, #stage, #fallback, #boot";

/** Campos donde copiar y pegar tiene que seguir funcionando. */
export const TEXT_SELECTION_EDITABLE = "input, textarea, select, [contenteditable='true']";

/** Cromo del lobby: un arrastre no debe subrayarlo ni abrir el menú de copiar. */
export const TEXT_SELECTION_CHROME = "button, #hint, #labels, #touch-controls, #interact, #mute-music, #board-back";

export type SelectionHost = {
  closest?: (selector: string) => unknown;
  parentElement?: SelectionHost | null;
};

/** Elige el elemento que puede responder a closest, también si el evento cae en un nodo de texto. */
export function selectionHostFromEventTarget(target: EventTarget | SelectionHost | null): SelectionHost | null {
  if (target == null || typeof target !== "object") return null;
  const node = target as SelectionHost;
  if (typeof node.closest === "function") return node;
  const parent = node.parentElement ?? null;
  if (parent && typeof parent.closest === "function") return parent;
  return null;
}

/**
 * true si hay que cancelar selectstart.
 * Con el joystick activo se bloquea todo menos los campos.
 * En reposo solo el cromo (botones, pista, etiquetas): el diálogo y la ayuda se pueden copiar.
 */
export function shouldBlockTextSelection(host: SelectionHost | null, joystickActive: boolean): boolean {
  if (host == null || typeof host.closest !== "function") return false;
  if (host.closest(TEXT_SELECTION_EDITABLE)) return false;
  if (joystickActive) return true;
  return Boolean(host.closest(TEXT_SELECTION_CHROME));
}

/** true si el toque cae sobre UI u otro control, no sobre el lienzo de juego. */
export function shouldIgnoreTouchAt(clientX: number, clientY: number, root: Document | ShadowRoot = document): boolean {
  const hit = root.elementFromPoint(clientX, clientY);
  if (!hit || typeof (hit as Element).closest !== "function") return true;
  const element = hit as Element;
  if (element.closest(INTERACTIVE_SELECTOR)) return true;
  if (element.closest(".selector-panel, .dialogue-panel, .install-panel")) return true;
  return false;
}
