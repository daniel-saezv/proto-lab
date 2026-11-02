import { issueMentionsPattern } from "./format";

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

function prNumberFromUrl(url: string | null | undefined): number | null {
  if (!url) return null;
  const match = /\/pull\/(\d+)(?:$|[?#])/.exec(url);
  if (!match) return null;
  const num = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(num) ? num : null;
}

export function prFromTimeline(events: readonly TimelineCrossRef[], known: Map<number, PullCandidate>): PullRequestRef | null {
  const refs: { number: number; at: string }[] = [];
  for (const item of events) {
    if (item.event !== "cross-referenced") continue;
    const url = item.source?.issue?.pull_request?.html_url;
    const number = prNumberFromUrl(url ?? undefined);
    if (number == null) continue;
    refs.push({ number, at: item.created_at ?? "" });
  }
  refs.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  for (const ref of refs) {
    const pr = known.get(ref.number);
    if (pr) return toRef(pr);
  }
  return null;
}

export function prFromBodyMention(issueNumber: number, pulls: readonly PullCandidate[]): PullRequestRef | null {
  const pattern = issueMentionsPattern(issueNumber);
  const matches = pulls.filter((pr) => pattern.test(pr.body));
  matches.sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));
  const first = matches[0];
  return first ? toRef(first) : null;
}

export function pickLinkedPullRequest(
  issueNumber: number,
  timeline: readonly TimelineCrossRef[],
  pulls: readonly PullCandidate[],
): PullRequestRef | null {
  const map = new Map(pulls.map((pr) => [pr.number, pr]));
  return prFromTimeline(timeline, map) ?? prFromBodyMention(issueNumber, pulls);
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
