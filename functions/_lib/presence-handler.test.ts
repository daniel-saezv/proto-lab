import { describe, expect, it } from "vitest";
import { handlePresence, type PresenceNamespace } from "./presence-handler";

const EMAIL = "amistad@example.com";

function binding(): { env: { PRESENCE: PresenceNamespace; CF_PAGES_BRANCH?: string }; seen: { name: string; headers: Headers; url: string }[] } {
  const seen: { name: string; headers: Headers; url: string }[] = [];
  const PRESENCE: PresenceNamespace = {
    getByName(name) {
      return {
        fetch(request) {
          seen.push({ name, headers: request.headers, url: request.url });
          return Promise.resolve(new Response(null, { status: 204 }));
        },
      };
    },
  };
  return { env: { PRESENCE }, seen };
}

function upgrade(headers: Record<string, string> = {}): Request {
  return new Request("https://proto-lab-3k6.pages.dev/api/presence?room=lab:production", {
    headers: {
      Upgrade: "websocket",
      Connection: "Upgrade",
      "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==",
      "Sec-WebSocket-Version": "13",
      Cookie: `CF_Authorization=secreto; email=${EMAIL}`,
      "Cf-Access-Authenticated-User-Email": EMAIL,
      "Cf-Access-Jwt-Assertion": "eyJhbGciOiJub25lIn0.eyJlbWFpbCI6ImFAbCJ9.",
      ...headers,
    },
  });
}

describe("upgrade de presencia", () => {
  it("sin binding no abre sala", async () => {
    const response = await handlePresence(upgrade(), {});
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ ok: false, error: "config" });
  });

  it("sin upgrade responde 426", async () => {
    const { env } = binding();
    const response = await handlePresence(new Request("https://proto-lab-3k6.pages.dev/api/presence"), env);
    expect(response.status).toBe(426);
  });

  it("reenvía el upgrade de producción sin correo, cookie ni JWT", async () => {
    const { env, seen } = binding();
    const response = await handlePresence(upgrade(), env);
    expect(response.status).toBe(204);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.name).toBe("lab:production");
    expect(seen[0]?.url).toBe("https://proto-lab-3k6.pages.dev/presence");
    const headers = seen[0]?.headers;
    expect(headers?.get("upgrade")).toBe("websocket");
    expect(headers?.get("sec-websocket-key")).toBe("dGhlIHNhbXBsZSBub25jZQ==");
    expect(headers?.get("cookie")).toBeNull();
    expect(headers?.get("cf-access-authenticated-user-email")).toBeNull();
    expect(headers?.get("cf-access-jwt-assertion")).toBeNull();
    expect(JSON.stringify([...headers!.entries()])).not.toContain(EMAIL);
  });

  it("una preview usa otra sala", async () => {
    const { env, seen } = binding();
    env.CF_PAGES_BRANCH = "cursor/presencia-en-vivo-e988";
    await handlePresence(upgrade(), env);
    expect(seen[0]?.name).toBe("lab:preview:cursorpresencia-en-vivo-e988");
  });
});
