const STORAGE_KEY = "proto-lab:seen-versions";

type SeenMap = Record<string, string>;

function readMap(): SeenMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: SeenMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof key === "string" && typeof value === "string" && key.length > 0) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeMap(map: SeenMap) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* iframe / quota */
  }
}

export function getSeenVersion(slug: string): string | undefined {
  return readMap()[slug];
}

export function markPrototypeSeen(slug: string, version: string) {
  const map = readMap();
  if (map[slug] === version) return;
  map[slug] = version;
  writeMap(map);
}

export function isPrototypeUnseen(slug: string, version: string): boolean {
  const seen = getSeenVersion(slug);
  if (seen == null) return true;
  return seen !== version;
}

export function unseenSlugs(entries: { slug: string; version: string }[]): string[] {
  const out: string[] = [];
  for (const entry of entries) {
    if (isPrototypeUnseen(entry.slug, entry.version)) out.push(entry.slug);
  }
  return out;
}
