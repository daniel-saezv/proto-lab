import { describe, expect, it } from "vitest";
import { postWorkshop } from "./workshop-api";

describe("cliente del taller", () => {
  it("pide el turno sin cabecera de desarrollo y recorta la respuesta", async () => {
    let seen: { url: string; headers: Headers; body: string } | null = null;
    const result = await postWorkshop(
      { op: "start", draft: { kind: "propuesta", title: "Cometa", description: "Una app de cometas." } },
      async (input, init) => {
        seen = {
          url: String(input),
          headers: new Headers(init?.headers),
          body: String(init?.body ?? ""),
        };
        return new Response(
          JSON.stringify({
            ok: true,
            phase: "turn",
            sessionId: "a".repeat(32),
            speech: "¿Y si deja estela?",
            change: null,
            draft: { kind: "propuesta", title: "Cometa", description: "Una app de cometas.", email: "no" },
            original: { kind: "propuesta", title: "Cometa", description: "Una app de cometas." },
            turn: 1,
            maxTurns: 5,
            ready: false,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    );
    expect(seen?.url).toBe("/api/workshop");
    expect(seen?.headers.get("x-dev-user-email")).toBeNull();
    expect(seen?.headers.get("content-type")).toContain("application/json");
    expect(JSON.parse(seen?.body ?? "{}").op).toBe("start");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.draft).not.toHaveProperty("email");
  });

  it("traduce un corte de red a un fallo que se puede reintentar", async () => {
    const result = await postWorkshop(
      { op: "abandon", sessionId: "a".repeat(32) },
      async () => {
        throw new Error("red");
      },
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.restore).toBeUndefined();
  });
});
