import { handleWorkshop, type WorkshopEnv } from "../_lib/workshop-handler";
import knownSlugs from "../_lib/slugs.json";

interface Env extends WorkshopEnv {
  PROPOSALS?: KVNamespace;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    return await handleWorkshop(context.request, context.env, { knownSlugs });
  } catch {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "model",
        message: "La máquina no ha respondido. Puedes probar otra vez o seguir con tu nota.",
        restore: false,
      }),
      {
        status: 500,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "referrer-policy": "no-referrer",
          "x-frame-options": "DENY",
        },
      },
    );
  }
};
