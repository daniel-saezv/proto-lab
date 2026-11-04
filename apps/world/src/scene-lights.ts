import {
  CylinderGeometry,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PointLight,
  type BufferGeometry,
  type Material,
  type MeshLambertMaterial,
} from "three";
import { LAYOUT, ROOM_INNER } from "./navigation";

/**
 * Las lámparas son mobiliario: pantalla cónica y una banda de luz en la boca.
 * El ámbar saturado queda para anillos y pastillas de interacción.
 */
export const INDICATOR_AMBER = 0xffb703;
export const LAMP_BULB = 0xfff4e4;
export const LAMP_GLOW = 0xffd2a6;
export const LAMP_SHADE = 0x2c261f;
export const LAMP_METAL = 0x8a93a3;

export type ShadeSpec = {
  height: number;
  topRadius: number;
  bottomRadius: number;
};

/** Banda plana en la boca de la pantalla. No es una esfera ni un anillo de suelo. */
export type LampGlow = {
  /** Respecto al centro de la pantalla. Negativo mira al suelo. */
  dy: number;
  radius: number;
  height: number;
};

export type LampLight = {
  intensity: number;
  distance: number;
  decay: number;
};

export const FLOOR_LAMPS = [
  { id: "shelves", x: 9.02, z: -4.02, intensityScale: 0.82, phase: 2.1 },
  { id: "pinball", x: -9.02, z: 8.35, intensityScale: 0.7, phase: 0.6 },
] as const;

export const FLOOR_SHADE: ShadeSpec = { height: 0.22, topRadius: 0.07, bottomRadius: 0.2 };
export const FLOOR_GLOW: LampGlow = { dy: -0.11, radius: 0.1, height: 0.034 };
export const FLOOR_SHADE_Y = 1.2;
export const FLOOR_LIGHT: LampLight = { intensity: 1.35, distance: 11, decay: 2 };

export const HANGING_SHADE: ShadeSpec = { height: 0.2, topRadius: 0.07, bottomRadius: 0.19 };
export const HANGING_GLOW: LampGlow = { dy: -0.1, radius: 0.095, height: 0.032 };
/** Caída del centro de la pantalla desde la cara inferior del techo. */
export const HANGING_SHADE_DROP = 0.33;
export const HANGING_LIGHT: LampLight = { intensity: 1.55, distance: 10, decay: 2 };

export const SCONCE_SHADE: ShadeSpec = { height: 0.14, topRadius: 0.05, bottomRadius: 0.12 };
export const SCONCE_GLOW: LampGlow = { dy: -0.07, radius: 0.065, height: 0.028 };
export const SCONCE_SHADE_Y = 2.12;
export const SCONCE_LIGHT: LampLight = { intensity: 1.9, distance: 11, decay: 2 };

/** Alfombra del office, misma familia que la del sofá. */
export const PANTRY_RUG_COLOR = 0x3a3048;

export const PANTRY_POSTER = { x: 9.38, y: 2.2 } as const;

export function pantryPosterZ(): number {
  return LAYOUT.counter.z;
}

/** Alfombra delante del fregadero, no bajo las camas. */
export function pantryRug(): { x: number; z: number; width: number; depth: number } {
  return {
    x: LAYOUT.counter.x - 0.78,
    z: LAYOUT.counter.z,
    width: 0.85,
    depth: 1.55,
  };
}

export function colorDistance(a: number, b: number): number {
  const channels = (hex: number) => [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
  const [ar, ag, ab] = channels(a);
  const [br, bg, bb] = channels(b);
  return Math.hypot(ar - br, ag - bg, ab - bb);
}

export function insetFromNearestWall(x: number, z: number): number {
  return Math.min(x - ROOM_INNER.minX, ROOM_INNER.maxX - x, z - ROOM_INNER.minZ, ROOM_INNER.maxZ - z);
}

/** La boca ilumina; la pieza no puede leerse como bola ni como anillo de interacción. */
export function glowReadsAsLamp(shade: ShadeSpec, glow: LampGlow): boolean {
  const mouth = -shade.height / 2;
  const conical = shade.bottomRadius > shade.topRadius * 1.6;
  const band = glow.height > 0.02 && glow.height < 0.06 && glow.height < glow.radius;
  const atMouth = Math.abs(glow.dy - mouth) < 0.03;
  const inset = glow.radius < shade.bottomRadius * 0.75 && glow.radius > shade.bottomRadius * 0.3;
  return conical && band && atMouth && inset;
}

export type LampHost = {
  parent: Object3D;
  geo: <T extends BufferGeometry>(geometry: T) => T;
  mat: (color: number) => MeshLambertMaterial;
  materials: Material[];
  shadows: boolean;
};

export function addLampHead(
  host: LampHost,
  options: {
    x: number;
    z: number;
    shadeY: number;
    shade: ShadeSpec;
    glow: LampGlow;
    lit: boolean;
    light?: LampLight & { phase: number };
  },
): PointLight | null {
  const { parent, geo, mat, materials, shadows } = host;
  const { x, z, shadeY, shade, glow } = options;
  const shadeMesh = new Mesh(
    geo(new CylinderGeometry(shade.topRadius, shade.bottomRadius, shade.height, 6)),
    mat(LAMP_SHADE),
  );
  shadeMesh.position.set(x, shadeY, z);
  shadeMesh.castShadow = shadows;
  parent.add(shadeMesh);

  if (options.lit) {
    const bulbMat = new MeshBasicMaterial({ color: LAMP_BULB, toneMapped: false });
    materials.push(bulbMat);
    const band = new Mesh(geo(new CylinderGeometry(glow.radius, glow.radius, glow.height, 8)), bulbMat);
    band.position.set(x, shadeY + glow.dy, z);
    parent.add(band);
  }

  if (!options.lit || !options.light) return null;
  const light = new PointLight(LAMP_GLOW, options.light.intensity, options.light.distance, options.light.decay);
  light.position.set(x, shadeY + glow.dy - 0.04, z);
  light.userData.phase = options.light.phase;
  light.userData.base = options.light.intensity;
  parent.add(light);
  return light;
}
