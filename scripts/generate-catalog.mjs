import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readCatalog } from "./catalog-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const entries = readCatalog(root);
const catalogPath = join(root, "apps/world/src/generated/catalog.json");
const slugsPath = join(root, "functions/_lib/slugs.json");
mkdirSync(dirname(catalogPath), { recursive: true });
writeFileSync(catalogPath, `${JSON.stringify({ prototypes: entries }, null, 2)}\n`);
writeFileSync(slugsPath, `${JSON.stringify(entries.map((entry) => entry.slug))}\n`);
console.log(`Catálogo: ${entries.map((entry) => entry.slug).join(", ")}`);
