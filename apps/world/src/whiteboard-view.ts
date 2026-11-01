/**
 * Plano del tablón (cara hacia +Z). Llena el hueco interior del marco de madera
 * de `addChalkboard`: listones laterales en x = -6.28 y -2.92, largueros en
 * y = 2.48 y 0.64, todos de grosor 0.12.
 */
export const WHITEBOARD_FRAME = {
  x: -4.6,
  y: 1.56,
  z: -7.33,
  width: 3.24,
  height: 1.72,
} as const;

/** Transición al encuadre y de vuelta. Cero si el usuario pide menos movimiento. */
export const WHITEBOARD_VIEW_SECONDS = 0.75;

export type WhiteboardPose = {
  x: number;
  y: number;
  z: number;
  lookX: number;
  lookY: number;
  lookZ: number;
  distance: number;
};

export function whiteboardTransitionSeconds(reducedMotion: boolean): number {
  return reducedMotion ? 0 : WHITEBOARD_VIEW_SECONDS;
}

export function smoothstep01(t: number): number {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
}

/**
 * Coloca la cámara delante del tablón de modo que ancho y alto quepan
 * en el frustum, con un margen. En vertical manda el ancho.
 */
export function whiteboardCameraPose(aspect: number, fovDeg: number, padding = 0.12): WhiteboardPose {
  const frame = WHITEBOARD_FRAME;
  const halfH = (frame.height / 2) * (1 + padding);
  const halfW = (frame.width / 2) * (1 + padding);
  const tanV = Math.tan(((fovDeg * Math.PI) / 180) / 2);
  const safeAspect = Math.max(aspect, 0.25);
  const distance = Math.max(halfH / tanV, halfW / (tanV * safeAspect), 0.9);
  return {
    x: frame.x,
    y: frame.y,
    z: frame.z + distance,
    lookX: frame.x,
    lookY: frame.y,
    lookZ: frame.z,
    distance,
  };
}

/** Mitad del ángulo vertical u horizontal que ocupa el tablón desde esa pose. */
export function whiteboardHalfAngles(pose: WhiteboardPose): { vertical: number; horizontal: number } {
  const frame = WHITEBOARD_FRAME;
  return {
    vertical: Math.atan(frame.height / 2 / pose.distance),
    horizontal: Math.atan(frame.width / 2 / pose.distance),
  };
}
