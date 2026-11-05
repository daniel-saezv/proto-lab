/**
 * Política de pantalla completa del overlay.
 *
 * La petición nativa va sobre el propio overlay, en el gesto del clic, con la
 * API sin prefijo. El prefijo webkit solo entra si el método estándar no
 * existe (Safari de escritorio anterior a 16.4). En iOS ese prefijo no pone
 * en pantalla completa un div —solo un vídeo— y no se usa como éxito.
 *
 * Una PWA con `display: standalone` (el manifest) o `navigator.standalone`
 * (pantalla de inicio, cuando el media query aún no existe) ya ocupa la
 * ventana. Ahí `requestFullscreen()` no esconde cromo de navegador: en varios
 * motores la promesa ni se resuelve ni se rechaza, y el modo CSS solo repite
 * un overlay que ya es el viewport. El botón se oculta.
 *
 * `(display-mode: fullscreen)` también lo activa la Fullscreen API. Si ya hay
 * un elemento en pantalla completa, no cuenta como «la app ya estaba así»:
 * si no, el botón de salir desaparecería al entrar.
 */

export const NATIVE_FULLSCREEN_TIMEOUT_MS = 700;

export type FullscreenPlan = "native" | "css" | "hidden";

export type FullscreenFacts = {
  standardRequest: boolean;
  webkitRequest: boolean;
  /** `document.fullscreenEnabled`. Undefined si el motor no lo expone. */
  enabled: boolean | undefined;
  /** Solo se consulta si no hay método estándar. */
  webkitEnabled: boolean | undefined;
  occupiesScreen: boolean;
};

export function occupiesScreen(input: {
  displayModeStandalone: boolean;
  displayModeFullscreen: boolean;
  fullscreenElement: boolean;
  /** Flag de iOS para la pantalla de inicio. No es una rama por agente de usuario. */
  navigatorStandalone?: boolean;
}): boolean {
  if (input.displayModeStandalone || input.navigatorStandalone === true) return true;
  return input.displayModeFullscreen && !input.fullscreenElement;
}

export function planFullscreen(facts: FullscreenFacts): FullscreenPlan {
  if (facts.occupiesScreen) return "hidden";
  if (facts.standardRequest && facts.enabled !== false) return "native";
  if (!facts.standardRequest && facts.webkitRequest && facts.webkitEnabled !== false) return "native";
  return "css";
}
