import { describe, expect, it } from "vitest";
import { assertPrototypePage, isAccessLogin } from "./prototype-document";

const origin = "https://proto-lab-3k6.pages.dev";

function responseOf(body: string, url = `${origin}/protos/chispa/`, status = 200, contentType = "text/html; charset=utf-8") {
  return {
    ok: status >= 200 && status < 300,
    url,
    headers: { get: (name: string) => (name.toLowerCase() === "content-type" ? contentType : null) },
    text: async () => body,
  } as unknown as Response;
}

describe("comprobación de la página", () => {
  it("reconoce el HTML de Access", () => {
    expect(isAccessLogin("<p>Iniciar sesión en Cloudflare Access</p>")).toBe(true);
    expect(isAccessLogin("<a href='https://ancient-waterfall-b3eb.cloudflareaccess.com/'>x</a>")).toBe(true);
    expect(isAccessLogin("<p data-testid='game-title'>Pozo de bolas</p>")).toBe(false);
  });

  it("acepta el HTML del mismo origen y rechaza el login", async () => {
    const fetchImpl = async () => responseOf("<!doctype html><title>Pozo</title>");
    await expect(assertPrototypePage("/protos/chispa/", { fetchImpl, pageOrigin: origin })).resolves.toBeUndefined();

    const blocked = async () => responseOf("<!doctype html><p>Cloudflare Access</p>");
    await expect(assertPrototypePage("/protos/chispa/", { fetchImpl: blocked, pageOrigin: origin })).rejects.toThrow(/blocked/);
  });

  it("rechaza otro origen y lo que no es HTML", async () => {
    const away = async () =>
      responseOf("<!doctype html>", "https://ancient-waterfall-b3eb.cloudflareaccess.com/cdn-cgi/access/login");
    await expect(assertPrototypePage("/protos/chispa/", { fetchImpl: away, pageOrigin: origin })).rejects.toThrow(/blocked/);

    const script = async () => responseOf("export {}", `${origin}/protos/chispa/app.js`, 200, "text/javascript");
    await expect(assertPrototypePage("/protos/chispa/", { fetchImpl: script, pageOrigin: origin })).rejects.toThrow(/blocked/);

    await expect(assertPrototypePage("https://example.com/protos/chispa/", { fetchImpl: async () => responseOf(""), pageOrigin: origin })).rejects.toThrow(
      /blocked/,
    );
  });
});
