import { jsonResponse } from "../../../_lib/http";
import { handleQuery, type QueryCatalog, type QueryDatabase } from "../../../_lib/query-handler";
import tableQueries from "../../../_lib/table-queries.json";

interface Env {
  CF_ACCESS_AUD?: string;
  DB?: D1Database;
}

function databaseOf(db: D1Database | undefined): QueryDatabase | undefined {
  if (!db) return undefined;
  return {
    prepare(sql) {
      const statement = db.prepare(sql);
      return {
        bind(...values) {
          const bound = statement.bind(...values);
          return {
            async all() {
              const result = await bound.all();
              return Array.isArray(result.results) ? result.results : [];
            },
          };
        },
      };
    },
  };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  try {
    return await handleQuery(
      context.request,
      { CF_ACCESS_AUD: context.env.CF_ACCESS_AUD, DB: databaseOf(context.env.DB) },
      { queries: tableQueries as QueryCatalog },
    );
  } catch {
    return jsonResponse(503, { ok: false, error: "unavailable", message: "No he podido ejecutar la consulta." });
  }
};
