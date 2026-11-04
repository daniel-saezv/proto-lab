/** Foto fija de un prototipo. Misma relación que el clip (320×180) y que la tele. */
export const PREVIEW_STILL_WIDTH = 640;
export const PREVIEW_STILL_HEIGHT = 360;
export const PREVIEW_ASPECT = 16 / 9;
export const ARCADE_ASPECT = 16 / 10;
export const SELECTOR_ASPECT = 16 / 10;
export const TV_ASPECT = 16 / 9;
/** Tope de la foto fija. El clip tiene el suyo (160 KiB). */
export const PREVIEW_STILL_MAX_BYTES = 150 * 1024;

/** Plano de la pantalla del arcade. 16:10, dentro del marco de 1,08×0,74. */
export const ARCADE_SCREEN_HEIGHT = 0.6;
export const ARCADE_SCREEN_WIDTH = ARCADE_SCREEN_HEIGHT * ARCADE_ASPECT;

/**
 * Recorte cover centrado, como `object-fit: cover` + `object-position: center`.
 * `repeat` menor que 1 es la fracción visible de la textura.
 */
export function coverRepeat(imageAspect: number, frameAspect: number): { x: number; y: number } {
  if (!(imageAspect > 0) || !(frameAspect > 0)) return { x: 1, y: 1 };
  if (imageAspect > frameAspect) return { x: frameAspect / imageAspect, y: 1 };
  return { x: 1, y: imageAspect / frameAspect };
}

/** Destino contain centrado. La imagen entra entera. */
export function containDest(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { x: number; y: number; w: number; h: number } {
  if (!(srcW > 0) || !(srcH > 0) || !(dstW > 0) || !(dstH > 0)) return { x: 0, y: 0, w: 0, h: 0 };
  const scale = Math.min(dstW / srcW, dstH / srcH);
  const w = srcW * scale;
  const h = srcH * scale;
  return { x: (dstW - w) / 2, y: (dstH - h) / 2, w, h };
}

/**
 * Región de la foto 16:9 que sigue visible en todas las superficies con cover.
 * En 640×360 es el 16:10 central: 32 px a cada lado.
 */
export function safeZone(sourceAspect: number, frameAspects: readonly number[]) {
  let shownX = 1;
  let shownY = 1;
  for (const frame of frameAspects) {
    const repeat = coverRepeat(sourceAspect, frame);
    shownX = Math.min(shownX, repeat.x);
    shownY = Math.min(shownY, repeat.y);
  }
  return { x: (1 - shownX) / 2, y: (1 - shownY) / 2, width: shownX, height: shownY };
}
