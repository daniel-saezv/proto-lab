export type ProposalPhase =
  | "recibida"
  | "aprobada"
  | "en_curso"
  | "pr_abierto"
  | "ci_en_curso"
  | "ci_correcta"
  | "ci_con_fallos"
  | "preview_lista"
  | "publicada"
  | "cerrada_sin_hacer";

export type ProposalStatusItem = {
  number: number;
  title: string;
  kind: "propuesta" | "iteracion";
  slug: string | null;
  phase: ProposalPhase;
  updatedAt: string;
  previewUrl?: string;
};

export type ProposalStatusResponse = {
  ok: true;
  partial: boolean;
  items: ProposalStatusItem[];
};

export async function fetchProposalStatus(): Promise<ProposalStatusResponse> {
  const response = await fetch("/api/proposals/status", { method: "GET", cache: "no-store" });
  if (response.status === 401) {
    throw new Error("unauthorized");
  }
  if (!response.ok) {
    throw new Error("upstream");
  }
  return (await response.json()) as ProposalStatusResponse;
}
