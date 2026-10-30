import { handleProposal, type ProposalEnv } from "../_lib/handler";
import knownSlugs from "../_lib/slugs.json";

interface Env extends ProposalEnv {
  PROPOSALS?: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    return await handleProposal(context.request, context.env, { knownSlugs });
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "github", message: "No he podido dejar la nota en el tablón." }), {
      status: 500,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  }
};
