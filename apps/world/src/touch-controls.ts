import { create } from "nipplejs";
import { pinchScale } from "./camera-rig";
import {
  lookRatesFromStickVector,
  movementFromStickVector,
  selectionHostFromEventTarget,
  shouldBlockTextSelection,
  shouldIgnoreTouchAt,
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
  onZoom?: (scale: number) => void;
}): TouchControlsHandle {
  let moveForward = 0;
  let moveRight = 0;
  let lookX = 0;
  let lookY = 0;
  let activeSticks = 0;
  let zonesEnabled = true;
  let pinching = false;

  const tapState = { down: false, x: 0, y: 0, moved: false, side: null as "move" | "look" | null };

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

  function bindTapZone(zone: HTMLElement, side: "move" | "look") {
    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      onGesture();
      if (!zonesEnabled || options.isBlocked() || shouldIgnoreTouchAt(event.clientX, event.clientY)) return;
      tapState.down = true;
      tapState.x = event.clientX;
      tapState.y = event.clientY;
      tapState.moved = false;
      tapState.side = side;
    };
    const onMove = (event: PointerEvent) => {
      if (!tapState.down || tapState.side !== side) return;
      if (Math.hypot(event.clientX - tapState.x, event.clientY - tapState.y) > 10) tapState.moved = true;
    };
    const onUp = (event: PointerEvent) => {
      onGesture();
      if (!tapState.down || tapState.side !== side) return;
      tapState.down = false;
      if (!tapState.moved && !pinching && !options.isBlocked()) {
        options.onSurfaceTap?.(event.clientX, event.clientY);
      }
      tapState.side = null;
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

  const unbindMoveTap = bindTapZone(options.zoneMove, "move");
  const unbindLookTap = bindTapZone(options.zoneLook, "look");
  const unbindPinch = bindPinch(options.zoneMove.parentElement, options.onZoom, (active) => {
    pinching = active;
    if (active) {
      lookX = 0;
      lookY = 0;
      moveForward = 0;
      moveRight = 0;
    }
  });

  function wireMove(collection: NippleCollection) {
    collection.on("start", () => {
      onGesture();
      bumpActive(1);
    });
    collection.on("end", () => {
      bumpActive(-1);
      moveForward = 0;
      moveRight = 0;
    });
    collection.on("move", (evt: { data: { vector: { x: number; y: number } } }) => {
      if (options.isBlocked()) return;
      const { forward, right } = movementFromStickVector(evt.data.vector.x, evt.data.vector.y);
      moveForward = forward;
      moveRight = right;
    });
  }

  function wireLook(collection: NippleCollection) {
    collection.on("start", () => {
      onGesture();
      bumpActive(1);
    });
    collection.on("end", () => {
      bumpActive(-1);
      lookX = 0;
      lookY = 0;
    });
    collection.on("move", (evt: { data: { vector: { x: number; y: number } } }) => {
      if (options.isBlocked()) return;
      const rates = lookRatesFromStickVector(evt.data.vector.x, evt.data.vector.y);
      lookX = rates.lookX;
      lookY = rates.lookY;
    });
  }

  const moveCollection = create({ ...NIPPLE_OPTS, zone: options.zoneMove });
  const lookCollection = create({ ...NIPPLE_OPTS, zone: options.zoneLook });
  wireMove(moveCollection);
  wireLook(lookCollection);

  const resizeObserver = new ResizeObserver(() => {
    moveCollection.reposition();
    lookCollection.reposition();
  });
  resizeObserver.observe(options.zoneMove);
  resizeObserver.observe(options.zoneLook);

  return {
    readMovement() {
      if (options.isBlocked() || pinching) return { forward: 0, right: 0 };
      return { forward: moveForward, right: moveRight };
    },
    readLook() {
      if (options.isBlocked() || pinching) return { lookX: 0, lookY: 0 };
      return { lookX, lookY };
    },
    syncEnabled() {
      const en = !options.isBlocked();
      if (en === zonesEnabled) return;
      zonesEnabled = en;
      const pe = en ? "auto" : "none";
      options.zoneMove.style.pointerEvents = pe;
      options.zoneLook.style.pointerEvents = pe;
      if (!en) {
        moveForward = 0;
        moveRight = 0;
        lookX = 0;
        lookY = 0;
        activeSticks = 0;
        setMarkerVisible(false);
      }
    },
    reposition() {
      moveCollection.reposition();
      lookCollection.reposition();
    },
    dispose() {
      unbindMoveTap();
      unbindLookTap();
      unbindPinch();
      document.removeEventListener("selectstart", onSelectStart, selectCapture);
      resizeObserver.disconnect();
      moveCollection.destroy();
      lookCollection.destroy();
      activeSticks = 0;
      setMarkerVisible(false);
    },
  };
}

function bindPinch(
  root: HTMLElement | null,
  onZoom: ((scale: number) => void) | undefined,
  setActive: (active: boolean) => void,
): () => void {
  if (!root || !onZoom) return () => {};
  const points = new Map<number, { x: number; y: number }>();
  let span = 0;
  const measure = () => {
    const all = [...points.values()];
    if (all.length < 2) return 0;
    return Math.hypot(all[0]!.x - all[1]!.x, all[0]!.y - all[1]!.y);
  };
  const refresh = () => {
    setActive(points.size >= 2);
    span = points.size >= 2 ? measure() : 0;
  };
  const onDown = (event: PointerEvent) => {
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    refresh();
  };
  const onMove = (event: PointerEvent) => {
    if (!points.has(event.pointerId)) return;
    points.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (points.size < 2 || span <= 0) return;
    const next = measure();
    const scale = pinchScale(span, next);
    span = next;
    if (scale == null || Math.abs(scale - 1) < 0.001) return;
    onZoom(scale);
  };
  const onUp = (event: PointerEvent) => {
    points.delete(event.pointerId);
    refresh();
  };
  const capture: AddEventListenerOptions = { capture: true, passive: true };
  root.addEventListener("pointerdown", onDown, capture);
  root.addEventListener("pointermove", onMove, capture);
  root.addEventListener("pointerup", onUp, capture);
  root.addEventListener("pointercancel", onUp, capture);
  return () => {
    root.removeEventListener("pointerdown", onDown, capture);
    root.removeEventListener("pointermove", onMove, capture);
    root.removeEventListener("pointerup", onUp, capture);
    root.removeEventListener("pointercancel", onUp, capture);
    setActive(false);
  };
}
