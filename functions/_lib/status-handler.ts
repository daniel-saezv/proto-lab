import { readAccessEmail, type AccessEnv } from "./access";
import { jsonResponse } from "./http";
import { buildProposalStatus, type StatusEnv } from "./status/aggregate";

export type ProposalStatusEnv = StatusEnv & AccessEnv;

function json(status: number, body: unknown): Response {
  return jsonResponse(status, body);
}

export type StatusHandlerOptions = {
  fetchImpl?: typeof fetch;
  now?: Date;
};

export async function handleProposalStatus(
  request: Request,
  env: ProposalStatusEnv,
  options: StatusHandlerOptions = {},
): Promise<Response> {
  if (request.method !== "GET") {
    return json(405, { ok: false, error: "method", message: "Solo se acepta GET." });
  }

  const email = await readAccessEmail(request, env, options.fetchImpl ?? fetch);
  if (!email) {
    return json(401, { ok: false, error: "unauthorized", message: "No hay una sesión de Cloudflare Access." });
  }

  try {
    const result = await buildProposalStatus(env, options);
    return json(200, result);
  } catch {
    return json(502, { ok: false, error: "upstream", message: "No he podido leer el tablón." });
  }
}
