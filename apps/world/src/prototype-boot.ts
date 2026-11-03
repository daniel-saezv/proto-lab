export type BootPhase = "opening" | "alive" | "ready";

/** `alive` solo anota que el script arrancó. La pantalla de carga espera `ready`. */
export function advanceBoot(phase: BootPhase, type: string): BootPhase {
  if (phase === "ready") return phase;
  if (type === "ready") return "ready";
  if (type === "alive" && phase === "opening") return "alive";
  return phase;
}

export function bootFailureMessage(phase: BootPhase): string {
  if (phase === "alive") {
    return "La aplicación no ha terminado de arrancar. Pulsa Volver para volver al laboratorio.";
  }
  return "No he podido abrir la aplicación. Pulsa Volver para volver al laboratorio.";
}

/** Permisos de dispositivo. Tiene que coincidir con `APP_PERMISSIONS`. */
export const DEVICE_PERMISSIONS = [
  "camera",
  "microphone",
  "geolocation",
  "accelerometer",
  "gyroscope",
  "magnetometer",
] as const;

/**
 * Atributo `allow` del iframe. Solo salen permisos de dispositivo, en el
 * orden canónico. `save`, `wasm`, `shared` y cualquier otro valor se descartan.
 */
export function iframeAllow(declared: readonly string[]): string {
  const wanted = new Set(declared);
  return DEVICE_PERMISSIONS.filter((item) => wanted.has(item)).join("; ");
}
