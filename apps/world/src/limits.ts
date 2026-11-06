/** Mantén estos límites iguales a `functions/_lib/validate.ts`. */
export const LIMITS = {
  titleMin: 3,
  titleMax: 80,
  descriptionMin: 10,
  descriptionMax: 2000,
  authorMin: 1,
  authorMax: 80,
  slugMax: 40,
  maxPerDay: 5,
  maxBodyBytes: 8_000,
} as const;
