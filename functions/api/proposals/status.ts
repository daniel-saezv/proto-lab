import { handleProposalStatus, type ProposalStatusEnv } from "../../_lib/status-handler";

interface Env extends ProposalStatusEnv {
  PROPOSALS?: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    return await handleProposalStatus(context.request, context.env);
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "upstream", message: "No he podido leer el tablón." }), {
      status: 502,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
        "x-frame-options": "DENY",
      },
    });
  }
};
