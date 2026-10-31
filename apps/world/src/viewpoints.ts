/**
 * Puntos de cámara fijos para `pnpm shots`.
 * El jugador no se resuelve contra colisiones: el encuadre es el mismo en escritorio y en el iPhone.
 * `yaw` mira hacia el sujeto (forwardX = sin(yaw), forwardZ = -cos(yaw)).
 */
export type Viewpoint = {
  id: string;
  label: string;
  kind: "follow" | "top";
  x: number;
  z: number;
  yaw: number;
  pitch: number;
};

export const VIEWPOINTS: readonly Viewpoint[] = [
  { id: "spawn", label: "Aparición", kind: "follow", x: 0, z: 1.7, yaw: 0.15, pitch: 0.15 },
  { id: "inventor", label: "Inventor", kind: "follow", x: -1.5, z: -1.7, yaw: 0, pitch: 0.15 },
  { id: "arcade", label: "Arcade", kind: "follow", x: 0.6, z: 1.35, yaw: 0, pitch: 0.15 },
  { id: "corner-lounge", label: "Rincón sofá", kind: "follow", x: -5, z: -2.8, yaw: -0.86, pitch: 0.22 },
  { id: "corner-workshop", label: "Rincón taller", kind: "follow", x: 4.2, z: -3.2, yaw: 0.83, pitch: 0.22 },
  { id: "corner-pinball", label: "Rincón pinball", kind: "follow", x: -2.6, z: 3.5, yaw: -2.31, pitch: 0.22 },
  { id: "corner-fridge", label: "Rincón nevera", kind: "follow", x: 4.6, z: 3.4, yaw: 2.22, pitch: 0.22 },
  { id: "overview", label: "Cenital", kind: "top", x: 0, z: 2.2, yaw: 0, pitch: 0 },
];

export type DebugMarker = {
  id: string;
  label: string;
  x: number;
  z: number;
  color: number;
};

/** Anillos del modo depuración cenital. Deben coincidir con los puntos interactivos del lobby. */
export const DEBUG_MARKERS: readonly DebugMarker[] = [
  { id: "inventor", label: "Inventor", x: -1.5, z: -3.4, color: 0xffb703 },
  { id: "arcade", label: "Arcade", x: 0.6, z: -0.35, color: 0xff6b9d },
  { id: "chalkboard", label: "Pizarra", x: -4.6, z: -6.1, color: 0x8fd8ff },
];

export function viewpointById(id: string): Viewpoint | undefined {
  return VIEWPOINTS.find((item) => item.id === id);
}
