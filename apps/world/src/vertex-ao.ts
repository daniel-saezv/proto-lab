import { BufferAttribute, BufferGeometry } from "three";

export type ShadeSpot = { x: number; y: number; r: number };

/** UV del suelo 20×24 centrado en z = 2. u a lo largo de X, v a lo largo del eje local Y. */
export function floorUv(worldX: number, worldZ: number): { u: number; v: number } {
  const localY = 2 - worldZ;
  return { u: (worldX + 10) / 20, v: (localY + 12) / 24 };
}

/**
 * Factor 0.62–1 para multiplicar el color del material.
 * Oscurece el borde del plano y unos discos (muebles).
 */
export function floorShade(x: number, y: number, halfW: number, halfH: number, spots: readonly ShadeSpot[]): number {
  const edge = Math.max(edgeBand(Math.abs(x) / halfW), edgeBand(Math.abs(y) / halfH));
  let shade = 1 - edge * 0.26;
  for (const spot of spots) {
    const reach = Math.max(spot.r, 0.001);
    const t = 1 - Math.hypot(x - spot.x, y - spot.y) / reach;
    if (t > 0) shade *= 1 - t * t * 0.2;
  }
  return clampShade(shade);
}

/** 0 en la base del muro, 1 en la coronación. `y` y `height` en el mismo espacio. */
export function wallShade(yFromBottom: number, height: number): number {
  const t = height <= 0 ? 1 : Math.min(1, Math.max(0, yFromBottom / height));
  return 0.74 + t * 0.26;
}

export function applyShade(geometry: BufferGeometry, shadeAt: (x: number, y: number, z: number) => number) {
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const shade = shadeAt(position.getX(i), position.getY(i), position.getZ(i));
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geometry.setAttribute("color", new BufferAttribute(colors, 3));
}

function edgeBand(unit: number): number {
  const t = Math.min(1, Math.max(0, (unit - 0.78) / 0.22));
  return t * t;
}

function clampShade(value: number): number {
  return Math.min(1, Math.max(0.62, value));
}
