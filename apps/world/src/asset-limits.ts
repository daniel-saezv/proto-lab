/** Debe coincidir con scripts/asset-path.mjs (ASSET_LIMITS). */
export const ASSET_LIMITS = {
  maxCount: 32,
  maxBytesPerFile: 2 * 1024 * 1024,
  maxBytesTotal: 8 * 1024 * 1024,
  maxRequestsPerSession: 64,
} as const;

export function normalizeAssetPath(raw: string): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 512) return null;
  if (raw.includes("\\") || raw.startsWith("/") || /^[a-zA-Z]:/.test(raw)) return null;
  if (raw.includes(":") || raw.startsWith("//")) return null;
  const segments = raw.split("/");
  for (const segment of segments) {
    if (segment === "" || segment === "." || segment === "..") return null;
  }
  return segments.join("/");
}

export function prototypeBasePath(slug: string): string {
  return `/protos/${slug}/`;
}

export function assetUrlPath(slug: string, normalizedPath: string): string {
  return `${prototypeBasePath(slug)}${normalizedPath.split("/").map(encodeURIComponent).join("/")}`;
}
