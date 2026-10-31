import { CI_WORKFLOW_FILE, PREVIEW_HOST_SUFFIX, PRODUCTION_HOST, REPO_NAME, REPO_OWNER } from "./constants";

export type GitHubFetch = typeof fetch;

export type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  state_reason?: string | null;
  labels: { name: string }[];
  updated_at: string;
};

export type GitHubPull = {
  number: number;
  body: string;
  state: "open" | "closed";
  merged_at: string | null;
  merge_commit_sha: string | null;
  updated_at: string;
  head: { ref: string; sha: string };
};

function ghHeaders(token: string): HeadersInit {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "user-agent": "proto-lab",
    "x-github-api-version": "2022-11-28",
  };
}

export async function fetchProposalIssues(token: string, fetchImpl: GitHubFetch): Promise<GitHubIssue[]> {
  const items: GitHubIssue[] = [];
  for (const state of ["open", "closed"] as const) {
    let page = 1;
    for (;;) {
      const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues?labels=propuesta&state=${state}&per_page=100&page=${page}&sort=updated&direction=desc`;
      const response = await fetchImpl(url, { headers: ghHeaders(token) });
      if (!response.ok) throw new Error("issues");
      const batch = (await response.json()) as GitHubIssue[];
      if (!Array.isArray(batch) || batch.length === 0) break;
      for (const issue of batch) {
        if ("pull_request" in issue && (issue as { pull_request?: unknown }).pull_request) continue;
        items.push(issue);
      }
      if (batch.length < 100) break;
      page += 1;
    }
  }
  return items;
}

export async function fetchIssueTimeline(
  token: string,
  issueNumber: number,
  fetchImpl: GitHubFetch,
): Promise<unknown[]> {
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/issues/${issueNumber}/timeline`;
  const response = await fetchImpl(url, {
    headers: { ...ghHeaders(token), accept: "application/vnd.github.mockingbird-preview+json" },
  });
  if (!response.ok) throw new Error("timeline");
  const data = await response.json();
  return Array.isArray(data) ? data : [];
}

export async function fetchAllPullRequests(token: string, fetchImpl: GitHubFetch): Promise<GitHubPull[]> {
  const items: GitHubPull[] = [];
  for (const state of ["open", "closed"] as const) {
    let page = 1;
    for (;;) {
      const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls?state=${state}&per_page=100&page=${page}&sort=updated&direction=desc`;
      const response = await fetchImpl(url, { headers: ghHeaders(token) });
      if (!response.ok) throw new Error("pulls");
      const batch = (await response.json()) as GitHubPull[];
      if (!Array.isArray(batch) || batch.length === 0) break;
      items.push(...batch);
      if (batch.length < 100) break;
      page += 1;
    }
  }
  return items;
}

export type WorkflowRun = {
  status: string | null;
  conclusion: string | null;
  head_sha: string;
};

let workflowIdCache: number | null = null;

export function resetCiWorkflowCacheForTests(): void {
  workflowIdCache = null;
}

async function resolveCiWorkflowId(token: string, fetchImpl: GitHubFetch): Promise<number | null> {
  if (workflowIdCache != null) return workflowIdCache;
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${CI_WORKFLOW_FILE}`;
  const response = await fetchImpl(url, { headers: ghHeaders(token) });
  if (!response.ok) return null;
  const data = (await response.json()) as { id?: number };
  if (typeof data.id === "number") workflowIdCache = data.id;
  return workflowIdCache;
}

export async function fetchCiForHeadSha(
  token: string,
  headSha: string,
  fetchImpl: GitHubFetch,
): Promise<WorkflowRun | null> {
  const workflowId = await resolveCiWorkflowId(token, fetchImpl);
  if (workflowId == null) return null;
  const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/${workflowId}/runs?head_sha=${encodeURIComponent(headSha)}&per_page=5`;
  const response = await fetchImpl(url, { headers: ghHeaders(token) });
  if (!response.ok) return null;
  const data = (await response.json()) as { workflow_runs?: WorkflowRun[] };
  const runs = data.workflow_runs ?? [];
  return runs[0] ?? null;
}

export function ciSnapshotFromRun(run: WorkflowRun | null): import("./phases").CiSnapshot {
  if (!run) return { state: "none" };
  if (run.status === "queued" || run.status === "in_progress" || run.status === "waiting") return { state: "running" };
  if (run.status === "completed") {
    if (run.conclusion === "success") return { state: "success" };
    if (run.conclusion === "failure" || run.conclusion === "cancelled" || run.conclusion === "timed_out") {
      return { state: "failure" };
    }
  }
  return { state: "none" };
}

export type PagesDeployment = {
  id: string;
  url: string | null;
  deployment_trigger_metadata?: { branch?: string; commit_hash?: string };
  latest_stage?: { status?: string; name?: string };
  aliases?: string[] | null;
  created_on?: string;
  environment?: string;
};

export async function fetchPagesDeployments(
  accountId: string,
  project: string,
  token: string,
  fetchImpl: GitHubFetch,
): Promise<PagesDeployment[]> {
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}/deployments?per_page=25`;
  const response = await fetchImpl(url, {
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
  });
  if (!response.ok) throw new Error("pages");
  const data = (await response.json()) as { result?: PagesDeployment[] };
  return data.result ?? [];
}

export function pickPreviewDeployment(
  deployments: readonly PagesDeployment[],
  branch: string,
  commitSha: string,
): PagesDeployment | null {
  const matches = deployments.filter((item) => {
    const meta = item.deployment_trigger_metadata;
    const sameBranch = meta?.branch === branch;
    const sameCommit = meta?.commit_hash === commitSha || meta?.commit_hash?.startsWith(commitSha.slice(0, 7));
    const stageOk = item.latest_stage?.status === "success" || item.latest_stage?.name === "deploy";
    return sameBranch && sameCommit && stageOk;
  });
  matches.sort((a, b) => ((a.created_on ?? "") < (b.created_on ?? "") ? 1 : -1));
  return matches[0] ?? null;
}

export function pickProductionDeployment(
  deployments: readonly PagesDeployment[],
  commitSha: string,
): PagesDeployment | null {
  const matches = deployments.filter((item) => {
    const meta = item.deployment_trigger_metadata;
    const onMain = meta?.branch === "main";
    const sameCommit = meta?.commit_hash === commitSha || meta?.commit_hash?.startsWith(commitSha.slice(0, 7));
    const stageOk = item.latest_stage?.status === "success";
    return onMain && sameCommit && stageOk;
  });
  matches.sort((a, b) => ((a.created_on ?? "") < (b.created_on ?? "") ? 1 : -1));
  return matches[0] ?? null;
}

export function publicPreviewUrl(deployment: PagesDeployment | null): string | null {
  if (!deployment) return null;
  const alias = deployment.aliases?.find((host) => host.endsWith(PREVIEW_HOST_SUFFIX));
  if (alias) return `https://${alias}`;
  if (deployment.url && deployment.url.includes(PREVIEW_HOST_SUFFIX)) {
    return deployment.url.startsWith("http") ? deployment.url : `https://${deployment.url}`;
  }
  return null;
}

export function productionUrl(deployment: PagesDeployment | null): string {
  if (deployment?.url && deployment.url.includes(PRODUCTION_HOST)) {
    return deployment.url.startsWith("http") ? deployment.url : `https://${deployment.url}`;
  }
  return `https://${PRODUCTION_HOST}`;
}
