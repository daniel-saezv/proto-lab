import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const LAB_PREFIXES = ["apps/world/", "functions/", "e2e/", "scripts/", ".github/"];

const ROOT_CONFIG = new Set([
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "tsconfig.json",
  "vitest.config.ts",
  "playwright.config.ts",
  "wrangler.toml",
  ".npmrc",
  ".nvmrc",
  ".node-version",
  ".gitignore",
]);

export function classifyPaths(files) {
  let lab = false;
  const protos = new Set();
  for (const file of files) {
    const path = String(file).replaceAll("\\", "/").replace(/^\.\//, "");
    if (LAB_PREFIXES.some((prefix) => path.startsWith(prefix)) || ROOT_CONFIG.has(path)) {
      lab = true;
      continue;
    }
    const match = /^protos\/([^/]+)\//.exec(path);
    if (!match) continue;
    const slug = match[1];
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) continue;
    protos.add(slug);
  }
  const list = [...protos].sort();
  const mode = lab || list.length === 0 ? "completo" : "aplicaciones";
  return { lab, protos: list, mode };
}

export function decide(files, eventName) {
  if (eventName !== "pull_request") {
    return { lab: true, protos: [], mode: "completo" };
  }
  return classifyPaths(files);
}

async function listPullFiles(repo, number, token) {
  const files = [];
  for (let page = 1; page < 20; page += 1) {
    const url = `https://api.github.com/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "proto-lab-ci",
      },
    });
    if (!response.ok) {
      throw new Error(`No se pudo leer el diff del PR (${response.status})`);
    }
    const body = await response.json();
    if (!Array.isArray(body) || body.length === 0) break;
    for (const item of body) {
      if (item && typeof item.filename === "string") files.push(item.filename);
    }
    if (body.length < 100) break;
  }
  return files;
}

function writeOutput(result) {
  const lines = [`lab=${result.lab ? "true" : "false"}`, `protos=${result.protos.join(",")}`, `mode=${result.mode}`, ""].join("\n");
  const file = process.env.GITHUB_OUTPUT;
  if (file) appendFileSync(file, lines);
  else process.stdout.write(lines);
}

function invokedDirectly() {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

async function changedFiles(eventName) {
  if (process.env.CI_PATHS_FILES != null) {
    return process.env.CI_PATHS_FILES.split("\n").filter(Boolean);
  }
  if (eventName !== "pull_request") return [];
  const repo = process.env.GITHUB_REPOSITORY;
  const number = process.env.PR_NUMBER;
  const token = process.env.GITHUB_TOKEN;
  if (!repo || !number || !token) {
    throw new Error("Faltan GITHUB_REPOSITORY, PR_NUMBER o GITHUB_TOKEN para clasificar el diff");
  }
  return listPullFiles(repo, number, token);
}

if (invokedDirectly()) {
  const eventName = process.env.EVENT_NAME ?? "pull_request";
  const files = await changedFiles(eventName);
  const result = decide(files, eventName);
  console.log(`modo=${result.mode} lab=${result.lab} protos=${result.protos.join(",") || "-"} archivos=${files.length}`);
  writeOutput(result);
}
