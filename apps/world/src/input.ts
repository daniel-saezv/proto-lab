import { shapeStick } from "./locomotion";

export type InputHandle = {
  read: () => { forward: number; right: number; lookX: number; lookY: number };
  resetLook: () => void;
  dispose: () => void;
};

export function attachInput(options: {
  canvas: HTMLElement;
  joystick: HTMLElement;
  knob: HTMLElement;
  isBlocked: () => boolean;
}): InputHandle {
  const keys = new Set<string>();
  let joyForward = 0;
  let joyRight = 0;
  let joyActive = false;
  let dragging = false;
  let lastX = 0;
  let lastY = 0;
  let lookX = 0;
  let lookY = 0;

  const onKeyDown = (event: KeyboardEvent) => {
    if (isTyping(event.target) || options.isBlocked()) return;
    keys.add(event.key.toLowerCase());
  };
  const onKeyUp = (event: KeyboardEvent) => {
    keys.delete(event.key.toLowerCase());
  };
  const onBlur = () => {
    keys.clear();
    joyActive = false;
    dragging = false;
    joyForward = 0;
    joyRight = 0;
    options.knob.style.transform = "translate(-50%, -50%)";
  };

  const onPointerDown = (event: PointerEvent) => {
    if (options.isBlocked() || event.button !== 0) return;
    dragging = true;
    lastX = event.clientX;
    lastY = event.clientY;
    options.canvas.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!dragging || options.isBlocked()) return;
    lookX += event.clientX - lastX;
    lookY += event.clientY - lastY;
    lastX = event.clientX;
    lastY = event.clientY;
  };
  const onPointerUp = () => {
    dragging = false;
  };

  const onJoyDown = (event: PointerEvent) => {
    if (options.isBlocked()) return;
    joyActive = true;
    options.joystick.setPointerCapture(event.pointerId);
    moveJoy(event);
  };
  const onJoyMove = (event: PointerEvent) => {
    if (!joyActive) return;
    moveJoy(event);
  };
  const onJoyUp = () => {
    joyActive = false;
    joyForward = 0;
    joyRight = 0;
    options.knob.style.transform = "translate(-50%, -50%)";
  };

  function moveJoy(event: PointerEvent) {
    const rect = options.joystick.getBoundingClientRect();
    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const max = rect.width / 2 - 10;
    const mag = Math.hypot(dx, dy) || 1;
    const clamped = Math.min(mag, max);
    const nx = dx / mag;
    const ny = dy / mag;
    options.knob.style.transform = `translate(calc(-50% + ${nx * clamped}px), calc(-50% + ${ny * clamped}px))`;
    joyRight = (nx * clamped) / max;
    joyForward = -(ny * clamped) / max;
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", onBlur);
  options.canvas.addEventListener("pointerdown", onPointerDown);
  options.canvas.addEventListener("pointermove", onPointerMove);
  options.canvas.addEventListener("pointerup", onPointerUp);
  options.canvas.addEventListener("pointercancel", onPointerUp);
  options.joystick.addEventListener("pointerdown", onJoyDown);
  options.joystick.addEventListener("pointermove", onJoyMove);
  options.joystick.addEventListener("pointerup", onJoyUp);
  options.joystick.addEventListener("pointercancel", onJoyUp);

  return {
    read() {
      if (options.isBlocked()) return { forward: 0, right: 0, lookX: 0, lookY: 0 };
      let forward = 0;
      let right = 0;
      if (keys.has("w") || keys.has("arrowup")) forward += 1;
      if (keys.has("s") || keys.has("arrowdown")) forward -= 1;
      if (keys.has("d") || keys.has("arrowright")) right += 1;
      if (keys.has("a") || keys.has("arrowleft")) right -= 1;
      if (joyActive) {
        const shaped = shapeStick(joyRight, joyForward);
        forward = shaped.y;
        right = shaped.x;
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
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      options.canvas.removeEventListener("pointerdown", onPointerDown);
      options.canvas.removeEventListener("pointermove", onPointerMove);
      options.canvas.removeEventListener("pointerup", onPointerUp);
      options.canvas.removeEventListener("pointercancel", onPointerUp);
      options.joystick.removeEventListener("pointerdown", onJoyDown);
      options.joystick.removeEventListener("pointermove", onJoyMove);
      options.joystick.removeEventListener("pointerup", onJoyUp);
      options.joystick.removeEventListener("pointercancel", onJoyUp);
    },
  };
}

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}
