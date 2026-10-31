import { LABEL_EN_CURSO } from "./constants";
import type { PullRequestRef } from "./issue-pr";
import { pickPhase, type ProposalPhase } from "./constants";

export type CiSnapshot =
  | { state: "none" }
  | { state: "running" }
  | { state: "success" }
  | { state: "failure" };

export type DeploySnapshot = {
  previewReady: boolean;
  previewUrl: string | null;
  productionReady: boolean;
};

export type PhaseInput = {
  issueOpen: boolean;
  issueStateReason: string | null;
  labels: readonly string[];
  approvedByOwner: boolean;
  pull: PullRequestRef | null;
  ci: CiSnapshot;
  deploy: DeploySnapshot;
};

export function computePhaseCandidates(input: PhaseInput): ProposalPhase[] {
  const candidates: ProposalPhase[] = [];

  const pr = input.pull;
  const abandonedIssue = !input.issueOpen && input.issueStateReason === "not_planned";
  const prClosedWithoutMerge = pr != null && pr.state === "closed" && !pr.merged;
  if (abandonedIssue || prClosedWithoutMerge) {
    candidates.push("cerrada_sin_hacer");
  }

  if (pr?.merged && input.deploy.productionReady) {
    candidates.push("publicada");
  } else if (pr?.merged) {
    candidates.push("publicada");
  }

  if (input.deploy.previewReady && input.deploy.previewUrl) {
    candidates.push("preview_lista");
  }

  if (input.ci.state === "success") candidates.push("ci_correcta");
  if (input.ci.state === "failure") candidates.push("ci_con_fallos");
  if (input.ci.state === "running") candidates.push("ci_en_curso");

  if (pr?.state === "open") candidates.push("pr_abierto");

  if (input.labels.includes(LABEL_EN_CURSO)) candidates.push("en_curso");

  if (input.approvedByOwner) candidates.push("aprobada");

  if (candidates.length === 0) candidates.push("recibida");

  return candidates;
}

export function resolvePhase(input: PhaseInput): ProposalPhase {
  return pickPhase(computePhaseCandidates(input));
}

export function previewUrlForPhase(phase: ProposalPhase, deploy: DeploySnapshot): string | null {
  if (phase !== "preview_lista") return null;
  return deploy.previewUrl;
}
