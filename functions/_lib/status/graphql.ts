import { CI_WORKFLOW_FILE, REPO_NAME, REPO_OWNER } from "./constants";
import type { GitHubFetch, GitHubIssue, GitHubPull, WorkflowRun } from "./github";
import { readTextLimited } from "../read-limited";

const GRAPHQL_URL = "https://api.github.com/graphql";
const GRAPHQL_MAX_BYTES = 3_000_000;

/**
 * Antes: 2 listados de issues + 2 de pulls + 1 id de workflow + 1 timeline
 * y 1 run de CI por propuesta visible (~5 + 2N). Con ~22 propuestas eso
 * roza las 50 subpeticiones del plan gratuito.
 * Ahora: una sola petición GraphQL. El despliegue de Pages sigue aparte.
 */
const BOARD_QUERY = `
query ProposalBoard($since: DateTime!) {
  repository(owner: ${JSON.stringify(REPO_OWNER)}, name: ${JSON.stringify(REPO_NAME)}) {
    openIssues: issues(first: 80, states: [OPEN], labels: ["propuesta"], orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage }
      nodes { ...IssueBits }
    }
    closedIssues: issues(
      first: 40
      states: [CLOSED]
      labels: ["propuesta"]
      filterBy: { since: $since }
      orderBy: { field: UPDATED_AT, direction: DESC }
    ) {
      pageInfo { hasNextPage }
      nodes { ...IssueBits }
    }
    pullRequests(first: 50, states: [OPEN, CLOSED, MERGED], orderBy: { field: UPDATED_AT, direction: DESC }) {
      pageInfo { hasNextPage }
      nodes { ...PrBits }
    }
  }
}

fragment IssueBits on Issue {
  number
  title
  body
  state
  stateReason
  closedAt
  updatedAt
  labels(first: 20) { nodes { name } }
  timelineItems(first: 40, itemTypes: [LABELED_EVENT, CROSS_REFERENCED_EVENT]) {
    nodes {
      __typename
      ... on LabeledEvent {
        createdAt
        actor { login }
        label { name }
      }
      ... on CrossReferencedEvent {
        createdAt
        source {
          __typename
          ... on PullRequest { ...PrBits }
        }
      }
    }
  }
}

fragment PrBits on PullRequest {
  number
  body
  state
  url
  updatedAt
  mergedAt
  headRefName
  headRefOid
  mergeCommit { oid }
  commits(last: 1) {
    nodes {
      commit {
        oid
        checkSuites(first: 8) {
          nodes {
            status
            conclusion
            workflowRun { workflow { name resourcePath } }
          }
        }
      }
    }
  }
}
`;

export type ProposalBoard = {
  issues: GitHubIssue[];
  pulls: GitHubPull[];
  timelines: Map<number, unknown[]>;
  ciBySha: Map<string, WorkflowRun>;
  /** Página siguiente o errores parciales de GraphQL: la respuesta va con partial. */
  partial: boolean;
};

type GqlCheckSuite = {
  status?: string | null;
  conclusion?: string | null;
  workflowRun?: { workflow?: { name?: string | null; resourcePath?: string | null } | null } | null;
};

type GqlPull = {
  number?: number;
  body?: string | null;
  state?: string | null;
  url?: string | null;
  updatedAt?: string | null;
  mergedAt?: string | null;
  headRefName?: string | null;
  headRefOid?: string | null;
  mergeCommit?: { oid?: string | null } | null;
  commits?: {
    nodes?: ({ commit?: { oid?: string | null; checkSuites?: { nodes?: (GqlCheckSuite | null)[] | null } | null } | null } | null)[] | null;
  } | null;
};

type GqlTimelineNode = {
  __typename?: string;
  createdAt?: string | null;
  actor?: { login?: string | null } | null;
  label?: { name?: string | null } | null;
  source?: ({ __typename?: string } & GqlPull) | null;
};

type GqlIssue = {
  number?: number;
  title?: string | null;
  body?: string | null;
  state?: string | null;
  stateReason?: string | null;
  closedAt?: string | null;
  updatedAt?: string | null;
  labels?: { nodes?: ({ name?: string | null } | null)[] | null } | null;
  timelineItems?: { nodes?: (GqlTimelineNode | null)[] | null } | null;
};

type GqlConnection<T> = {
  pageInfo?: { hasNextPage?: boolean } | null;
  nodes?: (T | null)[] | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function mapStatus(status: string): string {
  const value = status.toLowerCase();
  if (value === "pending" || value === "requested") return "queued";
  return value;
}

function mapConclusion(conclusion: string | null | undefined): string | null {
  if (!conclusion) return null;
  const value = conclusion.toLowerCase();
  if (value === "success" || value === "cancelled" || value === "timed_out") return value;
  if (value === "failure" || value === "startup_failure" || value === "action_required") return "failure";
  return null;
}

function ciFromPull(pull: GqlPull): WorkflowRun | null {
  const sha = typeof pull.headRefOid === "string" ? pull.headRefOid : "";
  if (!sha) return null;
  const suites = pull.commits?.nodes ?? [];
  for (const node of suites) {
    const checks = node?.commit?.checkSuites?.nodes ?? [];
    for (const suite of checks) {
      if (!suite?.status) continue;
      const path = suite.workflowRun?.workflow?.resourcePath ?? "";
      if (!path.endsWith(`/workflows/${CI_WORKFLOW_FILE}`)) continue;
      return { status: mapStatus(suite.status), conclusion: mapConclusion(suite.conclusion), head_sha: sha };
    }
  }
  return null;
}

function mapPull(node: GqlPull | null | undefined): GitHubPull | null {
  if (!node || typeof node.number !== "number" || !Number.isFinite(node.number)) return null;
  const body = typeof node.body === "string" ? node.body.slice(0, 100_000) : "";
  return {
    number: node.number,
    body,
    state: node.state === "OPEN" ? "open" : "closed",
    merged_at: typeof node.mergedAt === "string" ? node.mergedAt : null,
    merge_commit_sha: typeof node.mergeCommit?.oid === "string" ? node.mergeCommit.oid : null,
    updated_at: typeof node.updatedAt === "string" ? node.updatedAt : "",
    head: {
      ref: typeof node.headRefName === "string" ? node.headRefName : "",
      sha: typeof node.headRefOid === "string" ? node.headRefOid : "",
    },
  };
}

function connectionPartial<T>(connection: GqlConnection<T> | null | undefined): boolean {
  return connection?.pageInfo?.hasNextPage === true;
}

function requireConnection<T>(value: unknown): GqlConnection<T> {
  const record = asRecord(value);
  if (!record || !Array.isArray(record.nodes)) throw new Error("graphql");
  return record as GqlConnection<T>;
}

export function parseProposalBoard(data: unknown, degraded: boolean): ProposalBoard {
  const root = asRecord(data);
  const repository = asRecord(root?.repository);
  if (!repository) throw new Error("graphql");
  const openIssues = requireConnection<GqlIssue>(repository.openIssues);
  const closedIssues = requireConnection<GqlIssue>(repository.closedIssues);
  const pullRequests = requireConnection<GqlPull>(repository.pullRequests);

  const pulls = new Map<number, GitHubPull>();
  const ciBySha = new Map<string, WorkflowRun>();

  function rememberPull(node: GqlPull | null | undefined): GitHubPull | null {
    const pull = mapPull(node);
    if (!pull) return null;
    if (!pulls.has(pull.number)) pulls.set(pull.number, pull);
    if (node) {
      const run = ciFromPull(node);
      if (run && !ciBySha.has(run.head_sha)) ciBySha.set(run.head_sha, run);
    }
    return pull;
  }

  for (const node of pullRequests.nodes ?? []) rememberPull(node);

  const issues: GitHubIssue[] = [];
  const timelines = new Map<number, unknown[]>();

  function takeIssues(connection: GqlConnection<GqlIssue>): void {
    for (const node of connection.nodes ?? []) {
      if (!node || typeof node.number !== "number" || typeof node.title !== "string" || typeof node.updatedAt !== "string") continue;
      const labels = (node.labels?.nodes ?? [])
        .map((label) => (typeof label?.name === "string" ? label.name : ""))
        .filter((name) => name.length > 0);
      const timeline: unknown[] = [];
      for (const event of node.timelineItems?.nodes ?? []) {
        if (!event) continue;
        if (event.__typename === "LabeledEvent") {
          timeline.push({
            event: "labeled",
            created_at: event.createdAt ?? null,
            actor: { login: event.actor?.login ?? null },
            label: { name: event.label?.name ?? null },
          });
          continue;
        }
        if (event.__typename === "CrossReferencedEvent" && event.source?.__typename === "PullRequest") {
          const pull = rememberPull(event.source);
          if (!pull || typeof event.source.url !== "string") continue;
          timeline.push({
            event: "cross-referenced",
            created_at: event.createdAt ?? null,
            source: { issue: { pull_request: { html_url: event.source.url } } },
          });
        }
      }
      issues.push({
        number: node.number,
        title: node.title,
        body: typeof node.body === "string" ? node.body.slice(0, 20_000) : null,
        state: node.state === "OPEN" ? "open" : "closed",
        state_reason: typeof node.stateReason === "string" ? node.stateReason.toLowerCase() : null,
        closed_at: typeof node.closedAt === "string" ? node.closedAt : null,
        labels: labels.map((name) => ({ name })),
        updated_at: node.updatedAt,
      });
      timelines.set(node.number, timeline);
    }
  }

  takeIssues(openIssues);
  takeIssues(closedIssues);

  return {
    issues,
    pulls: [...pulls.values()],
    timelines,
    ciBySha,
    partial: degraded || connectionPartial(openIssues) || connectionPartial(closedIssues) || connectionPartial(pullRequests),
  };
}

export async function fetchProposalBoard(
  token: string,
  fetchImpl: GitHubFetch,
  options: { closedSince: string },
): Promise<ProposalBoard> {
  const response = await fetchImpl(GRAPHQL_URL, {
    method: "POST",
    redirect: "manual",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "content-type": "application/json",
      "user-agent": "proto-lab",
    },
    body: JSON.stringify({ query: BOARD_QUERY, variables: { since: options.closedSince } }),
  });
  if (response.status !== 200) throw new Error("graphql");
  const text = await readTextLimited(response, GRAPHQL_MAX_BYTES);
  let payload: { data?: unknown; errors?: unknown };
  try {
    payload = JSON.parse(text) as { data?: unknown; errors?: unknown };
  } catch {
    throw new Error("graphql");
  }
  if (!payload.data) throw new Error("graphql");
  const degraded = Array.isArray(payload.errors) && payload.errors.length > 0;
  return parseProposalBoard(payload.data, degraded);
}
