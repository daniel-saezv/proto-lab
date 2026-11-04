import { shapeStick } from "./locomotion";

/** Mitad de pantalla que corresponde a un toque (movimiento vs cámara). */
export function touchScreenSide(clientX: number, viewportWidth: number): "left" | "right" {
  if (viewportWidth <= 0) return "left";
  return clientX < viewportWidth * 0.5 ? "left" : "right";
}

/** La izquierda camina. La derecha mira. No se intercambian. */
export function stickZoneForSide(side: "left" | "right"): "move" | "look" {
  return side === "left" ? "move" : "look";
}

/** Por debajo de esto, dos dedos son un pellizco y no dos sticks. */
export const PINCH_START_PX = 120;
/** Radio del stick: a esta distancia del origen la deflexión es 1. */
export const STICK_RADIUS_PX = 56;

export type StickContact = {
  id: number;
  zone: "move" | "look";
  startX: number;
  startY: number;
  x: number;
  y: number;
};

/**
 * Dos dedos que nacen juntos, o los dos en la misma mitad, son un pellizco.
 * No mueven al personaje ni la cámara. Dos dedos separados, uno por mitad,
 * son los dos sticks a la vez.
 */
export function contactsArePinch(contacts: StickContact[]): boolean {
  if (contacts.length < 2) return false;
  for (let i = 0; i < contacts.length; i++) {
    for (let j = i + 1; j < contacts.length; j++) {
      const a = contacts[i]!;
      const b = contacts[j]!;
      if (a.zone === b.zone) return true;
      const span = Math.hypot(a.startX - b.startX, a.startY - b.startY);
      if (span < PINCH_START_PX) return true;
    }
  }
  return false;
}

/** El primer dedo de esa mitad. Vacío si el gesto es un pellizco. */
export function activeContact(contacts: StickContact[], zone: "move" | "look"): StickContact | null {
  if (contactsArePinch(contacts)) return null;
  return contacts.find((contact) => contact.zone === zone) ?? null;
}

/** x a la derecha, y hacia arriba, recortado al disco del stick. */
export function stickDeflection(contact: StickContact, radius = STICK_RADIUS_PX): { x: number; y: number } {
  const dx = (contact.x - contact.startX) / radius;
  const dy = (contact.startY - contact.y) / radius;
  const mag = Math.hypot(dx, dy);
  if (mag === 0 || mag <= 1) return { x: dx, y: dy };
  return { x: dx / mag, y: dy / mag };
}

/**
 * Escala del stick derecho. 15 (y 7 en vertical) dejaban el giro a fondo
 * en 3,78 rad/s. 6 y 2,8 lo bajaban a 1,51 y 0,51, demasiado quieto.
 * 9,127 y 4,409 quedan cerca de 2,3 y 0,8 rad/s, entre los dos.
 */
export const TOUCH_LOOK_RATE = 9.127;
export const TOUCH_LOOK_RATE_Y = 4.409;
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
