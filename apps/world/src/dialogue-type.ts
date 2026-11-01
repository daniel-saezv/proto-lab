/** Ritmo del mecanografiado, en milisegundos, para el carácter en `index`. */
export function typeDelayMs(text: string, index: number): number {
  const char = text[index] ?? "";
  const next = text[index + 1];
  if (char === "." && next === ".") return 12;
  if (char === "\n") return 180;
  if (char === " " || char === "\t") return 8;
  if (char === "," || char === ";" || char === ":") return 140;
  if (char === "." || char === "!" || char === "?" || char === "…") return 220;
  if (char === "—" || char === "–") return 120;
  if (char === "«" || char === "»" || char === '"') return 60;
  return 16;
}

export function lineDurationMs(text: string): number {
  let total = 0;
  for (let index = 0; index < text.length; index += 1) total += typeDelayMs(text, index);
  return total;
}
