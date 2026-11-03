import { jsonResponse } from "../../../_lib/http";
import { handleShared, type SharedDatabase } from "../../../_lib/shared-handler";
import sharedSlugs from "../../../_lib/shared-slugs.json";

interface Env {
  CF_ACCESS_AUD?: string;
  DB?: D1Database;
}

function databaseOf(db: D1Database | undefined): SharedDatabase | undefined {
  if (!db) return undefined;
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...values) {
          const bound = statement.bind(...values);
          return {
            first() {
              return bound.first();
            },
            run() {
              return bound.run();
            },
          };
        },
      };
    },
  };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    return await handleShared(
      context.request,
      { CF_ACCESS_AUD: context.env.CF_ACCESS_AUD, DB: databaseOf(context.env.DB) },
      { sharedSlugs },
    );
  } catch {
    return jsonResponse(503, { ok: false, error: "unavailable", message: "No he podido usar los datos compartidos." });
  }
};
