import { shapeStick } from "./locomotion";

/** Mitad de pantalla que corresponde a un toque (movimiento vs cámara). */
export function touchScreenSide(clientX: number, viewportWidth: number): "left" | "right" {
  if (viewportWidth <= 0) return "left";
  return clientX < viewportWidth * 0.5 ? "left" : "right";
}

/** Escala del stick derecho (mirar). Ajustar aquí la sensibilidad táctil. */
export const TOUCH_LOOK_RATE = 18;
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

/** Stick de cámara: tasa de giro por frame (se resetea tras leer). */
export function lookRatesFromStickVector(
  vectorX: number,
  vectorY: number,
  rate = TOUCH_LOOK_RATE,
): { lookX: number; lookY: number } {
  return {
    lookX: curveLookAxis(vectorX) * rate,
    lookY: curveLookAxis(vectorY) * rate,
  };
}

const INTERACTIVE_SELECTOR =
  "button, a[href], input, textarea, select, label, [role='dialog'], #dialogue, #game-selector, #install-help, #stage, #fallback, #boot";

/** true si el toque cae sobre UI u otro control, no sobre el lienzo de juego. */
export function shouldIgnoreTouchAt(clientX: number, clientY: number, root: Document | ShadowRoot = document): boolean {
  const hit = root.elementFromPoint(clientX, clientY);
  if (!hit || typeof (hit as Element).closest !== "function") return true;
  const element = hit as Element;
  if (element.closest(INTERACTIVE_SELECTOR)) return true;
  if (element.closest(".selector-panel, .dialogue-panel, .install-panel")) return true;
  return false;
}
