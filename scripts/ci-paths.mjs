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

const CLOSING_ISSUE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\s*:?\s*#(\d+)\b/gi;

/** Números de issue que el cuerpo cierra. Una mención suelta `#N` no cuenta. */
export function closingIssueNumbers(body) {
  const numbers = new Set();
  for (const match of String(body ?? "").matchAll(CLOSING_ISSUE)) numbers.add(Number(match[1]));
  return [...numbers].sort((left, right) => left - right);
}

/**
 * Si el PR cierra una issue con etiqueta `propuesta`, el diff solo puede
 * tocar un `protos/<slug>/` y, como extra, `pnpm-lock.yaml`.
 * `labelsByNumber` es un Map de número a nombres. Si falta una issue, falla en cerrado.
 * @returns {string | null}
 */
export function proposalScopeError(files, closingNumbers, labelsByNumber) {
  if (closingNumbers.length === 0) return null;
  const propuestas = [];
  for (const number of closingNumbers) {
    if (!labelsByNumber.has(number)) {
      return `no se pudo leer la issue #${number}; la barrera de una propuesta falla en cerrado`;
    }
    const labels = labelsByNumber.get(number) ?? [];
    if (labels.includes("propuesta")) propuestas.push(number);
  }
  if (propuestas.length === 0) return null;
  const slugs = new Set();
  const extras = [];
  for (const file of files) {
    const path = String(file).replaceAll("\\", "/").replace(/^\.\//, "");
    const match = /^protos\/([^/]+)\//.exec(path);
    if (match && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(match[1])) {
      slugs.add(match[1]);
      continue;
    }
    if (path === "pnpm-lock.yaml") continue;
    extras.push(path);
  }
  const list = [...slugs].sort();
  const cited = propuestas.map((number) => `#${number}`).join(", ");
  if (list.length !== 1) {
    return `la propuesta ${cited} solo puede tocar un prototipo (hay ${list.length}: ${list.join(", ") || "ninguno"})`;
  }
  if (extras.length > 0) {
    return `la propuesta ${cited} no puede tocar ${extras.join(", ")}`;
  }
  return null;
}

function githubHeaders(token) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "proto-lab-ci",
  };
}

async function listPullFiles(repo, number, token) {
  const files = [];
  for (let page = 1; page < 20; page += 1) {
    const url = `https://api.github.com/repos/${repo}/pulls/${number}/files?per_page=100&page=${page}`;
    const response = await fetch(url, { headers: githubHeaders(token) });
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

async function githubJson(repo, path, token, what) {
  const response = await fetch(`https://api.github.com/repos/${repo}/${path}`, { headers: githubHeaders(token) });
  if (!response.ok) throw new Error(`No se pudo leer ${what} (${response.status})`);
  return response.json();
}

async function pullRequestBody(repo, number, token) {
  const body = await githubJson(repo, `pulls/${number}`, token, "el cuerpo del PR");
  return typeof body.body === "string" ? body.body : "";
}

async function issueLabelNames(repo, number, token) {
  const body = await githubJson(repo, `issues/${number}`, token, `la issue #${number}`);
  if (!Array.isArray(body.labels)) throw new Error(`La issue #${number} no trae etiquetas`);
  return body.labels
    .map((label) => (typeof label === "string" ? label : label?.name))
    .filter((name) => typeof name === "string");
}

function labelsFromEnv() {
  const map = new Map();
  const raw = process.env.CI_ISSUE_LABELS ?? "";
  if (!raw) return map;
  for (const part of raw.split(";")) {
    const [num, names] = part.split("=");
    const number = Number(num);
    if (!Number.isInteger(number)) continue;
    map.set(number, (names ?? "").split(",").map((name) => name.trim()).filter(Boolean));
  }
  return map;
}

async function assertProposalScope(files) {
  const override = process.env.CI_PR_BODY;
  const offline = process.env.CI_PATHS_FILES != null;
  if (offline && !override) return;
  let body = override ?? "";
  if (!offline) {
    const repo = process.env.GITHUB_REPOSITORY;
    const number = process.env.PR_NUMBER;
    const token = process.env.GITHUB_TOKEN;
    if (!repo || !number || !token) {
      throw new Error("Faltan GITHUB_REPOSITORY, PR_NUMBER o GITHUB_TOKEN para la barrera de la propuesta");
    }
    body = await pullRequestBody(repo, number, token);
    const numbers = closingIssueNumbers(body);
    if (numbers.length === 0) return;
    const labels = new Map();
    for (const issue of numbers) labels.set(issue, await issueLabelNames(repo, issue, token));
    const error = proposalScopeError(files, numbers, labels);
    if (error) throw new Error(error);
    return;
  }
  const numbers = closingIssueNumbers(body);
  if (numbers.length === 0) return;
  const error = proposalScopeError(files, numbers, labelsFromEnv());
  if (error) throw new Error(error);
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
  try {
    const eventName = process.env.EVENT_NAME ?? "pull_request";
    const files = await changedFiles(eventName);
    if (eventName === "pull_request") await assertProposalScope(files);
    const result = decide(files, eventName);
    console.log(`modo=${result.mode} lab=${result.lab} protos=${result.protos.join(",") || "-"} archivos=${files.length}`);
    writeOutput(result);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
