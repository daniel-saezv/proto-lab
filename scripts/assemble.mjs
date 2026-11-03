import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { assertServedApp } from "./app-budget.mjs";
import { CATALOG_SKIP } from "./catalog-lib.mjs";
import { assertSharedEngines } from "./godot-engine.mjs";
import { assertGodotTree } from "./godot-web.mjs";
import { resolveProtoOutput, STATIC_SKIP } from "./proto-publish.mjs";
import { writeCapabilityHeaders } from "./proto-csp.mjs";
import { isShellPath, renderServiceWorker } from "./sw.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist");
const worldDist = join(root, "apps/world/dist");

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(worldDist, out, { recursive: true });

const protosDir = join(root, "protos");
for (const slug of readdirSync(protosDir)) {
  const protoDir = join(protosDir, slug);
  if (!statSync(protoDir).isDirectory()) continue;
  if (CATALOG_SKIP.has(slug)) {
    cpSync(protoDir, join(out, "protos", slug), { recursive: true });
    continue;
  }
  const output = resolveProtoOutput(protoDir);
  const target = join(out, "protos", slug);
  if (output.kind === "build") {
    cpSync(output.dir, target, { recursive: true });
  } else {
    mkdirSync(target, { recursive: true });
    for (const name of readdirSync(protoDir)) {
      if (STATIC_SKIP.has(name) || name.startsWith(".")) continue;
      cpSync(join(protoDir, name), join(target, name), { recursive: true });
    }
  }
  const manifestPath = join(protoDir, "proto.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.preview) {
      const previewFile = join(protoDir, manifest.preview);
      if (existsSync(previewFile)) {
        cpSync(previewFile, join(target, manifest.preview));
      }
    }
  }
  assertServedApp(target, `protos/${slug}`);
  const godotErrors = assertGodotTree(protoDir);
  if (godotErrors.length > 0) {
    throw new Error(godotErrors.map((line) => `protos/${slug}: ${line}`).join("\n"));
  }
}
assertSharedEngines(root);

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
writeCapabilityHeaders(root, join(out, "_headers"));
console.log(`Sitio en dist/ con ${shell.length} archivos de shell.`);
