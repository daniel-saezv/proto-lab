import { afterEach, describe, expect, it, vi } from "vitest";
import { readAccessEmail } from "./access";
import { handleProposalStatus } from "./status-handler";
import { aprobadoByOwner } from "./status/aprobado";
import { readStatusCache, writeStatusCache, STATUS_CACHE_KEY, STATUS_CACHE_TTL_SECONDS, type KvLike } from "./status/cache";
import { pickPhase, STATUS_TITLE_MAX } from "./status/constants";
import { escapeDisplayText, extractSlug, issueMentionsPattern, stripIssueTitlePrefix, truncateTitle } from "./status/format";
import { prFromBodyMention, pickLinkedPullRequest } from "./status/issue-pr";
import { resolvePhase } from "./status/phases";
import { buildProposalStatus } from "./status/aggregate";
import { BOARD_VISIBLE_MS, isIssueVisibleOnBoard } from "./status/board-visibility";
import { ciSnapshotFromRun, pickPreviewDeployment, publicPreviewUrl, resetCiWorkflowCacheForTests } from "./status/github";

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
      expect(options?.expirationTtl).toBe(STATUS_CACHE_TTL_SECONDS);
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  resetCiWorkflowCacheForTests();
});

describe("acceso", () => {
  it("exige Cf-Access-Authenticated-User-Email", async () => {
    const response = await handleProposalStatus(new Request("https://example/api/proposals/status"), {});
    expect(response.status).toBe(401);
  });

  it("acepta X-Dev-User-Email solo con ALLOW_DEV_AUTH", async () => {
    const ok = await handleProposalStatus(
      new Request("https://example/api/proposals/status", { headers: { "X-Dev-User-Email": EMAIL } }),
      { ALLOW_DEV_AUTH: "true", GITHUB_STATUS_TOKEN: TOKEN },
      { fetchImpl: vi.fn() },
    );
    expect(ok.status).not.toBe(401);
    expect(readAccessEmail(new Request("https://x", { headers: { "X-Dev-User-Email": EMAIL } }), { ALLOW_DEV_AUTH: "true" })).toBe(EMAIL);
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

  it("devuelve la caché en buildProposalStatus", async () => {
    const kv = memoryKv();
    await writeStatusCache(kv, {
      fetchedAt: "now",
      partial: false,
      items: [{ number: 1, title: "X", kind: "propuesta", slug: null, phase: "recibida", updatedAt: "2026-01-01T00:00:00Z" }],
    });
    const fetchImpl = vi.fn();
    const result = await buildProposalStatus({ GITHUB_STATUS_TOKEN: TOKEN, PROPOSALS: kv }, { fetchImpl });
    expect(result.items).toHaveLength(1);
    expect(fetchImpl).not.toHaveBeenCalled();
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
  it("marca partial si GitHub falla parcialmente", async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/issues?")) {
        return new Response(
          JSON.stringify([
            {
              number: 3,
              title: "[propuesta] Cometa",
              body: "<!-- proto-lab: peticion-de-usuario -->\n",
              state: "open",
              labels: [{ name: "propuesta" }],
              updated_at: "2026-03-01T00:00:00Z",
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pulls")) return new Response(JSON.stringify([]), { status: 200 });
      if (url.includes("/timeline")) return new Response(JSON.stringify([]), { status: 200 });
      if (url.includes("/actions/workflows/ci.yml")) {
        return new Response(JSON.stringify({ id: 99 }), { status: 200 });
      }
      if (url.includes("/actions/workflows/99/runs")) {
        return new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 });
      }
      return new Response("fail", { status: 500 });
    });
    const result = await buildProposalStatus({ GITHUB_STATUS_TOKEN: TOKEN }, { fetchImpl });
    expect(result.items[0]?.phase).toBe("recibida");
    expect(result.partial).toBe(false);
  });

  it("no pide timeline de issues cerradas fuera del tablón", async () => {
    const now = new Date("2026-03-02T12:00:00.000Z");
    const timelineCalls: number[] = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/issues?") && url.includes("state=open")) {
        return new Response(
          JSON.stringify([
            {
              number: 10,
              title: "[propuesta] Activa",
              body: "<!-- proto-lab: peticion-de-usuario -->\n",
              state: "open",
              labels: [{ name: "propuesta" }],
              updated_at: "2026-03-02T00:00:00Z",
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/issues?") && url.includes("state=closed")) {
        expect(url).toContain("since=");
        return new Response(
          JSON.stringify([
            {
              number: 11,
              title: "[propuesta] Descartada",
              body: "<!-- proto-lab: peticion-de-usuario -->\n",
              state: "closed",
              state_reason: "not_planned",
              closed_at: "2026-03-01T00:00:00Z",
              labels: [{ name: "propuesta" }],
              updated_at: "2026-03-01T00:00:00Z",
            },
            {
              number: 12,
              title: "[propuesta] Publicada hace tiempo",
              body: "<!-- proto-lab: peticion-de-usuario -->\n",
              state: "closed",
              state_reason: "completed",
              closed_at: "2026-02-01T00:00:00Z",
              labels: [{ name: "propuesta" }],
              updated_at: "2026-02-01T00:00:00Z",
            },
          ]),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      if (url.includes("/pulls")) return new Response(JSON.stringify([]), { status: 200 });
      if (url.includes("/timeline")) {
        const match = url.match(/\/issues\/(\d+)\/timeline/);
        if (match) timelineCalls.push(Number(match[1]));
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (url.includes("/actions/workflows/ci.yml")) {
        return new Response(JSON.stringify({ id: 99 }), { status: 200 });
      }
      if (url.includes("/actions/workflows/99/runs")) {
        return new Response(JSON.stringify({ workflow_runs: [] }), { status: 200 });
      }
      return new Response("fail", { status: 500 });
    });
    const result = await buildProposalStatus({ GITHUB_STATUS_TOKEN: TOKEN }, { fetchImpl, now });
    expect(result.items.map((i) => i.number)).toEqual([10]);
    expect(timelineCalls).toEqual([10]);
  });
});
