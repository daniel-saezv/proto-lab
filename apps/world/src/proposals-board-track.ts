import type { ProposalPhase } from "./proposals-status-api";

export const TRACK_STEP_LABELS = [
  "Tablón",
  "Aprobada",
  "En curso",
  "CI",
  "Preview",
  "Publicada",
] as const;

export type TrackStepVisual = "empty" | "filled" | "active" | "fail" | "celebrate";

const PHASE_STEP_INDEX: Record<ProposalPhase, number> = {
  recibida: 0,
  aprobada: 1,
  en_curso: 2,
  pr_abierto: 2,
  ci_en_curso: 3,
  ci_con_fallos: 3,
  ci_correcta: 3,
  preview_lista: 4,
  publicada: 5,
  cerrada_sin_hacer: -1,
};

export function trackStepIndex(phase: ProposalPhase): number {
  return PHASE_STEP_INDEX[phase];
}

export function trackStepVisuals(phase: ProposalPhase): TrackStepVisual[] {
  const visuals: TrackStepVisual[] = Array.from({ length: TRACK_STEP_LABELS.length }, () => "empty");

  if (phase === "publicada") {
    for (let i = 0; i < visuals.length; i += 1) visuals[i] = "filled";
    visuals[5] = "celebrate";
    return visuals;
  }

  const idx = PHASE_STEP_INDEX[phase];
  if (idx < 0) return visuals;

  for (let i = 0; i < idx; i += 1) visuals[i] = "filled";

  if (phase === "ci_con_fallos") {
    visuals[3] = "fail";
    return visuals;
  }
  if (phase === "ci_correcta") {
    visuals[3] = "filled";
    return visuals;
  }

  visuals[idx] = "active";
  return visuals;
}

export function trackAriaLabel(phase: ProposalPhase): string {
  const visuals = trackStepVisuals(phase);
  const parts: string[] = [];
  for (let i = 0; i < TRACK_STEP_LABELS.length; i += 1) {
    const label = TRACK_STEP_LABELS[i];
    const visual = visuals[i];
    if (visual === "celebrate") parts.push(`${label}: publicada`);
    else if (visual === "fail") parts.push(`${label}: con fallos`);
    else if (visual === "active") parts.push(`${label}: en curso`);
    else if (visual === "filled") parts.push(`${label}: hecho`);
    else parts.push(`${label}: pendiente`);
  }
  return parts.join(". ");
}
