/**
 * Distancia y órbita de la cámara de seguimiento.
 *
 * El retrato pedía 6,4 desde el primer commit. Al crecer la sala esa cifra
 * se ve entera y en el teléfono el plano se iba demasiado lejos. 4,2 se quedó
 * corto. 5,2 está entre los dos. El escritorio sube en la misma proporción
 * (3,8 × 5,2 / 4,2 ≈ 4,7): por encima del 3,8 de siempre y por debajo del 6,4.
 */
export const FOLLOW_DISTANCE_DESKTOP = 4.7;
export const FOLLOW_DISTANCE_PORTRAIT = 5.2;
/** Tope de escritorio antes de relajarlo con el retrato. */
export const FOLLOW_DISTANCE_DESKTOP_BEFORE = 3.8;
/** Tope anterior en retrato, el que la sala ya no recortaba. */
export const FOLLOW_DISTANCE_PORTRAIT_BEFORE = 6.4;
/** Más cerca de esto la cámara entra en el personaje. */
export const FOLLOW_DISTANCE_MIN = 1.9;

export type FollowRig = {
  yaw: number;
  pitch: number;
  distance: number;
};

export function maxFollowDistance(aspect: number): number {
  return aspect < 0.9 ? FOLLOW_DISTANCE_PORTRAIT : FOLLOW_DISTANCE_DESKTOP;
}

export function clampFollowDistance(distance: number, aspect: number): number {
  const max = maxFollowDistance(aspect);
  if (!Number.isFinite(distance)) return max;
  return Math.min(max, Math.max(FOLLOW_DISTANCE_MIN, distance));
}

export function captureFollowRig(yaw: number, pitch: number, distance: number): FollowRig {
  return { yaw, pitch, distance };
}

/** Al salir de un plano se vuelve a este encuadre, no al tope de alejamiento. */
export function rigForReturn(saved: FollowRig | null, fallback: FollowRig, aspect: number): FollowRig {
  const source = saved ?? fallback;
  return {
    yaw: source.yaw,
    pitch: source.pitch,
    distance: clampFollowDistance(source.distance, aspect),
  };
}

/** Rueda: deltaY positivo aleja. El pellizco del trackpad también llega como rueda. */
export function followDistanceAfterWheel(distance: number, deltaY: number, aspect: number): number {
  if (!Number.isFinite(deltaY) || deltaY === 0) return clampFollowDistance(distance, aspect);
  const factor = Math.exp(deltaY * 0.0015);
  return clampFollowDistance(distance * factor, aspect);
}
