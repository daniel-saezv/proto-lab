import { IFRAME_ASSET_BRIDGE } from "./prototype-assets-host";
import { cspMetaTag } from "./prototype-csp";

const BRIDGE = `<script>
window.addEventListener("error",function(event){if(!event.message)return;parent.postMessage({source:"proto-lab",type:"error",message:String(event.message)},"*");});
window.addEventListener("keydown",function(event){if(event.key==="Escape"){event.preventDefault();parent.postMessage({source:"proto-lab",type:"close"},"*");}});
parent.postMessage({source:"proto-lab",type:"alive"},"*");
</script>${IFRAME_ASSET_BRIDGE}`;

const SCRIPT_TAG = /<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi;
const MODULE_PRELOAD = /<link\b[^>]*\brel\s*=\s*["']modulepreload["'][^>]*>\s*/gi;
const LINK_TAG = /<link\b([^>]*)>/gi;

export function escapeInlineScript(code: string): string {
  return code.replace(/<\/script/gi, "<\\/script");
}

function sameOrigin(url: URL, base: URL): boolean {
  return url.origin === base.origin;
}

export function collectSameOriginAssets(html: string, pageUrl: string): string[] {
  const base = new URL(pageUrl);
  const urls = new Set<string>();
  for (const match of html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>\s*<\/script>/gi)) {
    const src = match[1];
    if (!src) continue;
    const url = new URL(src, base);
    if (sameOrigin(url, base)) urls.add(url.href);
  }
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    if (!/\brel\s*=\s*["']stylesheet["']/i.test(tag)) continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (!href) continue;
    const url = new URL(href, base);
    if (sameOrigin(url, base)) urls.add(url.href);
  }
  return [...urls];
}

export function rewritePrototypeHtml(html: string, assets: ReadonlyMap<string, string>, pageUrl: string): string {
  const base = new URL(pageUrl);
  const blocks: string[] = [];
  let output = html.replace(MODULE_PRELOAD, "");
  output = output.replace(SCRIPT_TAG, (full, _before: string, src: string) => {
    const url = new URL(src, base);
    if (!sameOrigin(url, base)) return full;
    const code = assets.get(url.href);
    if (code == null) throw new Error(`Falta el script ${url.pathname}`);
    blocks.push(`<script>${escapeInlineScript(code)}</script>`);
    return "";
  });
  output = output.replace(LINK_TAG, (full, attrs: string) => {
    if (!/\brel\s*=\s*["']stylesheet["']/i.test(attrs)) return full;
    const href = /\bhref\s*=\s*["']([^"']+)["']/i.exec(attrs)?.[1];
    if (!href) return full;
    const url = new URL(href, base);
    if (!sameOrigin(url, base)) return full;
    const css = assets.get(url.href);
    if (css == null) throw new Error(`Falta el CSS ${url.pathname}`);
    return `<style>${css.replace(/<\/style/gi, "<\\/style")}</style>`;
  });
  if (blocks.length === 0) throw new Error("not-prototype");
  const scripts = blocks.join("");
  if (/<\/body>/i.test(output)) output = output.replace(/<\/body>/i, () => `${scripts}</body>`);
  else output += scripts;
  if (/<head\b/i.test(output)) {
    return output.replace(/<head\b([^>]*)>/i, `<head$1>${cspMetaTag()}${BRIDGE}`);
  }
  return cspMetaTag() + BRIDGE + output;
}

async function fetchText(url: string, fetchImpl: typeof fetch, pageOrigin: string, expectHtml: boolean): Promise<string> {
  const response = await fetchImpl(url, { credentials: "include", redirect: "follow" });
  if (!response.ok) throw new Error("blocked");
  let finalUrl: URL;
  try {
    finalUrl = new URL(response.url);
  } catch {
    throw new Error("blocked");
  }
  if (finalUrl.origin !== pageOrigin) throw new Error("blocked");
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!expectHtml && (contentType.includes("text/html") || contentType.includes("text/plain"))) throw new Error("blocked");
  const text = await response.text();
  if (/cloudflareaccess\.com/i.test(text.slice(0, 2000)) && !text.includes("data-testid=\"game-title\"")) {
    throw new Error("blocked");
  }
  return text;
}

export async function fetchPrototypeDocument(href: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const pageUrl = new URL(href, location.origin);
  const html = await fetchText(pageUrl.href, fetchImpl, pageUrl.origin, true);
  const assets = new Map<string, string>();
  for (const url of collectSameOriginAssets(html, pageUrl.href)) {
    assets.set(url, await fetchText(url, fetchImpl, pageUrl.origin, false));
  }
  return rewritePrototypeHtml(html, assets, pageUrl.href);
}
