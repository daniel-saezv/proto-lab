/**
 * Cocina contra el muro este.
 * La nevera da la espalda al muro y la puerta mira al oeste, hacia la sala.
 * La encimera sigue hacia el norte. Las camas quedan al sur, junto a la cocina.
 */

export const FRIDGE_DEPTH = 0.58;
export const FRIDGE_WIDTH = 0.76;

export const FRIDGE_PLACE = { x: 9.28, z: 6.05 } as const;

/** Bisagra en la esquina noroeste. La puerta crece hacia −Z y abre hacia la sala. */
export const FRIDGE_HINGE = {
  x: FRIDGE_PLACE.x - FRIDGE_DEPTH / 2,
  y: 0.66,
  z: FRIDGE_PLACE.z + FRIDGE_WIDTH / 2,
} as const;

/** Centro de la encimera, pegada al norte de la nevera. */
export const PANTRY_COUNTER = { x: 9.3, z: 7.38, collider: 0.82 } as const;

/** Delante del tirador, al suroeste de la puerta. */
export const PANTRY_STAND = { x: 8.22, z: 5.58 } as const;

export const KITCHEN_TABLE = { x: 7.58, z: 7.48, collider: 0.46 } as const;

export const KITCHEN_BIN = { x: 9.4, z: 5.22, collider: 0.18 } as const;

/** Camas al sur de la cocina, una al lado de la otra. */
export const DOG_BED = { x: 7.72, z: 4.72 } as const;
export const CAT_BED = { x: 8.42, z: 4.48 } as const;

/** A los pies de Remolón, junto al brazo norte del sofá. */
export const DOG_VISIT = { x: -7.95, z: -3.25, host: "remolon" } as const;

/** A los pies de Naipe, en el extremo este de su sofá. */
export const CAT_VISIT = { x: -5.95, z: -2.15, host: "naipe" } as const;

/** Mirada local −X hacia el este, de cara a la cocina. */
export const DOG_HOME_YAW = Math.PI / 2;
export const CAT_HOME_YAW = Math.PI / 2;
