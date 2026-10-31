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
  type KvLike,
} from "./status/cache";
import { pickPhase, STATUS_TITLE_MAX } from "./status/constants";
import { escapeDisplayText, extractSlug, issueMentionsPattern, stripIssueTitlePrefix, truncateTitle } from "./status/format";
import { prFromBodyMention, pickLinkedPullRequest } from "./status/issue-pr";
import { resolvePhase } from "./status/phases";
import { buildProposalStatus } from "./status/aggregate";
import { boardClosedSinceIso, BOARD_VISIBLE_MS, isIssueVisibleOnBoard } from "./status/board-visibility";
import { ciSnapshotFromRun, pickPreviewDeployment, publicPreviewUrl } from "./status/github";

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

  it("marca partial si GraphQL devuelve errores y no lo cachea", async () => {
    const kv = memoryKv();
    const fetchImpl = vi.fn(async () => boardResponse([gqlIssue({ number: 3, title: "[propuesta] Cometa", updatedAt: "2026-03-01T00:00:00Z" })], [], [], [{ message: "checkSuites" }]));
    const result = await buildProposalStatus({ GITHUB_STATUS_TOKEN: TOKEN, PROPOSALS: kv }, { fetchImpl });
    expect(result.partial).toBe(true);
    expect(result.items[0]?.phase).toBe("recibida");
    expect(kv.store.size).toBe(0);
  });
});
