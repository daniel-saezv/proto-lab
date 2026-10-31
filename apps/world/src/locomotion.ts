/** Zona muerta y curva del joystick. El centro no mueve; a fondo llega a 1. */
export const JOY_DEADZONE = 0.16;
export const JOY_CURVE = 1.65;

export const WALK_ACCEL = 18;
export const WALK_DECEL = 26;
export const WALK_SPEED = 4.2;

export function shapeStick(x: number, y: number, deadzone = JOY_DEADZONE, curve = JOY_CURVE): { x: number; y: number } {
  const mag = Math.hypot(x, y);
  if (mag <= deadzone || mag === 0) return { x: 0, y: 0 };
  const scaled = Math.min(1, (mag - deadzone) / (1 - deadzone));
  const curved = scaled ** curve;
  return { x: (x / mag) * curved, y: (y / mag) * curved };
}

export function approachVelocity(current: number, target: number, dt: number, accel = WALK_ACCEL, decel = WALK_DECEL): number {
  const delta = target - current;
  const speeding = Math.abs(target) > Math.abs(current) && target * current >= 0;
  const step = (speeding ? accel : decel) * dt;
  if (Math.abs(delta) <= step) return target;
  return current + Math.sign(delta) * step;
}

/** Si el muro se comió el paso, suelta la velocidad de ese eje para no quedar pegado. */
export function dampBlockedAxis(velocity: number, moved: number, dt: number): number {
  const intended = velocity * dt;
  if (Math.abs(intended) < 1e-4) return velocity;
  if (Math.abs(moved) < Math.abs(intended) * 0.35) return velocity * 0.25;
  return velocity;
}

export function smoothLookInput(previous: number, delta: number, dt: number, responsiveness = 16): number {
  const t = 1 - Math.exp(-responsiveness * dt);
  return previous + (delta - previous) * t;
}

export function applyLook(delta: number, sensitivity: number, maxRadians: number): number {
  const radians = delta * sensitivity;
  return Math.min(maxRadians, Math.max(-maxRadians, radians));
}

export function dampAngle(current: number, target: number, dt: number, sharpness = 8): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-sharpness * dt));
}
