import type { GitHubIssue } from "./github";

/** Tiempo que una propuesta publicada (issue completada) sigue en el tablón. */
export const BOARD_VISIBLE_MS = 24 * 60 * 60 * 1000;

export type BoardIssueSlice = Pick<GitHubIssue, "state" | "state_reason" | "closed_at">;

export function isIssueVisibleOnBoard(issue: BoardIssueSlice, nowMs: number): boolean {
  if (issue.state === "open") return true;
  if (issue.state_reason !== "completed") return false;
  if (!issue.closed_at) return false;
  const closedMs = Date.parse(issue.closed_at);
  if (Number.isNaN(closedMs)) return false;
  return nowMs - closedMs <= BOARD_VISIBLE_MS;
}

export function boardClosedSinceIso(now: Date): string {
  return new Date(now.getTime() - BOARD_VISIBLE_MS).toISOString();
}
