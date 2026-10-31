/**
 * CSP del documento blob del prototipo. Sin dominios externos en connect-src:
 * el puente de assets usa postMessage, no fetch al sitio.
 * script-src/style-src 'unsafe-inline' porque el cargador incrusta JS y CSS.
 * blob: y data: para medios servidos por el puente.
 */
export const PROTOTYPE_DOCUMENT_CSP =
  "default-src 'none'; " +
  "script-src 'unsafe-inline'; " +
  "style-src 'unsafe-inline'; " +
  "img-src blob: data:; " +
  "media-src blob: data:; " +
  "font-src blob: data:; " +
  "connect-src 'none'; " +
  "worker-src 'none'; " +
  "base-uri 'none'; " +
  "form-action 'none'; " +
  "frame-src 'none';";

export function cspMetaTag(): string {
  return `<meta http-equiv="Content-Security-Policy" content="${PROTOTYPE_DOCUMENT_CSP}">`;
}
