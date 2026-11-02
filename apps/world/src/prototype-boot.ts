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

/** Atributo `allow` del iframe. La lista ya viene cerrada por el catálogo. */
export function iframeAllow(permissions: readonly string[]): string {
  return permissions.filter((item) => item.length > 0).join("; ");
}
