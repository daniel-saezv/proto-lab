import { describe, expect, it } from "vitest";
import { collectSameOriginAssets, rewritePrototypeHtml } from "./prototype-document";

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
  it("incrusta scripts y CSS del mismo origen y quita el modulepreload", () => {
    const assets = new Map<string, string>([
      [scriptUrl, "window.__game = true;</script><script>alert(1)"],
      ["https://proto-lab-3k6.pages.dev/protos/chispa/assets/game.css", "body{color:white}"],
    ]);
    const urls = collectSameOriginAssets(html, pageUrl);
    expect(urls).toEqual([scriptUrl, "https://proto-lab-3k6.pages.dev/protos/chispa/assets/game.css"]);
    const result = rewritePrototypeHtml(html, assets, pageUrl);
    expect(result.html).not.toContain("modulepreload");
    expect(result.html).not.toContain('src="/protos/chispa/assets/index-abc.js"');
    expect(result.html).not.toContain("window.__game");
    expect(result.html).toContain("<style>body{color:white}</style>");
    expect(result.html).toContain('parent.postMessage({source:"proto-lab",type:"close"}');
    expect(result.html).toContain("Atrapa la chispa");
    expect(result.scripts).toEqual([{ type: "module", code: "window.__game = true;</script><script>alert(1)" }]);
  });
});
