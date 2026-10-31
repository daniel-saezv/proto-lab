import { readAccessEmail } from "./access";
import {
  LIMITS,
  buildIssue,
  rateLimitKey,
  validateProposal,
  type ValidProposal,
} from "./validate";

export type KvLike = {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
};

export type ProposalEnv = {
  GITHUB_TOKEN?: string;
  ALLOW_DEV_AUTH?: string;
  PROPOSALS?: KvLike;
};

export type HandlerOptions = {
  knownSlugs?: readonly string[];
  now?: Date;
  fetchImpl?: typeof fetch;
};

const ISSUE_URL = /^https:\/\/github\.com\/daniel-saezv\/proto-lab\/issues\/\d+$/;
const ISSUES_ENDPOINT = "https://api.github.com/repos/daniel-saezv/proto-lab/issues";

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

async function createGitHubIssue(
  token: string,
  proposal: ValidProposal,
  email: string,
  now: Date,
  fetchImpl: typeof fetch,
): Promise<{ ok: true; issueUrl?: string; issueNumber?: number } | { ok: false }> {
  const issue = buildIssue(proposal, email, now);
  let labels = [...issue.labels];

  for (let attempt = 0; attempt < labels.length; attempt += 1) {
    const response = await fetchImpl(ISSUES_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "content-type": "application/json",
        "user-agent": "proto-lab",
        "x-github-api-version": "2022-11-28",
      },
      body: JSON.stringify({ title: issue.title, body: issue.body, labels }),
    });

    if (response.status === 201) {
      const payload = (await response.json().catch(() => null)) as { number?: unknown; html_url?: unknown } | null;
      const issueNumber = typeof payload?.number === "number" ? payload.number : undefined;
      const issueUrl = typeof payload?.html_url === "string" && ISSUE_URL.test(payload.html_url) ? payload.html_url : undefined;
      return { ok: true, issueUrl, issueNumber };
    }

    const detail = await response.text().catch(() => "");
    const missingLabel = response.status === 422 && /label/i.test(detail) && labels.length > 1;
    if (missingLabel) {
      labels = labels.slice(0, -1);
      continue;
    }
    return { ok: false };
  }

  return { ok: false };
}

export async function handleProposal(request: Request, env: ProposalEnv, options: HandlerOptions = {}): Promise<Response> {
  if (request.method !== "POST") {
    return json(405, { ok: false, error: "method", message: "Solo se aceptan propuestas por POST." });
  }

  const email = readAccessEmail(request, env);
  if (!email) {
    return json(401, { ok: false, error: "unauthorized", message: "No hay una sesión de Cloudflare Access." });
  }

  const rawText = await request.text();
  if (rawText.length > LIMITS.maxBodyBytes) {
    return json(400, { ok: false, error: "validation", message: "La nota es demasiado larga." });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return json(400, { ok: false, error: "validation", message: "No he podido leer la nota." });
  }

  const knownSlugs = options.knownSlugs ?? [];
  const validated = validateProposal(parsed, knownSlugs);
  if (!validated.ok) {
    return json(400, { ok: false, error: "validation", message: validated.message, fields: validated.fields });
  }

  const now = options.now ?? new Date();
  if (env.PROPOSALS) {
    try {
      const key = rateLimitKey(email, now);
      const current = Number.parseInt((await env.PROPOSALS.get(key)) ?? "0", 10);
      const count = Number.isFinite(current) && current > 0 ? current : 0;
      if (count >= LIMITS.maxPerDay) {
        return json(429, {
          ok: false,
          error: "limit",
          message: "Hoy ya has enviado el máximo de propuestas.",
        });
      }
    } catch {
      return json(503, {
        ok: false,
        error: "config",
        message: "No he podido consultar el cuaderno de hoy.",
      });
    }
  }

  if (!env.GITHUB_TOKEN) {
    return json(500, { ok: false, error: "config", message: "El taller no tiene token de GitHub." });
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  let created: { ok: true; issueUrl?: string; issueNumber?: number } | { ok: false };
  try {
    created = await createGitHubIssue(env.GITHUB_TOKEN, validated.value, email, now, fetchImpl);
  } catch {
    return json(502, { ok: false, error: "github", message: "No he podido dejar la nota en el tablón." });
  }
  if (!created.ok) {
    return json(502, { ok: false, error: "github", message: "No he podido dejar la nota en el tablón." });
  }

  if (env.PROPOSALS) {
    try {
      const key = rateLimitKey(email, now);
      const current = Number.parseInt((await env.PROPOSALS.get(key)) ?? "0", 10);
      const count = Number.isFinite(current) && current > 0 ? current : 0;
      await env.PROPOSALS.put(key, String(count + 1), { expirationTtl: 60 * 60 * 48 });
    } catch {
      // La issue ya existe. Un fallo al contar no debe hacer creer al amigo que no se envió.
    }
  }

  return json(201, { ok: true, issueUrl: created.issueUrl, issueNumber: created.issueNumber });
}
