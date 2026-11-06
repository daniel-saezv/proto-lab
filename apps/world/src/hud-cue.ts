/**
 * Aviso breve del tirador del cromo.
 *
 * El panel nace plegado. Al quedar listo el prototipo, un rótulo señala el
 * tirador y dice que abre los controles. Se retira solo, o antes si la persona
 * ya abrió el panel. No vuelve en esa apertura: quien lo desplegó durante la
 * carga no necesita el aviso al empezar a jugar.
 */

export const HUD_CUE_MS = 2400;

export const HUD_CUE_LABEL = "Abrir controles";

export type HudCuePhase = "pending" | "showing" | "done";

export type HudCueEvent = "reset" | "ready" | "expand" | "tick";

export function nextHudCue(phase: HudCuePhase, event: HudCueEvent): HudCuePhase {
  if (event === "reset") return "pending";
  if (phase === "done") return "done";
  if (event === "expand") return "done";
  if (event === "ready" && phase === "pending") return "showing";
  if (event === "tick" && phase === "showing") return "done";
  return phase;
}
