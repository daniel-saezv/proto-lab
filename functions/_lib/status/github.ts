import { PREVIEW_HOST_SUFFIX, PRODUCTION_HOST } from "./constants";
import { readTextLimited } from "../read-limited";

export type GitHubFetch = typeof fetch;

export type GitHubIssue = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  state_reason?: string | null;
  closed_at?: string | null;
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

export type WorkflowRun = {
  status: string | null;
  conclusion: string | null;
  head_sha: string;
};

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
    method: "GET",
    redirect: "manual",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json",
      "content-type": "application/json",
    },
  });
  if (response.status !== 200) throw new Error("pages");
  const data = JSON.parse(await readTextLimited(response, 1_500_000)) as { result?: PagesDeployment[] };
  return Array.isArray(data.result) ? data.result : [];
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
