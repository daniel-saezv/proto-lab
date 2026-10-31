import { LABEL_APROBADO, OWNER_LOGIN } from "./constants";

export type TimelineEvent = {
  event?: string;
  actor?: { login?: string | null } | null;
  label?: { name?: string | null } | null;
  created_at?: string | null;
};

export function aprobadoByOwner(events: readonly TimelineEvent[]): boolean {
  for (const item of events) {
    if (item.event !== "labeled") continue;
    const name = item.label?.name?.toLowerCase();
    if (name !== LABEL_APROBADO) continue;
    if (item.actor?.login === OWNER_LOGIN) return true;
  }
  return false;
}

export function labeledByOwner(events: readonly TimelineEvent[], labelName: string): boolean {
  const wanted = labelName.toLowerCase();
  for (const item of events) {
    if (item.event !== "labeled") continue;
    if (item.label?.name?.toLowerCase() !== wanted) continue;
    if (item.actor?.login === OWNER_LOGIN) return true;
  }
  return false;
}
