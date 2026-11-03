/** Catálogo estático de la radio. Una pista, la que esté sonando, y nada más en la red. */
export const MUSIC_TRACK_KEY = "proto-lab:music-track";
export const MUSIC_TRACK_MAX_BYTES = 4 * 1024 * 1024;

export type MusicTrack = {
  id: string;
  title: string;
  artist: string;
  /** Ruta absoluta del sitio. Literal, para que el build le ponga hash. */
  src: string;
  file: string;
};

export const MUSIC_CATALOG: readonly MusicTrack[] = [
  {
    id: "luanda",
    title: "Luanda",
    artist: "Infraction & MORAI",
    src: "/protos/audio/luanda.m4a",
    file: "luanda.m4a",
  },
  {
    id: "firefly-in-a-fairytale",
    title: "Firefly in a Fairytale",
    artist: "Gareth Coker",
    src: "/protos/audio/firefly-in-a-fairytale.m4a",
    file: "firefly-in-a-fairytale.m4a",
  },
];

export function trackById(id: string | null | undefined): MusicTrack {
  return MUSIC_CATALOG.find((track) => track.id === id) ?? MUSIC_CATALOG[0]!;
}

export function nextInCatalog(catalog: readonly MusicTrack[], currentId: string): MusicTrack {
  const index = catalog.findIndex((track) => track.id === currentId);
  const next = index < 0 ? 0 : (index + 1) % catalog.length;
  return catalog[next]!;
}

export function nextTrack(currentId: string): MusicTrack {
  return nextInCatalog(MUSIC_CATALOG, currentId);
}

export function musicNowLabel(title: string): string {
  return `Música: ${title}`;
}

export function readTrackId(storage: { getItem(key: string): string | null }): string {
  return trackById(storage.getItem(MUSIC_TRACK_KEY)).id;
}

export function writeTrackId(storage: { setItem(key: string, value: string): void }, id: string): void {
  storage.setItem(MUSIC_TRACK_KEY, trackById(id).id);
}

/** Sección `## archivo.m4a` de CREDITS.md, hasta el siguiente título. */
export function creditSection(markdown: string, file: string): string | null {
  const marker = `## ${file}`;
  const start = markdown.indexOf(marker);
  if (start < 0) return null;
  const rest = markdown.slice(start + marker.length);
  const next = rest.search(/\n## /);
  return next < 0 ? rest : rest.slice(0, next);
}

export function sectionHasLicense(section: string): boolean {
  if (!/licencia/i.test(section)) return false;
  return section.replace(/licencia/gi, "").trim().length >= 40;
}
