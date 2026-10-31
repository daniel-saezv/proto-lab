import { aprobadoByOwner, type TimelineEvent } from "./aprobado";
import { cacheFreshness, readStatusCache, writeStatusCache, type KvLike, type StatusCachePayload } from "./cache";
import { PRODUCTION_HOST, STATUS_TITLE_MAX, type ProposalPhase } from "./constants";
import {
  extractSlug,
  hasPropuestaLabel,
  isUserProposalIssue,
  issueKind,
  stripIssueTitlePrefix,
  truncateTitle,
} from "./format";
import { fetchProposalBoard } from "./graphql";
import {
  ciSnapshotFromRun,
  fetchPagesDeployments,
  pickPreviewDeployment,
  pickProductionDeployment,
  publicPreviewUrl,
  type GitHubFetch,
  type GitHubIssue,
  type GitHubPull,
  type PagesDeployment,
  type WorkflowRun,
} from "./github";
import { boardClosedSinceIso, isIssueVisibleOnBoard } from "./board-visibility";
import { pickLinkedPullRequest, type PullCandidate, type PullRequestRef } from "./issue-pr";
import { previewUrlForPhase, resolvePhase, type CiSnapshot, type DeploySnapshot } from "./phases";

export type StatusItem = {
  number: number;
  title: string;
  kind: "propuesta" | "iteracion";
  slug: string | null;
  phase: ProposalPhase;
  updatedAt: string;
  previewUrl?: string;
};

export type StatusResponse = {
  ok: true;
  partial: boolean;
  items: StatusItem[];
};

export type StatusEnv = {
  GITHUB_STATUS_TOKEN?: string;
  CF_PAGES_READ_TOKEN?: string;
  CF_ACCOUNT_ID?: string;
  CF_PAGES_PROJECT?: string;
  PROPOSALS?: KvLike;
};

export type StatusOptions = {
  fetchImpl?: GitHubFetch;
  now?: Date;
};

function toPullCandidates(pulls: readonly GitHubPull[]): PullCandidate[] {
  return pulls.map((pr) => ({
    number: pr.number,
    updated_at: pr.updated_at,
    headSha: pr.head.sha,
    mergeCommitSha: pr.merge_commit_sha,
    branch: pr.head.ref,
    merged: Boolean(pr.merged_at),
    state: pr.state,
    body: pr.body ?? "",
  }));
}

function buildDeploySnapshot(
  pr: PullRequestRef | null,
  deployments: PagesDeployment[] | null,
  mergeSha: string | null,
): DeploySnapshot {
  if (!deployments) {
    return { previewReady: false, previewUrl: null, productionReady: false };
  }
  let previewReady = false;
  let previewUrl: string | null = null;
  if (pr && pr.state === "open") {
    const dep = pickPreviewDeployment(deployments, pr.branch, pr.headSha);
    previewUrl = publicPreviewUrl(dep);
    previewReady = Boolean(previewUrl);
  }
  let productionReady = false;
  if (pr?.merged && mergeSha) {
    productionReady = Boolean(pickProductionDeployment(deployments, mergeSha));
  }
  return { previewReady, previewUrl, productionReady };
}

export async function buildProposalStatus(env: StatusEnv, options: StatusOptions = {}): Promise<StatusResponse> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? new Date();
  const nowMs = now.getTime();
  const cached = await readStatusCache(env.PROPOSALS);
  const freshness = cached ? cacheFreshness(cached, nowMs) : "invalid";
  if (cached && freshness === "fresh") {
    return { ok: true, partial: cached.partial, items: cached.items as StatusItem[] };
  }
  const stale = cached && freshness === "stale" ? cached : null;

  const token = env.GITHUB_STATUS_TOKEN;
  if (!token) {
    return { ok: true, partial: true, items: [] };
  }

  let partial = false;
  let githubFailed = false;
  let issues: GitHubIssue[] = [];
  let pulls: PullCandidate[] = [];
  let timelines = new Map<number, TimelineEvent[]>();
  let ciBySha = new Map<string, WorkflowRun>();
  let deployments: PagesDeployment[] | null = null;

  try {
    const board = await fetchProposalBoard(token, fetchImpl, { closedSince: boardClosedSinceIso(now) });
    issues = board.issues;
    pulls = toPullCandidates(board.pulls);
    timelines = board.timelines as Map<number, TimelineEvent[]>;
    ciBySha = board.ciBySha;
    if (board.partial) partial = true;
  } catch {
    githubFailed = true;
    partial = true;
  }

  const cfToken = env.CF_PAGES_READ_TOKEN;
  const accountId = env.CF_ACCOUNT_ID;
  const project = env.CF_PAGES_PROJECT ?? "proto-lab";
  if (!githubFailed && cfToken && accountId) {
    try {
      deployments = await fetchPagesDeployments(accountId, project, cfToken, fetchImpl);
    } catch {
      partial = true;
      deployments = null;
    }
  }

  const filtered = issues.filter(
    (issue) =>
      hasPropuestaLabel(issue.labels.map((l) => l.name)) &&
      isUserProposalIssue(issue.body) &&
      isIssueVisibleOnBoard(issue, nowMs),
  );

  const items: StatusItem[] = [];

  for (const issue of filtered) {
    const labelNames = issue.labels.map((l) => l.name);
    const timeline = timelines.get(issue.number) ?? [];
    const approvedByOwner = aprobadoByOwner(timeline);
    const pull = pickLinkedPullRequest(issue.number, timeline, pulls);
    const ci: CiSnapshot = pull ? ciSnapshotFromRun(ciBySha.get(pull.headSha) ?? null) : { state: "none" };

    const mergeSha = pull?.merged ? (pull.mergeCommitSha ?? pull.headSha) : null;
    const deploy = buildDeploySnapshot(pull, deployments, mergeSha);

    const phase = resolvePhase({
      issueOpen: issue.state === "open",
      issueStateReason: issue.state_reason ?? null,
      labels: labelNames,
      approvedByOwner,
      pull,
      ci,
      deploy,
    });

    const item: StatusItem = {
      number: issue.number,
      title: truncateTitle(stripIssueTitlePrefix(issue.title), STATUS_TITLE_MAX),
      kind: issueKind(labelNames),
      slug: extractSlug(issue.title, issue.body ?? "", labelNames),
      phase,
      updatedAt: issue.updated_at,
    };

    const preview = previewUrlForPhase(phase, deploy);
    if (preview) item.previewUrl = preview;
    else if (phase === "publicada") item.previewUrl = `https://${PRODUCTION_HOST}`;

    items.push(item);
  }

  items.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : b.number - a.number));

  if (githubFailed) {
    if (stale) return { ok: true, partial: true, items: stale.items as StatusItem[] };
    return { ok: true, partial: true, items: [] };
  }

  if (!partial) {
    const payload: StatusCachePayload = {
      fetchedAt: now.toISOString(),
      partial,
      items,
    };
    await writeStatusCache(env.PROPOSALS, payload);
  }

  return { ok: true, partial, items };
}
