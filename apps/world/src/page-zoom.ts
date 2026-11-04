/**
 * El doble toque y el pellizco del iPhone agrandan la página. Safari ignora
 * user-scalable, así que se cancela gesturestart. No se detiene la propagación:
 * el segundo dedo tiene que seguir llegando a su stick.
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
  const onFocusOut = () => queueMicrotask(sync);
  doc.addEventListener("gesturestart", onGesture, capture);
  doc.addEventListener("gesturechange", onGesture, capture);
  doc.addEventListener("dblclick", onGesture, capture);
  doc.addEventListener("focusin", sync);
  doc.addEventListener("focusout", onFocusOut);
  const observer = new MutationObserver(sync);
  observer.observe(doc.body, { attributes: true, attributeFilter: ["class"] });
  sync();
  return () => {
    doc.removeEventListener("gesturestart", onGesture, capture);
    doc.removeEventListener("gesturechange", onGesture, capture);
    doc.removeEventListener("dblclick", onGesture, capture);
    doc.removeEventListener("focusin", sync);
    doc.removeEventListener("focusout", onFocusOut);
    observer.disconnect();
  };
}
