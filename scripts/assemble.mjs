import { cpSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { isShellPath, renderServiceWorker } from "./sw.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist");
const worldDist = join(root, "apps/world/dist");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(worldDist, out, { recursive: true });

const protosDir = join(root, "protos");
for (const slug of readdirSync(protosDir)) {
  const dist = join(protosDir, slug, "dist");
  if (!statSync(dist, { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error(`Falta el build de protos/${slug}. Ejecuta pnpm build.`);
  }
  cpSync(dist, join(out, "protos", slug), { recursive: true });
}

const shell = [];
function walk(dir) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (dir === out && name === "protos") continue;
      walk(abs);
      continue;
    }
    const pathname = `/${relative(out, abs).split("\\").join("/")}`;
    if (isShellPath(pathname)) shell.push(pathname);
  }
}
walk(out);
writeFileSync(join(out, "sw.js"), renderServiceWorker(shell));
console.log(`Sitio en dist/ con ${shell.length} archivos de shell.`);
