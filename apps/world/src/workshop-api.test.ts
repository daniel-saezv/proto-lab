import { describe, expect, it } from "vitest";
import { postWorkshop } from "./workshop-api";

const options = [
  "¿Y si dejara un rastro de luz?",
  "¿Y si se pudiera guardar el camino?",
  "¿Y si avisara al llegar al borde?",
  "¿Y si el color cambiara con la altura?",
];

describe("cliente del taller", () => {
  it("pide la ronda sin cabecera de desarrollo y recorta la respuesta", async () => {
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
            phase: "pick",
            sessionId: "a".repeat(32),
            speech: "Ronda 1 de 3. Marca las ideas que quieres.",
            options,
            draft: { kind: "propuesta", title: "Cometa", description: "Una app de cometas.", email: "no" },
            original: { kind: "propuesta", title: "Cometa", description: "Una app de cometas." },
            round: 1,
            maxRounds: 3,
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
    if (result.ok) {
      expect(result.phase).toBe("pick");
      expect(result.options).toHaveLength(4);
      expect(result.draft).not.toHaveProperty("email");
    }
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
