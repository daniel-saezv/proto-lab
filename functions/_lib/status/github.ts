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
  /** Rutas del diff. Vacío si la consulta no las trajo. */
  paths: string[];
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

export type DeploymentMetadata = { branch?: string; commit_hash?: string };

export type PagesDeployment = {
  id: string;
  url: string | null;
  /** Forma que devuelve la API de Pages. */
  deployment_trigger?: { metadata?: DeploymentMetadata };
  /** Nombre plano que no viene en la respuesta real; se acepta por compatibilidad. */
  deployment_trigger_metadata?: DeploymentMetadata;
  latest_stage?: { status?: string; name?: string };
  aliases?: string[] | null;
  created_on?: string;
  environment?: string;
  is_skipped?: boolean;
};

/** Tope del subdominio de preview que aplica Cloudflare al alias de rama. */
const PREVIEW_ALIAS_MAX = 28;
const DEPLOYMENTS_PER_PAGE = 25;
const MAX_PREVIEW_PAGES = 4;

/**
 * Alias de rama de Pages: minúsculas, lo que no es alfanumérico pasa a guion
 * y, si pasa de 28 caracteres, se corta. `cursor/permite-divertirse-1617`
 * queda en `cursor-permite-divertirse-16`.
 */
function branchAliasSlug(branch: string): string {
  let normalised = branch.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  while (normalised.startsWith("-")) normalised = normalised.slice(1);
  while (normalised.endsWith("-")) normalised = normalised.slice(0, -1);
  if (!normalised) return "";
  return normalised.length > PREVIEW_ALIAS_MAX ? normalised.slice(0, PREVIEW_ALIAS_MAX) : normalised;
}

function deploymentMeta(item: PagesDeployment): DeploymentMetadata | undefined {
  return item.deployment_trigger?.metadata ?? item.deployment_trigger_metadata;
}

function sameCommit(commitHash: string | undefined, commitSha: string): boolean {
  if (!commitHash || !commitSha) return false;
  if (commitHash === commitSha) return true;
  const prefix = commitSha.slice(0, 7);
  return prefix.length >= 7 && commitHash.startsWith(prefix);
}

function previewHostname(value: string | null | undefined): string | null {
  if (!value) return null;
  const host = value.trim().replace(/^https?:\/\//i, "").split(/[/?#]/)[0]?.toLowerCase() ?? "";
  if (!host.endsWith(PREVIEW_HOST_SUFFIX)) return null;
  return host;
}

function aliasMatchesBranch(item: PagesDeployment, slug: string): boolean {
  if (!slug) return false;
  return (item.aliases ?? []).some((alias) => previewHostname(alias) === `${slug}${PREVIEW_HOST_SUFFIX}`);
}

function previewBranchOk(item: PagesDeployment, branch: string, metaBranch: string | undefined): boolean {
  if (metaBranch === branch) return true;
  const slug = branchAliasSlug(branch);
  if (metaBranch && metaBranch !== slug) return false;
  if (metaBranch === slug) return true;
  return aliasMatchesBranch(item, slug);
}

function stageReady(item: PagesDeployment, allowDeployName: boolean): boolean {
  if (item.is_skipped) return false;
  if (item.latest_stage?.status === "success") return true;
  return allowDeployName && item.latest_stage?.name === "deploy";
}

type DeploymentPage = { result: PagesDeployment[]; totalPages: number };

async function fetchDeploymentPage(
  accountId: string,
  project: string,
  token: string,
  fetchImpl: GitHubFetch,
  environment: "preview" | "production",
  page: number,
): Promise<DeploymentPage> {
  const url =
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${encodeURIComponent(project)}` +
    `/deployments?env=${environment}&per_page=${DEPLOYMENTS_PER_PAGE}&page=${page}`;
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
  const data = JSON.parse(await readTextLimited(response, 1_500_000)) as {
    result?: PagesDeployment[];
    result_info?: { total_pages?: number };
  };
  const total = Number(data.result_info?.total_pages ?? 1);
  return {
    result: Array.isArray(data.result) ? data.result : [],
    totalPages: Number.isFinite(total) && total >= 1 ? total : 1,
  };
}

async function fetchDeploymentEnv(
  accountId: string,
  project: string,
  token: string,
  fetchImpl: GitHubFetch,
  environment: "preview" | "production",
  maxPages: number,
): Promise<PagesDeployment[]> {
  const all: PagesDeployment[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const data = await fetchDeploymentPage(accountId, project, token, fetchImpl, environment, page);
    all.push(...data.result);
    if (page >= data.totalPages || data.result.length === 0) break;
  }
  return all;
}

export async function fetchPagesDeployments(
  accountId: string,
  project: string,
  token: string,
  fetchImpl: GitHubFetch,
): Promise<PagesDeployment[]> {
  const preview = await fetchDeploymentEnv(accountId, project, token, fetchImpl, "preview", MAX_PREVIEW_PAGES);
  try {
    const production = await fetchDeploymentEnv(accountId, project, token, fetchImpl, "production", 1);
    return [...preview, ...production];
  } catch {
    return preview;
  }
}

export function pickPreviewDeployment(
  deployments: readonly PagesDeployment[],
  branch: string,
  commitSha: string,
): PagesDeployment | null {
  const ofBranch = deployments.filter((item) => {
    const meta = deploymentMeta(item);
    return previewBranchOk(item, branch, meta?.branch) && stageReady(item, true);
  });
  ofBranch.sort((a, b) => ((a.created_on ?? "") < (b.created_on ?? "") ? 1 : -1));
  const latest = ofBranch[0];
  if (!latest) return null;
  if (!sameCommit(deploymentMeta(latest)?.commit_hash, commitSha)) return null;
  return latest;
}

export function pickProductionDeployment(
  deployments: readonly PagesDeployment[],
  commitSha: string,
): PagesDeployment | null {
  const matches = deployments.filter((item) => {
    const meta = deploymentMeta(item);
    return meta?.branch === "main" && sameCommit(meta.commit_hash, commitSha) && stageReady(item, false);
  });
  matches.sort((a, b) => ((a.created_on ?? "") < (b.created_on ?? "") ? 1 : -1));
  return matches[0] ?? null;
}

export function publicPreviewUrl(deployment: PagesDeployment | null, branch?: string): string | null {
  if (!deployment) return null;
  const slug = branch ? branchAliasSlug(branch) : "";
  if (slug) return `https://${slug}${PREVIEW_HOST_SUFFIX}`;
  const hosts = (deployment.aliases ?? [])
    .map((alias) => previewHostname(alias))
    .filter((host): host is string => host != null);
  const chosen = hosts[0] ?? previewHostname(deployment.url);
  if (!chosen) return null;
  return `https://${chosen}`;
}

export function productionUrl(deployment: PagesDeployment | null): string {
  if (deployment?.url && deployment.url.includes(PRODUCTION_HOST)) {
    return deployment.url.startsWith("http") ? deployment.url : `https://${deployment.url}`;
  }
  return `https://${PRODUCTION_HOST}`;
}
