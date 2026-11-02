import { issueMentionsPattern, slugsFromProtoPaths } from "./format";

export type PullRequestRef = {
  number: number;
  updated_at: string;
  headSha: string;
  mergeCommitSha: string | null;
  branch: string;
  merged: boolean;
  state: "open" | "closed";
  paths?: readonly string[];
};

export type TimelineCrossRef = {
  event?: string;
  source?: { issue?: { pull_request?: { html_url?: string | null } | null } | null } | null;
  created_at?: string | null;
};

export type PullCandidate = {
  number: number;
  updated_at: string;
  headSha: string;
  mergeCommitSha: string | null;
  branch: string;
  merged: boolean;
  state: "open" | "closed";
  body: string;
  paths?: readonly string[];
};

/** GitHub cierra la issue con close/fix/resolve. `Refs #N` solo la menciona. */
export function closesIssue(body: string, issueNumber: number): boolean {
  return new RegExp(
    `(?:^|[\\s(])(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\s*:?\\s*#${issueNumber}(?!\\d)`,
    "i",
  ).test(body);
}

function isSubstantive(pr: PullCandidate, issueNumber: number): boolean {
  return closesIssue(pr.body, issueNumber) || slugsFromProtoPaths(pr.paths ?? []).length > 0;
}

function newest(candidates: readonly PullCandidate[]): PullCandidate | null {
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) =>
    a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : b.number - a.number,
  );
  return sorted[0] ?? null;
}

/**
 * Si hay una PR que cierra la issue o toca `protos/<slug>/`, manda esa
 * (la más reciente entre ellas). Una PR posterior que solo dice `Refs #N`
 * no sustituye a la de la aplicación.
 */
export function pickBestLinkedPull(issueNumber: number, candidates: readonly PullCandidate[]): PullCandidate | null {
  const substantive = candidates.filter((pr) => isSubstantive(pr, issueNumber));
  return newest(substantive.length > 0 ? substantive : candidates);
}

function prNumberFromUrl(url: string | null | undefined): number | null {
  if (!url) return null;
  const match = /\/pull\/(\d+)(?:$|[?#])/.exec(url);
  if (!match) return null;
  const num = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(num) ? num : null;
}

function candidatesFromTimeline(events: readonly TimelineCrossRef[], known: Map<number, PullCandidate>): PullCandidate[] {
  const seen = new Set<number>();
  const list: PullCandidate[] = [];
  for (const item of events) {
    if (item.event !== "cross-referenced") continue;
    const url = item.source?.issue?.pull_request?.html_url;
    const number = prNumberFromUrl(url ?? undefined);
    if (number == null || seen.has(number)) continue;
    const pr = known.get(number);
    if (!pr) continue;
    seen.add(number);
    list.push(pr);
  }
  return list;
}

export function prFromTimeline(
  events: readonly TimelineCrossRef[],
  known: Map<number, PullCandidate>,
  issueNumber: number,
): PullRequestRef | null {
  const best = pickBestLinkedPull(issueNumber, candidatesFromTimeline(events, known));
  return best ? toRef(best) : null;
}

export function prFromBodyMention(issueNumber: number, pulls: readonly PullCandidate[]): PullRequestRef | null {
  const pattern = issueMentionsPattern(issueNumber);
  const best = pickBestLinkedPull(
    issueNumber,
    pulls.filter((pr) => pattern.test(pr.body)),
  );
  return best ? toRef(best) : null;
}

export function pickLinkedPullRequest(
  issueNumber: number,
  timeline: readonly TimelineCrossRef[],
  pulls: readonly PullCandidate[],
): PullRequestRef | null {
  const map = new Map(pulls.map((pr) => [pr.number, pr]));
  return prFromTimeline(timeline, map, issueNumber) ?? prFromBodyMention(issueNumber, pulls);
}

function toRef(pr: PullCandidate): PullRequestRef {
  return {
    number: pr.number,
    updated_at: pr.updated_at,
    headSha: pr.headSha,
    mergeCommitSha: pr.mergeCommitSha,
    branch: pr.branch,
    merged: pr.merged,
    state: pr.state,
    paths: pr.paths,
  };
}
