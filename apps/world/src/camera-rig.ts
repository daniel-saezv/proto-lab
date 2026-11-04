/**
 * Distancia y órbita de la cámara de seguimiento.
 *
 * El retrato pedía 6,4 desde el primer commit. Al crecer la sala esa cifra
 * se ve entera y en el teléfono el plano se iba demasiado lejos. 4,2 sigue
 * siendo un poco más largo que el de escritorio (3,8) porque el fov vertical
 * es más abierto y el encuadre horizontal, más estrecho.
 */
export const FOLLOW_DISTANCE_DESKTOP = 3.8;
export const FOLLOW_DISTANCE_PORTRAIT = 4.2;
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

/** Pellizco: los dedos se separan (escala > 1) y la cámara se acerca. */
export function followDistanceAfterPinch(distance: number, scale: number, aspect: number): number {
  if (!(scale > 0) || !Number.isFinite(scale)) return clampFollowDistance(distance, aspect);
  return clampFollowDistance(distance / scale, aspect);
}

export function pinchScale(previousSpan: number, nextSpan: number): number | null {
  if (!(previousSpan > 0) || !(nextSpan > 0)) return null;
  return nextSpan / previousSpan;
}
