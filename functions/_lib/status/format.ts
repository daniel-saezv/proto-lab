import { LABEL_ITERACION, LABEL_PROPUESTA } from "../validate";
import { USER_REQUEST_MARKER } from "./constants";

export function isUserProposalIssue(body: string | null | undefined): boolean {
  return typeof body === "string" && body.includes(USER_REQUEST_MARKER);
}

export function issueKind(labels: readonly string[]): "propuesta" | "iteracion" {
  return labels.includes(LABEL_ITERACION) ? "iteracion" : "propuesta";
}

export function extractSlug(title: string, body: string, labels: readonly string[]): string | null {
  const iterTitle = /^\[iteración\]\s+([a-z0-9]+(?:-[a-z0-9]+)*)\s*:/i.exec(title);
  if (iterTitle?.[1]) return iterTitle[1].toLowerCase();
  const bodySlug = /Prototipo:\s*`([a-z0-9]+(?:-[a-z0-9]+)*)`/i.exec(body);
  if (bodySlug?.[1] && bodySlug[1] !== "nuevo") return bodySlug[1].toLowerCase();
  for (const label of labels) {
    if (label !== LABEL_PROPUESTA && label !== LABEL_ITERACION && label !== "aprobado" && label !== "en-curso") {
      if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(label)) return label;
    }
  }
  return null;
}

export function escapeDisplayText(input: string): string {
  return input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
}

export function truncateTitle(title: string, max: number): string {
  const cleaned = escapeDisplayText(title);
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function stripIssueTitlePrefix(title: string): string {
  return title.replace(/^\[(propuesta|iteración)\]\s*(?:[a-z0-9-]+:\s*)?/i, "").trim();
}

export function issueMentionsPattern(issueNumber: number): RegExp {
  return new RegExp(`#${issueNumber}(?!\\d)`, "i");
}

export function hasPropuestaLabel(labels: readonly string[]): boolean {
  return labels.includes(LABEL_PROPUESTA);
}
