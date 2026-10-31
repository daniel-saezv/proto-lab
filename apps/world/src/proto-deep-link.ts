const HASH_PREFIX = "p=";

export function readPrototypeSlugFromHash(hash: string = location.hash): string | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw.startsWith(HASH_PREFIX)) return null;
  const slug = decodeURIComponent(raw.slice(HASH_PREFIX.length).trim());
  return slug.length > 0 ? slug : null;
}

export function writePrototypeHash(slug: string | null) {
  const next = slug ? `#${HASH_PREFIX}${encodeURIComponent(slug)}` : "";
  const current = location.hash;
  if (current === next) return;
  const url = `${location.pathname}${location.search}${next}`;
  history.replaceState(history.state, "", url);
}
