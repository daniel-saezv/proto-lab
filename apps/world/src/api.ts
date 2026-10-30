import type { ProposalDraft, SubmitOutcome } from "./types";

export async function sendProposal(draft: ProposalDraft): Promise<SubmitOutcome> {
  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (import.meta.env.DEV) headers["x-dev-user-email"] = "dev@example.com";
    const response = await fetch("/api/proposals", {
      method: "POST",
      headers,
      body: JSON.stringify(draft),
    });
    const data = (await response.json().catch(() => null)) as { ok?: boolean; error?: string; message?: string; issueUrl?: string } | null;
    if (response.status === 401 || data?.error === "unauthorized") return { ok: false, error: "unauthorized" };
    if (response.status === 429 || data?.error === "limit") return { ok: false, error: "limit" };
    if (data?.error === "validation") return { ok: false, error: "validation", message: data.message };
    if (data?.error === "config") return { ok: false, error: "config", message: data.message };
    if (response.ok && data?.ok === true) {
      return { ok: true, issueUrl: typeof data.issueUrl === "string" ? data.issueUrl : undefined };
    }
    return { ok: false, error: "github" };
  } catch {
    return { ok: false, error: "network" };
  }
}
