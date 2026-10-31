import { aprobadoByOwner, type TimelineEvent } from "./aprobado";
import { readStatusCache, writeStatusCache, type KvLike, type StatusCachePayload } from "./cache";
import { PRODUCTION_HOST, STATUS_TITLE_MAX, type ProposalPhase } from "./constants";
import {
  extractSlug,
  hasPropuestaLabel,
  isUserProposalIssue,
  issueKind,
  stripIssueTitlePrefix,
  truncateTitle,
} from "./format";
import {
  ciSnapshotFromRun,
  fetchAllPullRequests,
  fetchCiForHeadSha,
  fetchIssueTimeline,
  fetchPagesDeployments,
  fetchProposalIssues,
  pickPreviewDeployment,
  pickProductionDeployment,
  publicPreviewUrl,
  type GitHubFetch,
  type PagesDeployment,
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

function toPullCandidates(pulls: Awaited<ReturnType<typeof fetchAllPullRequests>>): PullCandidate[] {
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
  if (cached) {
    return { ok: true, partial: cached.partial, items: cached.items as StatusItem[] };
  }

  const token = env.GITHUB_STATUS_TOKEN;
  if (!token) {
    return { ok: true, partial: true, items: [] };
  }

  let partial = false;
  let issues: Awaited<ReturnType<typeof fetchProposalIssues>> = [];
  let pulls: PullCandidate[] = [];
  let deployments: PagesDeployment[] | null = null;

  try {
    issues = await fetchProposalIssues(token, fetchImpl, { closedSince: boardClosedSinceIso(now) });
  } catch {
    partial = true;
    issues = [];
  }

  try {
    pulls = toPullCandidates(await fetchAllPullRequests(token, fetchImpl));
  } catch {
    partial = true;
    pulls = [];
  }

  const cfToken = env.CF_PAGES_READ_TOKEN;
  const accountId = env.CF_ACCOUNT_ID;
  const project = env.CF_PAGES_PROJECT ?? "proto-lab";
  if (cfToken && accountId) {
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
    let timeline: TimelineEvent[] = [];
    try {
      timeline = (await fetchIssueTimeline(token, issue.number, fetchImpl)) as TimelineEvent[];
    } catch {
      partial = true;
    }

    const approvedByOwner = aprobadoByOwner(timeline);
    const pull = pickLinkedPullRequest(issue.number, timeline, pulls);

    let ci: CiSnapshot = { state: "none" };
    if (pull) {
      try {
        const run = await fetchCiForHeadSha(token, pull.headSha, fetchImpl);
        ci = ciSnapshotFromRun(run);
      } catch {
        partial = true;
      }
    }

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

  const payload: StatusCachePayload = {
    fetchedAt: now.toISOString(),
    partial,
    items,
  };
  await writeStatusCache(env.PROPOSALS, payload);

  return { ok: true, partial, items };
}
