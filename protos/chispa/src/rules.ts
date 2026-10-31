export const MAX_TIER = 6;

export const RADII = [20, 28, 38, 50, 64, 80, 98] as const;

export const COLORS = ["#ff5d73", "#ff8a3d", "#ffd23f", "#7dff6b", "#3ec6ff", "#7a7bff", "#e86bff"] as const;

export function mergeOutcome(tier: number): { mega: boolean; tier: number } {
  if (tier >= MAX_TIER) return { mega: true, tier: MAX_TIER };
  return { mega: false, tier: tier + 1 };
}

export function mergePoints(resultTier: number, combo: number, mega: boolean): number {
  const safeCombo = Math.max(1, combo);
  const base = mega ? 800 : (resultTier + 1) * 15;
  return base * safeCombo;
}

export function isRareWild(dropIndex: number): boolean {
  return dropIndex > 0 && dropIndex % 9 === 0;
}

export type DropKind = "normal" | "wild" | "bomb" | "gold" | "ice";

export function dropKind(dropIndex: number): DropKind {
  if (dropIndex > 0 && dropIndex % 11 === 0) return "bomb";
  if (dropIndex > 0 && dropIndex % 13 === 0) return "gold";
  if (dropIndex > 0 && dropIndex % 15 === 0) return "ice";
  if (isRareWild(dropIndex)) return "wild";
  return "normal";
}

export function dropCooldown(fever: boolean): number {
  return fever ? 150 : 230;
}

export function goldMergeMultiplier(): number {
  return 3;
}
