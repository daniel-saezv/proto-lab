import { LABEL_ITERACION, LABEL_PROPUESTA } from "../validate";
import { USER_REQUEST_MARKER } from "./constants";

export function isUserProposalIssue(body: string | null | undefined): boolean {
  return typeof body === "string" && body.includes(USER_REQUEST_MARKER);
}

export function issueKind(labels: readonly string[]): "propuesta" | "iteracion" {
  return labels.includes(LABEL_ITERACION) ? "iteracion" : "propuesta";
}

const PROTO_DIR = /^protos\/([a-z0-9]+(?:-[a-z0-9]+)*)\//;

/** Carpetas `protos/<slug>/` tocadas por la PR. Una sola es la aplicación de esa preview. */
export function slugsFromProtoPaths(paths: readonly string[]): string[] {
  const slugs = new Set<string>();
  for (const path of paths) {
    const match = PROTO_DIR.exec(path);
    if (match?.[1]) slugs.add(match[1]);
  }
  return [...slugs].sort();
}

/** Slug de la aplicación: la única carpeta `protos/<slug>/` del diff. Si no hay una sola, null. */
export function resolveAppSlug(paths: readonly string[]): string | null {
  const fromPaths = slugsFromProtoPaths(paths);
  return fromPaths.length === 1 ? (fromPaths[0] ?? null) : null;
}

/** Raíz de la preview, o esa raíz más `/protos/<slug>/` cuando la aplicación está identificada. */
export function previewAppUrl(root: string, slug: string | null): string {
  if (!slug || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return root;
  try {
    const url = new URL(root);
    url.pathname = `/protos/${slug}/`;
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return root;
  }
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
