/** Textura única de la tele y ritmo al que se sube a la GPU. */
export const TV_TEXTURE_WIDTH = 256;
export const TV_TEXTURE_HEIGHT = 144;
/** 8 Hz. */
export const TV_BLIT_SECONDS = 0.125;
/** Cerca de los sofás. La máquina queda fuera. */
export const TV_DECODE_RADIUS = 4.2;

export function shouldDecodeTv(input: {
  distance: number;
  reduced: boolean;
  suspended: boolean;
  hidden: boolean;
  hasClip: boolean;
}): boolean {
  if (!input.hasClip || input.reduced || input.suspended || input.hidden) return false;
  return input.distance <= TV_DECODE_RADIUS;
}

export function shouldBlitTv(elapsed: number, interval = TV_BLIT_SECONDS): boolean {
  return elapsed >= interval;
}
