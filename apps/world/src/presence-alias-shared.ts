/** Recorte y validación alineados con el servidor (`parseNameField`). */

export const PRESENCE_NAME_MAX_CHARS = 24;

/**
 * Devuelve el nombre a enviar (vacío si no hay alias válido).
 * No acepta @ ni caracteres de control.
 */
export function sanitizePresenceNameInput(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (trimmed.includes("@")) return "";
  let out = "";
  for (const ch of trimmed) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127) continue;
    out += ch;
    if (out.length >= PRESENCE_NAME_MAX_CHARS) break;
  }
  return out.trim();
}
