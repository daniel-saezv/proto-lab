import { isEmail } from "./validate";
import { readTextLimited } from "./read-limited";

/**
 * Equipo de Cloudflare Access de Proto Lab.
 * La audiencia (AUD) no va en el código: cada aplicación tiene la suya.
 */
export const ACCESS_TEAM_DOMAIN = "ancient-waterfall-b3eb.cloudflareaccess.com";
export const ACCESS_ISSUER = `https://${ACCESS_TEAM_DOMAIN}`;
export const ACCESS_CERTS_URL = `${ACCESS_ISSUER}/cdn-cgi/access/certs`;

const JWT_MAX_CHARS = 8_192;
const CERTS_MAX_BYTES = 256_000;
const CERTS_TTL_MS = 60 * 60 * 1000;
const CLOCK_SKEW_SECONDS = 60;

export type AccessEnv = {
  /** Solo loopback. No definir en Pages. */
  ALLOW_DEV_AUTH?: string;
  /**
   * Etiqueta AUD de la aplicación Access. Varias, separadas por comas,
   * si producción y las previews son aplicaciones distintas.
   */
  CF_ACCESS_AUD?: string;
};

export type AccessJwk = {
  kty?: string;
  alg?: string;
  use?: string;
  kid?: string;
  n?: string;
  e?: string;
};

type CertCache = {
  fetchedAt: number;
  byKid: Map<string, AccessJwk>;
};

let memoryCerts: CertCache | null = null;
const cryptoKeys = new Map<string, CryptoKey>();

export function resetAccessCertsForTests(): void {
  memoryCerts = null;
  cryptoKeys.clear();
}

/** Inyecta las claves públicas para tests. No llama a la red. */
export function installAccessKeysForTests(keys: readonly AccessJwk[]): void {
  cryptoKeys.clear();
  memoryCerts = { fetchedAt: Date.now(), byKid: indexKeys(keys) };
}

export function accessAudiences(raw: string | undefined): string[] {
  if (!raw) return [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const value = part.trim();
    if (value.length === 0 || value.length > 200) continue;
    seen.add(value);
  }
  return [...seen];
}

function isLoopback(request: Request): boolean {
  try {
    const host = new URL(request.url).hostname;
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch {
    return false;
  }
}

function workerCache(): Cache | null {
  try {
    const storage = (globalThis as { caches?: { default?: Cache } }).caches;
    return storage?.default ?? null;
  } catch {
    return null;
  }
}

function indexKeys(keys: readonly AccessJwk[]): Map<string, AccessJwk> {
  const byKid = new Map<string, AccessJwk>();
  for (const key of keys) {
    if (key.kty !== "RSA" || key.alg !== "RS256" || key.use !== "sig") continue;
    if (typeof key.kid !== "string" || typeof key.n !== "string" || typeof key.e !== "string") continue;
    byKid.set(key.kid, { kty: "RSA", alg: "RS256", use: "sig", n: key.n, e: key.e, kid: key.kid });
  }
  return byKid;
}

function parseCerts(body: string): Map<string, AccessJwk> {
  const parsed = JSON.parse(body) as { keys?: unknown };
  if (!parsed || !Array.isArray(parsed.keys)) throw new Error("certs");
  const byKid = indexKeys(parsed.keys as AccessJwk[]);
  if (byKid.size === 0) throw new Error("certs");
  return byKid;
}

async function readCertBody(fetchImpl: typeof fetch, force: boolean): Promise<string> {
  const request = new Request(ACCESS_CERTS_URL, { method: "GET" });
  const cache = workerCache();
  if (!force && cache) {
    try {
      const hit = await cache.match(request);
      if (hit?.ok) return await readTextLimited(hit, CERTS_MAX_BYTES);
    } catch {
      // La caché de colo es opcional.
    }
  }
  const response = await fetchImpl(ACCESS_CERTS_URL, {
    method: "GET",
    redirect: "manual",
    headers: { accept: "application/json" },
  });
  if (response.status !== 200) throw new Error("certs");
  const body = await readTextLimited(response, CERTS_MAX_BYTES);
  if (cache) {
    try {
      await cache.put(
        request,
        new Response(body, {
          status: 200,
          headers: { "content-type": "application/json", "cache-control": "public, max-age=3600" },
        }),
      );
    } catch {
      // Sin Cache API la memoria del isolate basta.
    }
  }
  return body;
}

async function loadKeys(fetchImpl: typeof fetch, force: boolean): Promise<Map<string, AccessJwk>> {
  if (!force && memoryCerts && Date.now() - memoryCerts.fetchedAt < CERTS_TTL_MS) {
    return memoryCerts.byKid;
  }
  try {
    const byKid = parseCerts(await readCertBody(fetchImpl, force));
    memoryCerts = { fetchedAt: Date.now(), byKid };
    cryptoKeys.clear();
    return byKid;
  } catch (error) {
    if (memoryCerts) return memoryCerts.byKid;
    throw error;
  }
}

function b64UrlToBytes(input: string): Uint8Array<ArrayBuffer> {
  const pad = input.length % 4 === 0 ? "" : "=".repeat(4 - (input.length % 4));
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const buffer = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function keyForKid(jwk: AccessJwk): Promise<CryptoKey> {
  const kid = jwk.kid ?? "";
  const cached = cryptoKeys.get(kid);
  if (cached) return cached;
  if (typeof jwk.n !== "string" || typeof jwk.e !== "string") throw new Error("certs");
  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256" },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  cryptoKeys.set(kid, key);
  return key;
}

function audMatches(aud: unknown, expected: readonly string[]): boolean {
  const values = Array.isArray(aud) ? aud : [aud];
  return values.some((item) => typeof item === "string" && expected.includes(item));
}

function emailFromClaims(payload: unknown, env: AccessEnv): string | null {
  if (!payload || typeof payload !== "object") return null;
  const claims = payload as Record<string, unknown>;
  const audiences = accessAudiences(env.CF_ACCESS_AUD);
  if (audiences.length === 0) return null;
  if (claims.iss !== ACCESS_ISSUER) return null;
  if (claims.type !== "app") return null;
  if (!audMatches(claims.aud, audiences)) return null;
  const now = Math.floor(Date.now() / 1000);
  if (typeof claims.exp !== "number" || !Number.isFinite(claims.exp) || claims.exp < now - CLOCK_SKEW_SECONDS) return null;
  if (typeof claims.nbf === "number" && claims.nbf > now + CLOCK_SKEW_SECONDS) return null;
  if (typeof claims.iat === "number" && claims.iat > now + CLOCK_SKEW_SECONDS) return null;
  if (typeof claims.email !== "string") return null;
  const email = claims.email.trim().toLowerCase();
  return isEmail(email) ? email : null;
}

async function emailFromAccessJwt(token: string, env: AccessEnv, fetchImpl: typeof fetch): Promise<string | null> {
  if (token.length > JWT_MAX_CHARS || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) return null;
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  if (!headerPart || !payloadPart || !signaturePart) return null;
  let header: { alg?: unknown; kid?: unknown; typ?: unknown };
  try {
    header = JSON.parse(new TextDecoder().decode(b64UrlToBytes(headerPart))) as { alg?: unknown; kid?: unknown; typ?: unknown };
  } catch {
    return null;
  }
  if (header.alg !== "RS256" || typeof header.kid !== "string" || header.kid.length === 0 || header.kid.length > 128) return null;
  if (header.typ !== undefined && header.typ !== "JWT") return null;

  let keys = await loadKeys(fetchImpl, false);
  if (!keys.has(header.kid)) keys = await loadKeys(fetchImpl, true);
  const jwk = keys.get(header.kid);
  if (!jwk) return null;

  const cryptoKey = await keyForKid(jwk);
  const data = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
  const signature = b64UrlToBytes(signaturePart);
  const verified = await crypto.subtle.verify({ name: "RSASSA-PKCS1-v1_5" }, cryptoKey, signature, data);
  if (!verified) return null;

  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(b64UrlToBytes(payloadPart)));
  } catch {
    return null;
  }
  return emailFromClaims(payload, env);
}

/**
 * Identidad de Cloudflare Access. No usa `Cf-Access-Authenticated-User-Email`:
 * esa cabecera se puede falsificar si la Function queda al descubierto.
 * El email sale del JWT `Cf-Access-Jwt-Assertion`, firmado con las claves del equipo.
 * `ALLOW_DEV_AUTH` solo vale en loopback y nunca sustituye a un JWT presente.
 */
export async function readAccessEmail(request: Request, env: AccessEnv, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  if (request.headers.has("Cf-Access-Jwt-Assertion")) {
    const token = request.headers.get("Cf-Access-Jwt-Assertion")?.trim() ?? "";
    if (!token) return null;
    try {
      return await emailFromAccessJwt(token, env, fetchImpl);
    } catch {
      return null;
    }
  }
  if (env.ALLOW_DEV_AUTH !== "true" || !isLoopback(request)) return null;
  const dev = request.headers.get("X-Dev-User-Email");
  if (!dev) return null;
  const email = dev.trim().toLowerCase();
  return isEmail(email) ? email : null;
}
