import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ACCESS_CERTS_URL,
  ACCESS_ISSUER,
  accessAudiences,
  installAccessKeysForTests,
  readAccessEmail,
  resetAccessCertsForTests,
} from "./access";
import { accessClaims, createAccessFixture } from "./access-fixture";
import { handleProposalStatus } from "./status-handler";

const EMAIL = "amigo@example.com";

afterEach(() => {
  resetAccessCertsForTests();
});

describe("JWT de Cloudflare Access", () => {
  it("acepta un token firmado con la clave del equipo y la audiencia configurada", async () => {
    const fixture = await createAccessFixture();
    installAccessKeysForTests([fixture.publicJwk]);
    const token = await fixture.sign(accessClaims(EMAIL, fixture.aud));
    const email = await readAccessEmail(
      new Request("https://proto-lab-3k6.pages.dev/api/proposals/status", { headers: { "Cf-Access-Jwt-Assertion": token } }),
      { CF_ACCESS_AUD: fixture.aud },
    );
    expect(email).toBe(EMAIL);
  });

  it("rechaza firma, audiencia, emisor, caducidad y alg none", async () => {
    const fixture = await createAccessFixture();
    const other = await createAccessFixture();
    installAccessKeysForTests([fixture.publicJwk]);
    const requestFor = (token: string) =>
      new Request("https://proto-lab-3k6.pages.dev/api/proposals/status", { headers: { "Cf-Access-Jwt-Assertion": token } });
    const env = { CF_ACCESS_AUD: fixture.aud };
    const now = Math.floor(Date.now() / 1000);

    expect(await readAccessEmail(requestFor(await other.sign(accessClaims(EMAIL, fixture.aud))), env)).toBeNull();
    expect(await readAccessEmail(requestFor(await fixture.sign(accessClaims(EMAIL, "otra-aud"))), env)).toBeNull();
    expect(await readAccessEmail(requestFor(await fixture.sign({ ...accessClaims(EMAIL, fixture.aud), iss: "https://evil.example" })), env)).toBeNull();
    expect(await readAccessEmail(requestFor(await fixture.sign({ ...accessClaims(EMAIL, fixture.aud), exp: now - 120 })), env)).toBeNull();
    expect(await readAccessEmail(requestFor(await fixture.sign(accessClaims(EMAIL, fixture.aud), { alg: "none" })), env)).toBeNull();
    expect(await readAccessEmail(requestFor(await fixture.sign(accessClaims(EMAIL, fixture.aud))), {})).toBeNull();
    expect(accessAudiences(" aud-a, aud-b ")).toEqual(["aud-a", "aud-b"]);
    expect(ACCESS_ISSUER).toBe("https://ancient-waterfall-b3eb.cloudflareaccess.com");
  });

  it("pide los certificados del equipo y no se fía de un email suelto", async () => {
    const fixture = await createAccessFixture();
    const token = await fixture.sign(accessClaims(EMAIL, fixture.aud));
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(ACCESS_CERTS_URL);
      return new Response(JSON.stringify({ keys: [fixture.publicJwk] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const email = await readAccessEmail(
      new Request("https://proto-lab-3k6.pages.dev/api/proposals/status", {
        headers: { "Cf-Access-Jwt-Assertion": token, "Cf-Access-Authenticated-User-Email": "otro@example.com" },
      }),
      { CF_ACCESS_AUD: fixture.aud },
      fetchImpl,
    );
    expect(email).toBe(EMAIL);
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const response = await handleProposalStatus(
      new Request("https://proto-lab-3k6.pages.dev/api/proposals/status", { headers: { "Cf-Access-Jwt-Assertion": token } }),
      { CF_ACCESS_AUD: fixture.aud, GITHUB_STATUS_TOKEN: "ghs_status_test" },
      { fetchImpl: vi.fn(async () => new Response("no", { status: 502 })) },
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, partial: true, items: [] });
    expect(JSON.stringify(body)).not.toContain("ghs_status_test");
  });
});
