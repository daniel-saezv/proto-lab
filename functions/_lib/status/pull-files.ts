import { REPO_NAME, REPO_OWNER } from "./constants";
import type { GitHubFetch } from "./github";
import { readTextLimited } from "../read-limited";

const FILES_PER_PAGE = 100;
const FILES_MAX_PAGES = 3;
const FILES_MAX_BYTES = 2_000_000;

export type PullFileList = {
  paths: string[];
  /** False si queda otra página sin leer: el slug podría ser ambiguo. */
  complete: boolean;
};

/** Nombres del diff. `removed` no cuenta: la aplicación ya no está en esa carpeta. */
export function filenamesFromPullFilePage(body: unknown): string[] | null {
  if (!Array.isArray(body)) return null;
  const paths: string[] = [];
  for (const entry of body) {
    if (!entry || typeof entry !== "object") continue;
    const file = entry as { filename?: unknown; status?: unknown };
    if (file.status === "removed") continue;
    if (typeof file.filename !== "string") continue;
    const name = file.filename;
    if (!name || name.startsWith("/") || name.includes("..") || name.includes("\\")) continue;
    paths.push(name);
  }
  return paths;
}

function hasNextPage(link: string | null, pageLength: number): boolean {
  if (link && link.split(",").some((part) => /rel="next"/.test(part))) return true;
  return pageLength === FILES_PER_PAGE;
}

/**
 * `GET /pulls/{n}/files` lista añadidos, modificados y renombrados con
 * `pull_requests=read` (el permiso del token del tablón). No usa el parche.
 */
export async function fetchPullFilenames(
  token: string,
  pullNumber: number,
  fetchImpl: GitHubFetch,
): Promise<PullFileList | null> {
  const paths: string[] = [];
  for (let page = 1; page <= FILES_MAX_PAGES; page += 1) {
    const url = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/pulls/${pullNumber}/files?per_page=${FILES_PER_PAGE}&page=${page}`;
    const response = await fetchImpl(url, {
      method: "GET",
      redirect: "manual",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/vnd.github+json",
        "user-agent": "proto-lab",
        "x-github-api-version": "2022-11-28",
      },
    });
    if (response.status !== 200) return null;
    let body: unknown;
    try {
      body = JSON.parse(await readTextLimited(response, FILES_MAX_BYTES));
    } catch {
      return null;
    }
    const pagePaths = filenamesFromPullFilePage(body);
    if (!pagePaths || !Array.isArray(body)) return null;
    paths.push(...pagePaths);
    const more = hasNextPage(response.headers.get("link"), body.length);
    if (!more) return { paths, complete: true };
    if (page === FILES_MAX_PAGES) return { paths, complete: false };
  }
  return { paths, complete: false };
}
