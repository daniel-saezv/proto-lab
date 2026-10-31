export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0;
  const mod = index % length;
  return mod < 0 ? mod + length : mod;
}

export function stepIndex(index: number, delta: number, length: number): number {
  return wrapIndex(index + delta, length);
}

export type SelectorKeyAction = "prev" | "next" | "play" | "close" | "none";

export function selectorKeyAction(key: string, enterMeansPlay: boolean): SelectorKeyAction {
  if (key === "ArrowLeft") return "prev";
  if (key === "ArrowRight") return "next";
  if (key === "Escape") return "close";
  if (enterMeansPlay && (key === "Enter" || key === " ")) return "play";
  return "none";
}
