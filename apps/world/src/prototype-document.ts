/** Página de login de Access, no la aplicación. */
export function isAccessLogin(html: string): boolean {
  const sample = html.slice(0, 4000).toLowerCase();
  return sample.includes("cloudflareaccess.com") || sample.includes("cloudflare access");
}

/**
 * Comprueba que `/protos/<slug>/` responde con el HTML de la aplicación
 * antes de montar el iframe. No reescribe ni incrusta el JS.
 */
export async function assertPrototypePage(
  href: string,
  options: { fetchImpl?: typeof fetch; pageOrigin: string },
): Promise<void> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const pageUrl = new URL(href, options.pageOrigin);
  if (pageUrl.origin !== options.pageOrigin) throw new Error("blocked");
  if (!pageUrl.pathname.startsWith("/protos/")) throw new Error("blocked");
  const response = await fetchImpl(pageUrl.href, { credentials: "include", redirect: "follow" });
  if (!response.ok) throw new Error("blocked");
  let finalUrl: URL;
  try {
    finalUrl = new URL(response.url || pageUrl.href);
  } catch {
    throw new Error("blocked");
  }
  if (finalUrl.origin !== pageUrl.origin) throw new Error("blocked");
  if (!finalUrl.pathname.startsWith("/protos/")) throw new Error("blocked");
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (!contentType.includes("text/html")) throw new Error("blocked");
  const text = await response.text();
  if (isAccessLogin(text)) throw new Error("blocked");
}
