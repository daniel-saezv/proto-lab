/** Alias elegido por la persona para la sala. No viene de Access ni de propuestas. */

export const PRESENCE_ALIAS_STORAGE_KEY = "proto-lab:alias";

/** Límite de caracteres del input; el servidor recorta igual. */
export const PRESENCE_ALIAS_INPUT_MAX = 32;

export function loadPresenceAlias(): string {
  try {
    return localStorage.getItem(PRESENCE_ALIAS_STORAGE_KEY)?.trim() ?? "";
  } catch {
    return "";
  }
}

export function savePresenceAlias(raw: string): void {
  const next = raw.trim();
  try {
    if (next === "") localStorage.removeItem(PRESENCE_ALIAS_STORAGE_KEY);
    else localStorage.setItem(PRESENCE_ALIAS_STORAGE_KEY, next);
  } catch {
    // Sin almacenamiento, la sesión sigue sin nombre persistente.
  }
}

/** Refleja el valor guardado y avisa al enlace de presencia cuando cambia el alias (debounced). */
export function bindPresenceAlias(input: HTMLInputElement, onCommit: () => void): void {
  input.value = loadPresenceAlias();
  let timer = 0;
  function commitIfStoredChanged(beforeStored: string) {
    const afterStored = loadPresenceAlias();
    if (afterStored.trim() !== "") input.value = afterStored;
    else input.value = "";
    if (beforeStored !== afterStored) onCommit();
  }
  function schedule() {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => {
      const before = loadPresenceAlias();
      savePresenceAlias(input.value);
      commitIfStoredChanged(before);
    }, 400);
  }
  input.addEventListener("input", schedule);
  input.addEventListener("blur", () => {
    window.clearTimeout(timer);
    const before = loadPresenceAlias();
    savePresenceAlias(input.value);
    commitIfStoredChanged(before);
  });
}
