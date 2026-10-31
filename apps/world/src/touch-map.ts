import { shapeStick } from "./locomotion";

/** Mitad de pantalla que corresponde a un toque (movimiento vs cámara). */
export function touchScreenSide(clientX: number, viewportWidth: number): "left" | "right" {
  if (viewportWidth <= 0) return "left";
  return clientX < viewportWidth * 0.5 ? "left" : "right";
}

/** Vector nipplejs (-1…1) → avance/lateral con la misma curva que el joystick fijo. */
export function movementFromStickVector(vectorX: number, vectorY: number): { forward: number; right: number } {
  const shaped = shapeStick(vectorX, -vectorY);
  return { forward: shaped.y, right: shaped.x };
}

/** Stick de cámara: tasa de giro por frame (se resetea tras leer). */
export function lookRatesFromStickVector(
  vectorX: number,
  vectorY: number,
  pixelsPerUnit = 42,
): { lookX: number; lookY: number } {
  return { lookX: vectorX * pixelsPerUnit, lookY: vectorY * pixelsPerUnit };
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
