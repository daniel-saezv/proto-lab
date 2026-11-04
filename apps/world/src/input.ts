import { shapeStick } from "./locomotion";
import { attachTouchControls, type TouchControlsHandle } from "./touch-controls";

export type InputHandle = {
  read: () => { forward: number; right: number; lookX: number; lookY: number };
  resetLook: () => void;
  rebind: (canvas: HTMLElement) => void;
  dispose: () => void;
};

export function attachInput(options: {
  canvas: HTMLElement;
  isBlocked: () => boolean;
  onGesture?: () => void;
  onSurfaceTap?: (clientX: number, clientY: number) => void;
  touch?: {
    zoneMove: HTMLElement;
    zoneLook: HTMLElement;
    activeMarker: HTMLElement;
    onZoom?: (scale: number) => void;
  };
}): InputHandle {
  const keys = new Set<string>();
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lookX = 0;
  let lookY = 0;

  const touchControls: TouchControlsHandle | null = options.touch
    ? attachTouchControls({
        zoneMove: options.touch.zoneMove,
        zoneLook: options.touch.zoneLook,
        activeMarker: options.touch.activeMarker,
        isBlocked: options.isBlocked,
        onGesture: options.onGesture,
        onSurfaceTap: options.onSurfaceTap,
        onZoom: options.touch.onZoom,
      })
    : null;

  const onKeyDown = (event: KeyboardEvent) => {
    if (isTyping(event.target) || options.isBlocked()) return;
    keys.add(event.key.toLowerCase());
  };
  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.key.toLowerCase());
  };
  const onBlur = () => {
    keys.clear();
    dragging = false;
  };

  let canvas = options.canvas;
  const onPointerDown = (event: PointerEvent) => {
    if (options.touch || options.isBlocked() || event.button !== 0) return;
    onGesture();
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (options.touch || !dragging || options.isBlocked()) return;
    lookX += event.clientX - lastX;
    lookY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  };
  const onGesture = () => {
    options.onGesture?.();
  };
  const onPointerUp = () => {
    onGesture();
    dragging = false;
  };

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  const gestureCapture: AddEventListenerOptions = { capture: true };
  const bindCanvas = () => {
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);
    canvas.addEventListener("pointercancel", onPointerUp);
    canvas.addEventListener("touchend", onGesture, gestureCapture);
  };
  const unbindCanvas = () => {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("touchend", onGesture, gestureCapture);
  };
  bindCanvas();

  return {
    read() {
      touchControls?.syncEnabled();
      if (options.isBlocked()) return { forward: 0, right: 0, lookX: 0, lookY: 0 };
      let forward = 0;
      let right = 0;
      if (keys.has("w") || keys.has("arrowup")) forward += 1;
      if (keys.has("s") || keys.has("arrowdown")) forward -= 1;
      if (keys.has("d") || keys.has("arrowright")) right += 1;
      if (keys.has("a") || keys.has("arrowleft")) right -= 1;

      if (touchControls) {
        const move = touchControls.readMovement();
        forward = move.forward;
        right = move.right;
        const look = touchControls.readLook();
        lookX = look.lookX;
        lookY = look.lookY;
      }

      const length = Math.hypot(forward, right);
      if (length > 1) {
        forward /= length;
        right /= length;
      }
      return { forward, right, lookX, lookY };
    },
    resetLook() {
      lookX = 0;
      lookY = 0;
    },
    rebind(next: HTMLElement) {
      unbindCanvas();
      canvas = next;
      bindCanvas();
    },
    dispose() {
      touchControls?.dispose();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      unbindCanvas();
    },
  };
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
