import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { installAccessKeysForTests, readAccessEmail, resetAccessCertsForTests } from "./access";
import { accessClaims, createAccessFixture, type AccessFixture } from "./access-fixture";
import { handleProposalStatus } from "./status-handler";
import { aprobadoByOwner } from "./status/aprobado";
import {
  cacheFreshness,
  readStatusCache,
  writeStatusCache,
  STATUS_CACHE_KEY,
  STATUS_CACHE_STORE_SECONDS,
  STATUS_CACHE_TTL_SECONDS,
  statusCacheKey,
  type KvLike,
} from "./status/cache";
import { pickPhase, STATUS_TITLE_MAX } from "./status/constants";
import {
  escapeDisplayText,
  extractSlug,
  issueMentionsPattern,
  previewAppUrl,
  resolveAppSlug,
  stripIssueTitlePrefix,
  truncateTitle,
} from "./status/format";
import { boardDegradedByErrors } from "./status/graphql";
import { prFromBodyMention, pickLinkedPullRequest } from "./status/issue-pr";
import { filenamesFromPullFilePage } from "./status/pull-files";
import { resolvePhase } from "./status/phases";
import { buildProposalStatus } from "./status/aggregate";
import { boardClosedSinceIso, BOARD_VISIBLE_MS, isIssueVisibleOnBoard } from "./status/board-visibility";
import { ciSnapshotFromRun, pickPreviewDeployment, pickProductionDeployment, publicPreviewUrl } from "./status/github";

const EMAIL = "amigo@example.com";
const TOKEN = "ghs_status_test";

function memoryKv(): KvLike & { store: Map<string, string> } {
  const store = new Map<string, string>();
  return {
    store,
    async get(key) {
      return store.get(key) ?? null;
    },
    async put(key, value, options) {
      store.set(key, value);
      expect(options?.expirationTtl).toBe(STATUS_CACHE_STORE_SECONDS);
    },
  };
}

let fixture: AccessFixture;

beforeAll(async () => {
  fixture = await createAccessFixture();
  installAccessKeysForTests([fixture.publicJwk]);
});

afterAll(() => {
  resetAccessCertsForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const MARKER = "<!-- proto-lab: peticion-de-usuario -->\n";

function gqlIssue(input: {
  number: number;
  title: string;
  updatedAt: string;
  state?: "OPEN" | "CLOSED";
  stateReason?: string | null;
  closedAt?: string | null;
  labels?: string[];
  timeline?: unknown[];
}) {
  return {
    number: input.number,
    title: input.title,
    body: MARKER,
    state: input.state ?? "OPEN",
    stateReason: input.stateReason ?? null,
    closedAt: input.closedAt ?? null,
    updatedAt: input.updatedAt,
    labels: { nodes: (input.labels ?? ["propuesta"]).map((name) => ({ name })) },
    timelineItems: { nodes: input.timeline ?? [] },
  };
}

function jsonResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
}

function openPull(input: { sha: string; branch?: string; suites: unknown[]; files?: string[] | null }) {
  const branch = input.branch ?? "cursor/permite-divertirse-1617";
  return {
    number: 61,
    body: "Closes #60",
    state: "OPEN" as const,
    url: "https://github.com/daniel-saezv/proto-lab/pull/61",
    updatedAt: "2026-11-01T16:01:48Z",
    mergedAt: null,
    headRefName: branch,
    headRefOid: input.sha,
    mergeCommit: null,
    headRef: { target: { oid: input.sha, checkSuites: { nodes: input.suites } } },
    files: input.files ? { nodes: input.files.map((path) => ({ path })) } : null,
  };
}

function issue60(pull: ReturnType<typeof openPull>) {
  return gqlIssue({
    number: 60,
    title: "[propuesta] Permite divertirse",
    updatedAt: "2026-11-01T16:02:00Z",
    labels: ["propuesta", "aprobado", "en-curso"],
    timeline: [
      { __typename: "LabeledEvent", createdAt: "2026-11-01T15:27:29Z", actor: { login: "daniel-saezv" }, label: { name: "aprobado" } },
      { __typename: "CrossReferencedEvent", createdAt: "2026-11-01T16:00:50Z", source: { __typename: "PullRequest", ...pull } },
    ],
  });
}

function boardResponse(open: unknown[], closed: unknown[] = [], pulls: unknown[] = [], errors?: unknown[]) {
  return new Response(
    JSON.stringify({
      data: {
        repository: {
          openIssues: { pageInfo: { hasNextPage: false }, nodes: open },
          closedIssues: { pageInfo: { hasNextPage: false }, nodes: closed },
          pullRequests: { pageInfo: { hasNextPage: false }, nodes: pulls },
        },
      },
      errors,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

describe("acceso", () => {
  it("exige un JWT de Access y no se fía del email", async () => {
    const response = await handleProposalStatus(
      new Request("https://example/api/proposals/status", { headers: { "Cf-Access-Authenticated-User-Email": EMAIL } }),
      { CF_ACCESS_AUD: fixture.aud },
    );
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(JSON.stringify(body)).not.toContain(EMAIL);
  });

  it("acepta X-Dev-User-Email solo en loopback y con ALLOW_DEV_AUTH", async () => {
    const ok = await handleProposalStatus(
      new Request("http://127.0.0.1/api/proposals/status", { headers: { "X-Dev-User-Email": EMAIL } }),
      { ALLOW_DEV_AUTH: "true", GITHUB_STATUS_TOKEN: TOKEN },
      { fetchImpl: vi.fn(async () => new Response("no", { status: 502 })) },
    );
    expect(ok.status).not.toBe(401);
    const email = await readAccessEmail(
      new Request("http://127.0.0.1/x", { headers: { "X-Dev-User-Email": EMAIL } }),
      { ALLOW_DEV_AUTH: "true" },
    );
    expect(email).toBe(EMAIL);
    const leaked = await readAccessEmail(
      new Request("https://proto-lab-3k6.pages.dev/api/proposals/status", { headers: { "X-Dev-User-Email": EMAIL } }),
      { ALLOW_DEV_AUTH: "true" },
    );
    expect(leaked).toBeNull();
  });

  it("rechaza métodos distintos de GET", async () => {
    const response = await handleProposalStatus(
      new Request("https://example/api/proposals/status", { method: "POST", headers: { "Cf-Access-Authenticated-User-Email": EMAIL } }),
      { GITHUB_STATUS_TOKEN: TOKEN },
    );
    expect(response.status).toBe(405);
  });
});

describe("fases", () => {
  it("prioriza estados más avanzados", () => {
    expect(pickPhase(["recibida", "aprobada", "pr_abierto"])).toBe("pr_abierto");
    expect(pickPhase(["ci_correcta", "preview_lista"])).toBe("preview_lista");
    expect(pickPhase(["publicada", "preview_lista"])).toBe("publicada");
  });

  it("marca cerrada_sin_hacer por encima del resto", () => {
    expect(pickPhase(["publicada", "cerrada_sin_hacer"])).toBe("cerrada_sin_hacer");
  });

  it("resuelve el flujo típico", () => {
    const base = {
      issueOpen: true,
      issueStateReason: null,
      labels: [] as string[],
      approvedByOwner: false,
      pull: null,
      ci: { state: "none" as const },
      deploy: { previewReady: false, previewUrl: null, productionReady: false },
    };
    expect(resolvePhase(base)).toBe("recibida");
    expect(resolvePhase({ ...base, approvedByOwner: true })).toBe("aprobada");
    expect(resolvePhase({ ...base, labels: ["en-curso"], approvedByOwner: true })).toBe("en_curso");
    expect(
      resolvePhase({
        ...base,
        pull: { number: 2, updated_at: "", headSha: "abc", mergeCommitSha: null, branch: "cursor/x", merged: false, state: "open" },
        ci: { state: "running" },
      }),
    ).toBe("ci_en_curso");
  });
});

describe("formato", () => {
  it("trunca y limpia títulos", () => {
    const long = "a".repeat(STATUS_TITLE_MAX + 10);
    expect(truncateTitle(long, STATUS_TITLE_MAX).length).toBeLessThanOrEqual(STATUS_TITLE_MAX);
    expect(escapeDisplayText("  hola\u0007  ")).toBe("hola");
    expect(stripIssueTitlePrefix("[iteración] chispa: Más chispas")).toBe("Más chispas");
  });

  it("extrae slug de iteraciones", () => {
    const slug = extractSlug("[iteración] chispa: T", "Prototipo: `chispa`", ["propuesta", "iteracion", "chispa"]);
    expect(slug).toBe("chispa");
  });

  it("abre la aplicación de la preview y, si no hay slug, deja la raíz", () => {
    const root = "https://cursor-permite-divertirse-16.proto-lab-3k6.pages.dev";
    const paths = ["package.json", "protos/divertirse/index.html", "protos/divertirse/src/main.ts"];
    expect(resolveAppSlug(paths, null)).toBe("divertirse");
    expect(previewAppUrl(root, "divertirse")).toBe(`${root}/protos/divertirse/`);
    expect(resolveAppSlug(["protos/chispa/src/a.ts", "protos/divertirse/src/b.ts"], "chispa")).toBe("chispa");
    expect(resolveAppSlug(["protos/chispa/src/a.ts", "protos/divertirse/src/b.ts"], null)).toBeNull();
    expect(resolveAppSlug([], "chispa")).toBe("chispa");
    expect(previewAppUrl(root, null)).toBe(root);
  });

  it("cuenta un archivo añadido y no uno borrado", () => {
    expect(
      filenamesFromPullFilePage([
        { filename: "protos/divertirse/index.html", status: "added", patch: "diff --git" },
        { filename: "protos/chispa/index.html", status: "removed" },
        { filename: "pnpm-lock.yaml", status: "modified" },
      ]),
    ).toEqual(["protos/divertirse/index.html", "pnpm-lock.yaml"]);
    expect(resolveAppSlug(["protos/divertirse/index.html", "pnpm-lock.yaml"], null)).toBe("divertirse");
  });
});

describe("aprobado", () => {
  it("solo cuenta si la puso el dueño", () => {
    const ok = aprobadoByOwner([{ event: "labeled", label: { name: "aprobado" }, actor: { login: "daniel-saezv" } }]);
    const fake = aprobadoByOwner([{ event: "labeled", label: { name: "aprobado" }, actor: { login: "otro" } }]);
    expect(ok).toBe(true);
    expect(fake).toBe(false);
  });
});

describe("issue → PR", () => {
  const pulls = [
    {
      number: 9,
      updated_at: "2026-01-02T00:00:00Z",
      headSha: "sha9",
      mergeCommitSha: null,
      branch: "cursor/old",
      merged: false,
      state: "closed" as const,
      body: "Trabajo viejo Closes #4",
    },
    {
      number: 12,
      updated_at: "2026-02-02T00:00:00Z",
      headSha: "sha12",
      mergeCommitSha: null,
      branch: "cursor/new",
      merged: false,
      state: "open" as const,
      body: "Implementa el tablón. Closes #4",
    },
  ];

  it("elige el PR más reciente que cita la issue", () => {
    expect(issueMentionsPattern(4).test("Closes #4")).toBe(true);
    expect(prFromBodyMention(4, pulls)?.number).toBe(12);
  });

  it("prefiere la timeline cross-referenced", () => {
    const linked = pickLinkedPullRequest(
      4,
      [
        {
          event: "cross-referenced",
          source: { issue: { pull_request: { html_url: "https://github.com/daniel-saezv/proto-lab/pull/9" } } },
        },
      ],
      pulls,
    );
    expect(linked?.number).toBe(9);
  });
});

describe("caché KV", () => {
  it("separa producción, cada preview y local", () => {
    expect(statusCacheKey("main")).toBe("proposal-status:v6:production");
    expect(statusCacheKey("cursor/pizarra-preview-lista-0fcf")).toBe(
      "proposal-status:v6:preview:cursor-pizarra-preview-lista-0fcf",
    );
    expect(statusCacheKey(undefined)).toBe(STATUS_CACHE_KEY);
    expect(statusCacheKey("main")).not.toBe(statusCacheKey("cursor/permite-divertirse-1617"));
    expect(boardDegradedByErrors([{ path: ["repository", "pullRequests", "nodes", 0, "files"], message: "forbidden" }])).toBe(
      false,
    );
    expect(boardDegradedByErrors([{ path: ["repository", "pullRequests"], message: "otra cosa" }])).toBe(true);
  });

  it("lee y escribe con clave y TTL propios", async () => {
    const kv = memoryKv();
    await writeStatusCache(kv, { fetchedAt: "now", partial: false, items: [] });
    expect(kv.store.has(STATUS_CACHE_KEY)).toBe(true);
    const cached = await readStatusCache(kv);
    expect(cached?.items).toEqual([]);
  });

  it("devuelve la caché fresca en buildProposalStatus", async () => {
    const kv = memoryKv();
    await writeStatusCache(kv, {
      fetchedAt: new Date().toISOString(),
      partial: false,
      items: [{ number: 1, title: "X", kind: "propuesta", slug: null, phase: "recibida", updatedAt: "2026-01-01T00:00:00Z" }],
    });
    const fetchImpl = vi.fn();
    const result = await buildProposalStatus({ GITHUB_STATUS_TOKEN: TOKEN, PROPOSALS: kv }, { fetchImpl });
    expect(result.items).toHaveLength(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(cacheFreshness({ fetchedAt: new Date(Date.now() - 10_000).toISOString(), partial: false, items: [] }, Date.now())).toBe("fresh");
    expect(cacheFreshness({ fetchedAt: new Date(Date.now() - (STATUS_CACHE_TTL_SECONDS + 30) * 1000).toISOString(), partial: false, items: [] }, Date.now())).toBe("stale");
  });
});

describe("CI y preview", () => {
  it("traduce workflow runs a estados", () => {
    expect(ciSnapshotFromRun({ status: "in_progress", conclusion: null, head_sha: "a" }).state).toBe("running");
    expect(ciSnapshotFromRun({ status: "completed", conclusion: "success", head_sha: "a" }).state).toBe("success");
    expect(ciSnapshotFromRun({ status: "completed", conclusion: "failure", head_sha: "a" }).state).toBe("failure");
  });

  it("elige despliegue preview por rama y commit", () => {
    const dep = pickPreviewDeployment(
      [
        {
          id: "1",
          url: "https://abc.proto-lab-3k6.pages.dev",
          deployment_trigger_metadata: { branch: "cursor/x", commit_hash: "deadbeef" },
          latest_stage: { status: "success" },
          aliases: ["abc.proto-lab-3k6.pages.dev"],
        },
      ],
      "cursor/x",
      "deadbeef",
    );
    expect(publicPreviewUrl(dep)).toBe("https://abc.proto-lab-3k6.pages.dev");
  });

  it("empareja la preview de Pages por deployment_trigger.metadata y el alias cortado", () => {
    const branch = "cursor/permite-divertirse-1617";
    const sha = "f10ee90143541f2b3ed596897292303eeb886442";
    const preview = {
      id: "54a01ddd",
      url: "https://54a01ddd.proto-lab-3k6.pages.dev",
      deployment_trigger: { metadata: { branch, commit_hash: sha } },
      latest_stage: { name: "deploy", status: "success" },
      aliases: [
        "https://54a01ddd.proto-lab-3k6.pages.dev",
        "https://cursor-permite-divertirse-16.proto-lab-3k6.pages.dev",
      ],
      created_on: "2026-11-01T16:00:59Z",
    };
    const picked = pickPreviewDeployment(
      [
        {
          id: "viejo",
          url: "https://aaaaaaaa.proto-lab-3k6.pages.dev",
          deployment_trigger: { metadata: { branch, commit_hash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" } },
          latest_stage: { status: "success" },
          aliases: ["https://cursor-permite-divertirse-16.proto-lab-3k6.pages.dev"],
          created_on: "2026-10-01T00:00:00Z",
        },
        preview,
      ],
      branch,
      sha,
    );
    expect(picked?.id).toBe("54a01ddd");
    expect(publicPreviewUrl(picked, branch)).toBe("https://cursor-permite-divertirse-16.proto-lab-3k6.pages.dev");

    const bySlug = pickPreviewDeployment(
      [
        {
          id: "slug",
          url: "https://54a01ddd.proto-lab-3k6.pages.dev",
          deployment_trigger: { metadata: { branch: "cursor-permite-divertirse-16", commit_hash: sha } },
          latest_stage: { status: "success" },
          aliases: ["https://54a01ddd.proto-lab-3k6.pages.dev"],
        },
      ],
      branch,
      sha,
    );
    expect(bySlug?.id).toBe("slug");
    expect(publicPreviewUrl(bySlug, branch)).toBe("https://54a01ddd.proto-lab-3k6.pages.dev");
  });

  it("reconoce el despliegue de producción por la metadata anidada", () => {
    const sha = "abc123abc123abc123abc123abc123abc123abcd";
    const dep = pickProductionDeployment(
      [
        {
          id: "prod",
          url: "https://proto-lab-3k6.pages.dev",
          deployment_trigger: { metadata: { branch: "main", commit_hash: sha } },
          latest_stage: { status: "success" },
        },
      ],
      sha,
    );
    expect(dep?.id).toBe("prod");
  });
});

describe("visibilidad del tablón", () => {
  const nowMs = Date.parse("2026-03-02T12:00:00.000Z");

  it("deja pasar issues abiertas", () => {
    expect(isIssueVisibleOnBoard({ state: "open", state_reason: null, closed_at: null }, nowMs)).toBe(true);
  });

  it("oculta cerradas sin completar", () => {
    expect(
      isIssueVisibleOnBoard({ state: "closed", state_reason: "not_planned", closed_at: "2026-03-02T10:00:00Z" }, nowMs),
    ).toBe(false);
  });

  it("mantiene completadas recientes y descarta las antiguas", () => {
    const fresh = { state: "closed" as const, state_reason: "completed", closed_at: "2026-03-02T11:00:00.000Z" };
    expect(isIssueVisibleOnBoard(fresh, nowMs)).toBe(true);
    const stale = {
      state: "closed" as const,
      state_reason: "completed",
      closed_at: new Date(nowMs - BOARD_VISIBLE_MS - 1).toISOString(),
    };
    expect(isIssueVisibleOnBoard(stale, nowMs)).toBe(false);
  });
});

describe("buildProposalStatus con mocks", () => {
  it("lee el tablón con una sola llamada GraphQL", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.github.com/graphql");
      expect(init?.method).toBe("POST");
      const body = JSON.parse(String(init?.body)) as { query: string; variables: { since: string } };
      expect(body.query).toContain("query ProposalBoard");
      expect(body.query).not.toContain("/timeline");
      const pull = {
        number: 12,
        body: "Closes #4",
        state: "OPEN",
        url: "https://github.com/daniel-saezv/proto-lab/pull/12",
        updatedAt: "2026-03-02T00:00:00Z",
        mergedAt: null,
        headRefName: "cursor/x",
        headRefOid: "abc123",
        mergeCommit: null,
        commits: {
          nodes: [
            {
              commit: {
                oid: "abc123",
                checkSuites: {
                  nodes: [
                    {
                      status: "COMPLETED",
                      conclusion: "SUCCESS",
                      workflowRun: { workflow: { name: "CI", resourcePath: "/daniel-saezv/proto-lab/actions/workflows/ci.yml" } },
                    },
                  ],
                },
              },
            },
          ],
        },
      };
      return boardResponse(
        [
          gqlIssue({
            number: 4,
            title: "[propuesta] Cometa",
            updatedAt: "2026-03-01T00:00:00Z",
            labels: ["propuesta", "aprobado"],
            timeline: [
              { __typename: "LabeledEvent", createdAt: "2026-03-01T01:00:00Z", actor: { login: "daniel-saezv" }, label: { name: "aprobado" } },
              { __typename: "CrossReferencedEvent", createdAt: "2026-03-01T02:00:00Z", source: { __typename: "PullRequest", ...pull } },
            ],
          }),
        ],
        [],
        [pull],
      );
    });
    const result = await buildProposalStatus({ GITHUB_STATUS_TOKEN: TOKEN }, { fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.partial).toBe(false);
    expect(result.items[0]?.phase).toBe("ci_correcta");
    expect(result.items[0]?.number).toBe(4);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  it("no guarda un fallo de GitHub y reintenta en la siguiente petición", async () => {
    const kv = memoryKv();
    const fetchImpl = vi.fn(async () => new Response("no", { status: 502 }));
    const now = new Date("2026-03-02T12:00:00.000Z");
    const failed = await buildProposalStatus({ GITHUB_STATUS_TOKEN: TOKEN, PROPOSALS: kv }, { fetchImpl, now });
    expect(failed).toEqual({ ok: true, partial: true, items: [] });
    expect(kv.store.size).toBe(0);
    await buildProposalStatus({ GITHUB_STATUS_TOKEN: TOKEN, PROPOSALS: kv }, { fetchImpl, now });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("si GitHub falla conserva el último tablón bueno sin reescribirlo", async () => {
    const kv = memoryKv();
    const fetchedAt = new Date(Date.now() - (STATUS_CACHE_TTL_SECONDS + 30) * 1000).toISOString();
    await writeStatusCache(kv, {
      fetchedAt,
      partial: false,
      items: [{ number: 1, title: "X", kind: "propuesta", slug: null, phase: "recibida", updatedAt: "2026-01-01T00:00:00Z" }],
    });
    const stored = kv.store.get(STATUS_CACHE_KEY);
    const fetchImpl = vi.fn(async () => new Response("no", { status: 502 }));
    const result = await buildProposalStatus({ GITHUB_STATUS_TOKEN: TOKEN, PROPOSALS: kv }, { fetchImpl });
    expect(result.partial).toBe(true);
    expect(result.items).toHaveLength(1);
    expect(kv.store.get(STATUS_CACHE_KEY)).toBe(stored);
  });

  it("no muestra issues cerradas fuera del tablón y pide el since en la consulta", async () => {
    const now = new Date("2026-03-02T12:00:00.000Z");
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      expect(String(input)).toBe("https://api.github.com/graphql");
      const body = JSON.parse(String(init?.body)) as { variables: { since: string } };
      expect(body.variables.since).toBe(boardClosedSinceIso(now));
      return boardResponse(
        [gqlIssue({ number: 10, title: "[propuesta] Activa", updatedAt: "2026-03-02T00:00:00Z" })],
        [
          gqlIssue({
            number: 11,
            title: "[propuesta] Descartada",
            updatedAt: "2026-03-01T00:00:00Z",
            state: "CLOSED",
            stateReason: "NOT_PLANNED",
            closedAt: "2026-03-01T00:00:00Z",
          }),
          gqlIssue({
            number: 12,
            title: "[propuesta] Publicada hace tiempo",
            updatedAt: "2026-02-01T00:00:00Z",
            state: "CLOSED",
            stateReason: "COMPLETED",
            closedAt: "2026-02-01T00:00:00Z",
          }),
        ],
      );
    });
    const kv = memoryKv();
    const result = await buildProposalStatus({ GITHUB_STATUS_TOKEN: TOKEN, PROPOSALS: kv }, { fetchImpl, now });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(result.items.map((item) => item.number)).toEqual([10]);
    expect(result.partial).toBe(false);
    expect(kv.store.has(STATUS_CACHE_KEY)).toBe(true);
  });

  it("con el check suite de Actions en el head pasa a ci_correcta aunque falte workflowRun", async () => {
    const sha = "f10ee90143541f2b3ed596897292303eeb886442";
    const pull = openPull({
      sha,
      suites: [
        { status: "QUEUED", conclusion: null, app: { slug: "cursor" }, workflowRun: null },
        { status: "COMPLETED", conclusion: "SUCCESS", app: { slug: "cloudflare-workers-and-pages" }, workflowRun: null },
        { status: "COMPLETED", conclusion: "SUCCESS", app: { slug: "github-actions" }, workflowRun: null },
      ],
    });
    const fetchImpl = vi.fn(async () => boardResponse([issue60(pull)], [], [pull]));
    const result = await buildProposalStatus({ GITHUB_STATUS_TOKEN: TOKEN }, { fetchImpl });
    expect(result.items[0]?.phase).toBe("ci_correcta");
    expect(result.items[0]?.previewUrl).toBeUndefined();
  });

  it("un check suite de Cloudflare en verde no cuenta como la CI", async () => {
    const pull = openPull({
      sha: "f10ee90143541f2b3ed596897292303eeb886442",
      suites: [{ status: "COMPLETED", conclusion: "SUCCESS", app: { slug: "cloudflare-workers-and-pages" }, workflowRun: null }],
    });
    const fetchImpl = vi.fn(async () => boardResponse([issue60(pull)], [], [pull]));
    const result = await buildProposalStatus({ GITHUB_STATUS_TOKEN: TOKEN }, { fetchImpl });
    expect(result.items[0]?.phase).toBe("pr_abierto");
  });

  it("con CI verde y la preview desplegada llega a preview_lista", async () => {
    const branch = "cursor/permite-divertirse-1617";
    const sha = "f10ee90143541f2b3ed596897292303eeb886442";
    const pull = openPull({
      sha,
      branch,
      files: ["pnpm-lock.yaml", "protos/divertirse/index.html", "protos/divertirse/src/main.ts"],
      suites: [
        {
          status: "COMPLETED",
          conclusion: "SUCCESS",
          app: { slug: "github-actions" },
          workflowRun: { workflow: { name: "CI", resourcePath: "/daniel-saezv/proto-lab/actions/workflows/ci.yml" } },
        },
      ],
    });
    const deployment = {
      id: "54a01ddd",
      url: "https://54a01ddd.proto-lab-3k6.pages.dev",
      environment: "preview",
      created_on: "2026-11-01T16:00:59Z",
      latest_stage: { name: "deploy", status: "success" },
      aliases: ["https://cursor-permite-divertirse-16.proto-lab-3k6.pages.dev"],
      deployment_trigger: { metadata: { branch, commit_hash: sha } },
    };
    const cfToken = "cf_pages_read_test";
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.github.com/graphql") return boardResponse([issue60(pull)], [], [pull]);
      if (url.includes("env=preview") && url.includes("page=1")) {
        return jsonResponse({
          result: [
            {
              id: "otra",
              url: "https://bbbbbbbb.proto-lab-3k6.pages.dev",
              deployment_trigger: { metadata: { branch: "cursor/otra", commit_hash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } },
              latest_stage: { status: "success" },
            },
          ],
          result_info: { total_pages: 2 },
        });
      }
      if (url.includes("env=preview") && url.includes("page=2")) {
        return jsonResponse({ result: [deployment], result_info: { total_pages: 2 } });
      }
      if (url.includes("env=production")) return jsonResponse({ result: [], result_info: { total_pages: 1 } });
      return new Response("no", { status: 500 });
    });
    const result = await buildProposalStatus(
      { GITHUB_STATUS_TOKEN: TOKEN, CF_PAGES_READ_TOKEN: cfToken, CF_ACCOUNT_ID: "acc", CF_PAGES_PROJECT: "proto-lab" },
      { fetchImpl },
    );
    expect(result.partial).toBe(false);
    expect(result.items[0]?.phase).toBe("preview_lista");
    expect(result.items[0]?.slug).toBe("divertirse");
    expect(result.items[0]?.previewUrl).toBe("https://cursor-permite-divertirse-16.proto-lab-3k6.pages.dev/protos/divertirse/");
    expect(JSON.stringify(result)).not.toContain(cfToken);
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("con files de GraphQL prohibido lista la PR por REST y abre /protos/divertirse/", async () => {
    const branch = "cursor/permite-divertirse-1617";
    const sha = "f10ee90143541f2b3ed596897292303eeb886442";
    const pull = openPull({
      sha,
      branch,
      files: null,
      suites: [
        {
          status: "COMPLETED",
          conclusion: "SUCCESS",
          app: { slug: "github-actions" },
          workflowRun: { workflow: { name: "CI", resourcePath: "/daniel-saezv/proto-lab/actions/workflows/ci.yml" } },
        },
      ],
    });
    const deployment = {
      id: "54a01ddd",
      url: "https://54a01ddd.proto-lab-3k6.pages.dev",
      environment: "preview",
      created_on: "2026-11-01T16:00:59Z",
      latest_stage: { name: "deploy", status: "success" },
      aliases: ["https://cursor-permite-divertirse-16.proto-lab-3k6.pages.dev"],
      deployment_trigger: { metadata: { branch, commit_hash: sha } },
    };
    const previewBranch = "cursor/pizarra-preview-lista-0fcf";
    const kv = memoryKv();
    const rootUrl = "https://cursor-permite-divertirse-16.proto-lab-3k6.pages.dev/";
    await writeStatusCache(
      kv,
      {
        fetchedAt: new Date().toISOString(),
        partial: false,
        items: [
          {
            number: 60,
            title: "Permite divertirse",
            kind: "propuesta",
            slug: null,
            phase: "preview_lista",
            updatedAt: "2026-11-01T16:02:00Z",
            previewUrl: rootUrl,
          },
        ],
      },
      "main",
    );
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "https://api.github.com/graphql") {
        return boardResponse([issue60(pull)], [], [pull], [
          {
            type: "FORBIDDEN",
            path: ["repository", "pullRequests", "nodes", 0, "files"],
            message: "Resource not accessible by personal access token",
          },
        ]);
      }
      if (url.startsWith("https://api.github.com/repos/daniel-saezv/proto-lab/pulls/61/files?")) {
        expect(init?.headers).toMatchObject({ authorization: `Bearer ${TOKEN}` });
        expect(url).toContain("per_page=100");
        const page = new URL(url).searchParams.get("page");
        if (page === "1") {
          return new Response(
            JSON.stringify([
              { filename: "pnpm-lock.yaml", status: "modified" },
              { filename: "protos/chispa/index.html", status: "removed" },
            ]),
            {
              status: 200,
              headers: {
                "content-type": "application/json",
                link: `<https://api.github.com/repos/daniel-saezv/proto-lab/pulls/61/files?per_page=100&page=2>; rel="next"`,
              },
            },
          );
        }
        return new Response(
          JSON.stringify([{ filename: "protos/divertirse/index.html", status: "added", patch: "diff --git a/protos/divertirse/index.html" }]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("env=preview") && url.includes("page=1")) {
        return jsonResponse({ result: [deployment], result_info: { total_pages: 1 } });
      }
      if (url.includes("env=production")) return jsonResponse({ result: [], result_info: { total_pages: 1 } });
      return new Response("no", { status: 500 });
    });
    const result = await buildProposalStatus(
      {
        GITHUB_STATUS_TOKEN: TOKEN,
        CF_PAGES_READ_TOKEN: "cf_pages_read_test",
        CF_ACCOUNT_ID: "acc",
        CF_PAGES_PROJECT: "proto-lab",
        CF_PAGES_BRANCH: previewBranch,
        PROPOSALS: kv,
      },
      { fetchImpl },
    );
    const appUrl = "https://cursor-permite-divertirse-16.proto-lab-3k6.pages.dev/protos/divertirse/";
    expect(result.partial).toBe(false);
    expect(result.items[0]?.slug).toBe("divertirse");
    expect(result.items[0]?.phase).toBe("preview_lista");
    expect(result.items[0]?.previewUrl).toBe(appUrl);
    expect(JSON.stringify(result)).not.toContain("diff --git");
    expect(kv.store.has(statusCacheKey(previewBranch))).toBe(true);
    expect(JSON.parse(kv.store.get(statusCacheKey(previewBranch)) ?? "{}").items[0].previewUrl).toBe(appUrl);
    const production = await readStatusCache(kv, "main");
    expect(production?.items[0]).toMatchObject({ previewUrl: rootUrl, slug: null });
    expect(kv.store.has("proposal-status:v5:all")).toBe(false);
  });

  it("si el listado REST de archivos falla deja la raíz y no la cachea", async () => {
    const branch = "cursor/permite-divertirse-1617";
    const sha = "f10ee90143541f2b3ed596897292303eeb886442";
    const pull = openPull({
      sha,
      branch,
      files: null,
      suites: [{ status: "COMPLETED", conclusion: "SUCCESS", app: { slug: "github-actions" }, workflowRun: null }],
    });
    const kv = memoryKv();
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "https://api.github.com/graphql") return boardResponse([issue60(pull)], [], [pull]);
      if (url.includes("/pulls/61/files")) return new Response("forbidden", { status: 403 });
      if (url.includes("env=preview")) {
        return jsonResponse({
          result: [
            {
              id: "54a01ddd",
              url: "https://54a01ddd.proto-lab-3k6.pages.dev",
              latest_stage: { status: "success" },
              aliases: ["https://cursor-permite-divertirse-16.proto-lab-3k6.pages.dev"],
              deployment_trigger: { metadata: { branch, commit_hash: sha } },
            },
          ],
          result_info: { total_pages: 1 },
        });
      }
      if (url.includes("env=production")) return jsonResponse({ result: [], result_info: { total_pages: 1 } });
      return new Response("no", { status: 500 });
    });
    const result = await buildProposalStatus(
      { GITHUB_STATUS_TOKEN: TOKEN, CF_PAGES_READ_TOKEN: "cf", CF_ACCOUNT_ID: "acc", PROPOSALS: kv },
      { fetchImpl },
    );
    expect(result.partial).toBe(true);
    expect(result.items[0]?.previewUrl).toBe("https://cursor-permite-divertirse-16.proto-lab-3k6.pages.dev");
    expect(result.items[0]?.slug).toBeNull();
    expect(kv.store.size).toBe(0);
  });

  it("marca partial si GraphQL devuelve errores y no lo cachea", async () => {
    const kv = memoryKv();
    const fetchImpl = vi.fn(async () => boardResponse([gqlIssue({ number: 3, title: "[propuesta] Cometa", updatedAt: "2026-03-01T00:00:00Z" })], [], [], [{ message: "checkSuites" }]));
    const result = await buildProposalStatus({ GITHUB_STATUS_TOKEN: TOKEN, PROPOSALS: kv }, { fetchImpl });
    expect(result.partial).toBe(true);
    expect(result.items[0]?.phase).toBe("recibida");
    expect(kv.store.size).toBe(0);
  });
});
