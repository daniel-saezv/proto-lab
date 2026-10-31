export type InstallPlatform = "ios" | "android";

export function detectInstallPlatform(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
): InstallPlatform {
  const ios =
    /iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1);
  return ios ? "ios" : "android";
}

export function isStandalonePwa(
  displayModeStandalone: boolean,
  navigatorStandalone?: boolean,
): boolean {
  return displayModeStandalone || navigatorStandalone === true;
}

export function installHelpKeyAction(key: string, open: boolean): "close" | "none" {
  if (!open) return "none";
  if (key === "Escape") return "close";
  return "none";
}

export const IOS_STEPS = [
  "Abre Proto Lab en Safari (con la sesión del grupo).",
  "Pulsa Compartir (cuadrado con flecha hacia arriba).",
  "Elige «Añadir a pantalla de inicio».",
  "Pulsa «Añadir».",
] as const;

export const ANDROID_MANUAL_STEPS = [
  "Abre Proto Lab en Chrome (con la sesión del grupo).",
  "Si no ves un aviso de instalación, abre el menú ⋮.",
  "Toca «Instalar aplicación» o «Añadir a pantalla de inicio».",
  "Confirma.",
] as const;
