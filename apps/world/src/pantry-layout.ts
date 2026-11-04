/**
 * Rincón de cocina junto a la nevera.
 * La encimera queda al norte del perro y fuera del paso (7.3, 5.1).
 * Quien abre la nevera se planta al oeste del tirador, sin cruzar el escritorio.
 */
export const PANTRY_COUNTER = { x: 7.85, z: 7.62, collider: 0.38 } as const;

/** Junto a la puerta, del lado del tirador. */
export const PANTRY_STAND = { x: 8.55, z: 6.72 } as const;

/** Siesta del perro, al sur de su sitio y fuera del camino a la nevera. */
export const DOG_NAP = { x: 8.22, z: 5.08 } as const;

/** El gato baja de las cajas un poco hacia el suroeste. */
export const CAT_NAP = { x: 7.92, z: 4.62 } as const;
