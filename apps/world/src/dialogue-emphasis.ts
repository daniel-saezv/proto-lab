export type EmphasisKind = "em" | "shake" | "glow" | "mark";

export type LineRun = {
  text: string;
  kind: EmphasisKind | null;
  start: number;
  end: number;
};

/**
 * Parte un guion en tramos de texto plano y énfasis.
 * Una marca sin cierre, vacía o desconocida se queda como texto literal.
 */
export function lineRuns(source: string): { plain: string; runs: LineRun[] } {
  const mark = /\{(em|shake|glow|mark)\}([\s\S]*?)\{\/\1\}/g;
  const parts: Array<{ text: string; kind: EmphasisKind | null }> = [];
  let cursor = 0;
  for (const match of source.matchAll(mark)) {
    const index = match.index ?? 0;
    if (index > cursor) parts.push({ text: source.slice(cursor, index), kind: null });
    const text = match[2] ?? "";
    if (text.length > 0) parts.push({ text, kind: match[1] as EmphasisKind });
    cursor = index + match[0].length;
  }
  if (cursor < source.length) parts.push({ text: source.slice(cursor), kind: null });

  let pos = 0;
  const runs: LineRun[] = [];
  for (const part of parts) {
    const start = pos;
    pos += part.text.length;
    runs.push({ text: part.text, kind: part.kind, start, end: pos });
  }
  return { plain: parts.map((part) => part.text).join(""), runs };
}

export function emphasisPlain(source: string): string {
  return lineRuns(source).plain;
}
