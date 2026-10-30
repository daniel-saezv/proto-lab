const BOOT = `<script>
window.addEventListener("keydown",function(event){if(event.key==="Escape"){event.preventDefault();parent.postMessage({source:"proto-lab",type:"close"},"*");}});
window.addEventListener("message",function(event){
  if(event.source!==window.parent)return;
  var data=event.data;
  if(!data||data.source!=="proto-lab"||data.type!=="boot"||!Array.isArray(data.scripts))return;
  var chain=Promise.resolve();
  data.scripts.forEach(function(script){
    chain=chain.then(function(){
      var url=URL.createObjectURL(new Blob([script.code],{type:"text/javascript"}));
      if(script.type==="module")return import(url);
      return new Promise(function(resolve,reject){
        var el=document.createElement("script");
        el.src=url;
        el.onload=function(){resolve();};
        el.onerror=function(){reject(new Error("script"));};
        document.head.appendChild(el);
      });
    });
  });
  chain.catch(function(error){parent.postMessage({source:"proto-lab",type:"error",message:String(error)},"*");});
});
parent.postMessage({source:"proto-lab",type:"ready"},"*");
</script>`;

export type PrototypeScript = { type: "module" | "classic"; code: string };

export type EmbeddedPrototype = { html: string; scripts: PrototypeScript[] };

const SCRIPT_TAG = /<script\b([^>]*?)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi;
const MODULE_PRELOAD = /<link\b[^>]*\brel\s*=\s*["']modulepreload["'][^>]*>\s*/gi;
const LINK_TAG = /<link\b([^>]*)>/gi;

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

export function rewritePrototypeHtml(html: string, assets: ReadonlyMap<string, string>, pageUrl: string): EmbeddedPrototype {
  const base = new URL(pageUrl);
  const scripts: PrototypeScript[] = [];
  let output = html.replace(MODULE_PRELOAD, "");
  output = output.replace(SCRIPT_TAG, (full, before: string, src: string, after: string) => {
    const url = new URL(src, base);
    if (!sameOrigin(url, base)) return full;
    const code = assets.get(url.href);
    if (code == null) throw new Error(`Falta el script ${url.pathname}`);
    const type = /type\s*=\s*["']module["']/i.test(`${before} ${after}`) ? "module" : "classic";
    scripts.push({ type, code });
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
  if (/<head\b/i.test(output)) output = output.replace(/<head\b([^>]*)>/i, `<head$1>${BOOT}`);
  else output = BOOT + output;
  return { html: output, scripts };
}

async function fetchText(url: string, fetchImpl: typeof fetch, expectHtml: boolean): Promise<string> {
  const response = await fetchImpl(url, { credentials: "include", redirect: "manual" });
  if (response.type === "opaqueredirect" || !response.ok) throw new Error("blocked");
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!expectHtml && contentType.includes("text/html")) throw new Error("blocked");
  return response.text();
}

export async function fetchPrototypeDocument(href: string, fetchImpl: typeof fetch = fetch): Promise<EmbeddedPrototype> {
  const pageUrl = new URL(href, location.origin).href;
  const html = await fetchText(pageUrl, fetchImpl, true);
  const assets = new Map<string, string>();
  for (const url of collectSameOriginAssets(html, pageUrl)) {
    assets.set(url, await fetchText(url, fetchImpl, false));
  }
  return rewritePrototypeHtml(html, assets, pageUrl);
}
