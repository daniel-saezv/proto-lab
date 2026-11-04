/**
 * El doble toque y el pellizco no escalan la página ni la cámara.
 * Un motor ignora el tope del viewport y emite `gesturestart` y `gesturechange`,
 * eventos que los demás no tienen: se cancelan solo esos. No se detiene la
 * propagación, para que el segundo dedo siga llegando a su stick.
 * El `dblclick` se cancela solo si el doble toque viene de una entrada táctil.
 * El doble clic del escritorio sigue su curso.
 * Un campo o la aplicación abierta siguen pudiendo escalar.
 */
export const LOCKED_VIEWPORT =
  "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover";
export const FREE_VIEWPORT = "width=device-width, initial-scale=1, viewport-fit=cover";

const EDITABLE = "input, textarea, select, [contenteditable='true']";

export type ZoomTarget = {
  closest?: (selector: string) => unknown;
};

export function pageZoomAllowed(target: EventTarget | ZoomTarget | null): boolean {
  if (target == null || typeof target !== "object") return false;
  const node = target as ZoomTarget;
  if (typeof node.closest !== "function") return false;
  if (node.closest(EDITABLE)) return true;
  if (node.closest("#stage")) return true;
  return false;
}

export function viewportContentFor(allow: boolean): string {
  return allow ? FREE_VIEWPORT : LOCKED_VIEWPORT;
}

/** Ventana entre el último toque y el dblclick que el navegador sintetiza. */
export const DBLCLICK_TOUCH_WINDOW_MS = 750;

export type PointerStamp = {
  pointerType?: string;
  timeStamp?: number;
};

export type DblclickProbe = {
  timeStamp?: number;
  sourceCapabilities?: { firesTouchEvents?: boolean } | null;
};

/** Marca de tiempo si el puntero es táctil. El ratón no deja marca. */
export function touchStampFromPointer(event: PointerStamp): number | null {
  if (event.pointerType !== "touch") return null;
  return typeof event.timeStamp === "number" ? event.timeStamp : null;
}

/**
 * El doble toque táctil sintetiza un dblclick. El doble clic del ratón no.
 * `firesTouchEvents` lo rellena un motor; el otro solo deja el puntero reciente.
 */
export function shouldCancelDblclick(event: DblclickProbe, lastTouchAt: number): boolean {
  if (event.sourceCapabilities?.firesTouchEvents === true) return true;
  if (!(lastTouchAt > 0) || typeof event.timeStamp !== "number") return false;
  const delta = event.timeStamp - lastTouchAt;
  return delta >= 0 && delta <= DBLCLICK_TOUCH_WINDOW_MS;
}

export function bindPageZoom(doc: Document): () => void {
  const meta = doc.querySelector('meta[name="viewport"]');
  const sync = () => {
    if (!meta) return;
    const active = doc.activeElement;
    const typing = active instanceof Element && pageZoomAllowed(active);
    const app = doc.body.classList.contains("prototype-open");
    meta.setAttribute("content", viewportContentFor(typing || app));
  };
  const onGesture = (event: Event) => {
    if (pageZoomAllowed(event.target)) return;
    if (doc.body.classList.contains("prototype-open")) return;
    event.preventDefault();
  };
  const capture: AddEventListenerOptions = { capture: true, passive: false };
  const rememberTouch: AddEventListenerOptions = { capture: true, passive: true };
  let lastTouchAt = 0;
  const onPointer = (event: Event) => {
    const stamp = touchStampFromPointer(event as PointerStamp);
    if (stamp == null) return;
    lastTouchAt = stamp;
  };
  const onDblClick = (event: Event) => {
    if (!shouldCancelDblclick(event as DblclickProbe, lastTouchAt)) return;
    onGesture(event);
  };
  const onFocusOut = () => queueMicrotask(sync);
  doc.addEventListener("pointerdown", onPointer, rememberTouch);
  doc.addEventListener("gesturestart", onGesture, capture);
  doc.addEventListener("gesturechange", onGesture, capture);
  doc.addEventListener("dblclick", onDblClick, capture);
  doc.addEventListener("focusin", sync);
  doc.addEventListener("focusout", onFocusOut);
  const observer = new MutationObserver(sync);
  observer.observe(doc.body, { attributes: true, attributeFilter: ["class"] });
  sync();
  return () => {
    doc.removeEventListener("pointerdown", onPointer, rememberTouch);
    doc.removeEventListener("gesturestart", onGesture, capture);
    doc.removeEventListener("gesturechange", onGesture, capture);
    doc.removeEventListener("dblclick", onDblClick, capture);
    doc.removeEventListener("focusin", sync);
    doc.removeEventListener("focusout", onFocusOut);
    observer.disconnect();
  };
}
