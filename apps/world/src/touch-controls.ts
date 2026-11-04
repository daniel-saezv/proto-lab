import { create } from "nipplejs";
import {
  activeContact,
  lookRatesFromStickVector,
  movementFromStickVector,
  selectionHostFromEventTarget,
  shouldBlockTextSelection,
  shouldIgnoreTouchAt,
  stickDeflection,
  type StickContact,
} from "./touch-map";

type NippleCollection = ReturnType<typeof create>;

export type TouchControlsHandle = {
  readMovement: () => { forward: number; right: number };
  readLook: () => { lookX: number; lookY: number };
  syncEnabled: () => void;
  reposition: () => void;
  dispose: () => void;
};

const NIPPLE_OPTS = {
  mode: "dynamic" as const,
  multitouch: true,
  maxNumberOfJoysticks: 1,
  size: 112,
  threshold: 0.08,
  fadeTime: 120,
  color: { front: "#ffb703", back: "rgba(255, 255, 255, 0.08)" },
  restOpacity: 0.35,
};

export function attachTouchControls(options: {
  zoneMove: HTMLElement;
  zoneLook: HTMLElement;
  activeMarker: HTMLElement;
  isBlocked: () => boolean;
  onGesture?: () => void;
  onSurfaceTap?: (clientX: number, clientY: number) => void;
}): TouchControlsHandle {
  let activeSticks = 0;
  let zonesEnabled = true;
  const contacts = new Map<number, StickContact>();

  const gestureCapture: AddEventListenerOptions = { capture: true };
  const onGesture = () => options.onGesture?.();

  function setMarkerVisible(visible: boolean) {
    options.activeMarker.hidden = !visible;
    const root = options.zoneMove.closest("#touch-controls");
    if (visible) root?.setAttribute("data-active", "true");
    else root?.removeAttribute("data-active");
    document.body.classList.toggle("joystick-dragging", activeSticks > 0);
  }

  const onSelectStart = (event: Event) => {
    const host = selectionHostFromEventTarget(event.target);
    if (!shouldBlockTextSelection(host, activeSticks > 0)) return;
    event.preventDefault();
  };
  const selectCapture: AddEventListenerOptions = { capture: true };
  document.addEventListener("selectstart", onSelectStart, selectCapture);

  function bumpActive(delta: number) {
    activeSticks = Math.max(0, activeSticks + delta);
    setMarkerVisible(activeSticks > 0);
  }

  function bindZone(zone: HTMLElement, zoneName: StickContact["zone"]) {
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      onGesture();
      if (!zonesEnabled || options.isBlocked() || shouldIgnoreTouchAt(event.clientX, event.clientY)) return;
      contacts.set(event.pointerId, {
        id: event.pointerId,
        zone: zoneName,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
      });
      try {
        zone.setPointerCapture?.(event.pointerId);
      } catch {
        // Un PointerEvent sintético no se puede capturar. El dedo sigue en el mapa por su id.
      }
    };
    const onMove = (event: PointerEvent) => {
      const contact = contacts.get(event.pointerId);
      if (!contact || contact.zone !== zoneName) return;
      contact.x = event.clientX;
      contact.y = event.clientY;
    };
    const onUp = (event: PointerEvent) => {
      onGesture();
      const contact = contacts.get(event.pointerId);
      if (!contact || contact.zone !== zoneName) return;
      const moved = Math.hypot(contact.x - contact.startX, contact.y - contact.startY) > 10;
      const alone = contacts.size === 1;
      contacts.delete(event.pointerId);
      if (alone && !moved && !options.isBlocked()) options.onSurfaceTap?.(event.clientX, event.clientY);
    };
    zone.addEventListener("pointerdown", onDown);
    zone.addEventListener("pointermove", onMove);
    zone.addEventListener("pointerup", onUp);
    zone.addEventListener("pointercancel", onUp);
    zone.addEventListener("touchend", onGesture, gestureCapture);
    return () => {
      zone.removeEventListener("pointerdown", onDown);
      zone.removeEventListener("pointermove", onMove);
      zone.removeEventListener("pointerup", onUp);
      zone.removeEventListener("pointercancel", onUp);
      zone.removeEventListener("touchend", onGesture, gestureCapture);
    };
  }

  const unbindMove = bindZone(options.zoneMove, "move");
  const unbindLook = bindZone(options.zoneLook, "look");

  function wireMarker(collection: NippleCollection) {
    collection.on("start", () => {
      onGesture();
      bumpActive(1);
    });
    collection.on("end", () => {
      bumpActive(-1);
    });
  }

  const moveCollection = create({ ...NIPPLE_OPTS, zone: options.zoneMove });
  const lookCollection = create({ ...NIPPLE_OPTS, zone: options.zoneLook });
  wireMarker(moveCollection);
  wireMarker(lookCollection);

  const resizeObserver = new ResizeObserver(() => {
    moveCollection.reposition();
    lookCollection.reposition();
  });
  resizeObserver.observe(options.zoneMove);
  resizeObserver.observe(options.zoneLook);

  function list(): StickContact[] {
    return [...contacts.values()];
  }

  return {
    readMovement() {
      if (options.isBlocked()) return { forward: 0, right: 0 };
      const contact = activeContact(list(), "move");
      if (!contact) return { forward: 0, right: 0 };
      const vector = stickDeflection(contact);
      return movementFromStickVector(vector.x, vector.y);
    },
    readLook() {
      if (options.isBlocked()) return { lookX: 0, lookY: 0 };
      const contact = activeContact(list(), "look");
      if (!contact) return { lookX: 0, lookY: 0 };
      const vector = stickDeflection(contact);
      return lookRatesFromStickVector(vector.x, vector.y);
    },
    syncEnabled() {
      const en = !options.isBlocked();
      if (en === zonesEnabled) return;
      zonesEnabled = en;
      const pe = en ? "auto" : "none";
      options.zoneMove.style.pointerEvents = pe;
      options.zoneLook.style.pointerEvents = pe;
      if (!en) {
        contacts.clear();
        activeSticks = 0;
        setMarkerVisible(false);
      }
    },
    reposition() {
      moveCollection.reposition();
      lookCollection.reposition();
    },
    dispose() {
      unbindMove();
      unbindLook();
      document.removeEventListener("selectstart", onSelectStart, selectCapture);
      resizeObserver.disconnect();
      moveCollection.destroy();
      lookCollection.destroy();
      contacts.clear();
      activeSticks = 0;
      setMarkerVisible(false);
    },
  };
}
