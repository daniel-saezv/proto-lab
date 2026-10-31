import { describe, expect, it } from "vitest";
import { collectSameOriginAssets, escapeInlineScript, rewritePrototypeHtml } from "./prototype-document";

const pageUrl = "https://proto-lab-3k6.pages.dev/protos/chispa/";
const scriptUrl = "https://proto-lab-3k6.pages.dev/protos/chispa/assets/index-abc.js";

const html = `<!doctype html>
<html><head>
<link rel="modulepreload" crossorigin href="/protos/chispa/assets/index-abc.js">
<script type="module" crossorigin src="/protos/chispa/assets/index-abc.js"></script>
<link href="/protos/chispa/assets/game.css" rel="stylesheet">
</head><body>
<p data-testid="game-title">Atrapa la chispa</p>
</body></html>`;

describe("documento de prototipo", () => {
  it("incrusta el JS como script clásico y no mete el HTML de otra web", () => {
    const assets = new Map<string, string>([
      [scriptUrl, "window.__game = true;</script><script>alert(1);var x='$&';"],
      ["https://proto-lab-3k6.pages.dev/protos/chispa/assets/game.css", "body{color:white}"],
    ]);
    expect(collectSameOriginAssets(html, pageUrl)).toEqual([
      scriptUrl,
      "https://proto-lab-3k6.pages.dev/protos/chispa/assets/game.css",
    ]);
    const result = rewritePrototypeHtml(html, assets, pageUrl);
    expect(result).not.toContain("modulepreload");
    expect(result).not.toContain('src="/protos/chispa/assets/index-abc.js"');
    expect(result).not.toContain('type="module"');
    expect(result).toContain(`<script>${escapeInlineScript("window.__game = true;</script><script>alert(1);var x='$&';")}</script>`);
    expect(result).not.toContain("</body>'");
    expect(result).toContain("<style>body{color:white}</style>");
    expect(result).toContain('type:"alive"');
    expect(result).toContain("Content-Security-Policy");
    expect(result).toContain("__protoLabAssets");
    expect(result).toContain("Atrapa la chispa");
    expect(() => rewritePrototypeHtml("<html><body>login de acceso</body></html>", new Map(), pageUrl)).toThrow(/not-prototype/);
  });
});
