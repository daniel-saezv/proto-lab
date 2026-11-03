import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readCatalog, sharedCapabilitySlugs } from "./catalog-lib.mjs";
import { assertLabMigrations, readTableQueries } from "./table-sql.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entries = readCatalog(root);
const catalogPath = join(root, "apps/world/src/generated/catalog.json");
const slugsPath = join(root, "functions/_lib/slugs.json");
const sharedPath = join(root, "functions/_lib/shared-slugs.json");
const tableQueriesPath = join(root, "functions/_lib/table-queries.json");
assertLabMigrations(root);
mkdirSync(dirname(catalogPath), { recursive: true });
writeFileSync(catalogPath, `${JSON.stringify({ prototypes: entries }, null, 2)}\n`);
writeFileSync(slugsPath, `${JSON.stringify(entries.map((entry) => entry.slug))}\n`);
writeFileSync(sharedPath, `${JSON.stringify(sharedCapabilitySlugs(entries))}\n`);
writeFileSync(tableQueriesPath, `${JSON.stringify(readTableQueries(root))}\n`);
console.log(`Catálogo: ${entries.map((entry) => entry.slug).join(", ")}`);
