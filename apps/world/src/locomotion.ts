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

/** Rad por píxel de arrastre. En táctil se combina con la tasa del stick. */
export const ORBIT_SENSITIVITY_COARSE = 0.0042;
export const ORBIT_SENSITIVITY_FINE = 0.00315;

export function applyLook(delta: number, sensitivity: number, maxRadians: number): number {
  const radians = delta * sensitivity;
  return Math.min(maxRadians, Math.max(-maxRadians, radians));
}

/**
 * El stick táctil mantiene una deflexión, no un desplazamiento de píxeles.
 * A 60 Hz esa deflexión por la sensibilidad era el paso de un fotograma;
 * multiplicar por esta referencia la convierte en rad/s para que 120 Hz
 * no gire el doble.
 */
export const TOUCH_LOOK_REF_HZ = 60;
/** Seguir la velocidad objetivo. ~6 da ataque y frenada de unas dos décimas. */
export const TOUCH_LOOK_FOLLOW = 6;

export function lookRateFromDeflection(deflection: number, sensitivity: number, refHz = TOUCH_LOOK_REF_HZ): number {
  return deflection * sensitivity * refHz;
}

/**
 * Recorta la velocidad al acercarse a un tope. En el borde queda en cero,
 * así el pitch no golpea el clamp.
 */
export function softenTowardLimit(
  angle: number,
  velocity: number,
  min: number,
  max: number,
  zone: number,
): number {
  if (!(zone > 0) || velocity === 0) return velocity;
  const room = velocity > 0 ? max - angle : angle - min;
  if (room >= zone) return velocity;
  if (room <= 0) return 0;
  return velocity * (room / zone);
}

/**
 * Dirección de andar en el plano XZ. `forward` y `right` son el stick o
 * el teclado (W/S y D/A). El yaw es el de la cámara: adelante es
 * (sin yaw, −cos yaw) y la derecha, (cos yaw, sin yaw).
 */
export function moveWish(yaw: number, forward: number, right: number): { x: number; z: number } {
  const forwardX = Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  const rightX = Math.cos(yaw);
  const rightZ = Math.sin(yaw);
  return {
    x: right * rightX + forward * forwardX,
    z: right * rightZ + forward * forwardZ,
  };
}

/**
 * Rotación Y de Three.js para que la cara (−Z local) apunte hacia (dirX, dirZ).
 * atan2(dirX, −dirZ) deja la cara en el reflejo y, al ir de lado, el personaje anda de espaldas.
 */
export function facingYaw(dirX: number, dirZ: number): number {
  return Math.atan2(-dirX, -dirZ);
}

/** La cara mira hacia el adelante de la cámara, no hacia el yaw tal cual. */
export function lookFacingYaw(yaw: number): number {
  return facingYaw(Math.sin(yaw), -Math.cos(yaw));
}

export function dampAngle(current: number, target: number, dt: number, sharpness = 8): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-sharpness * dt));
}
