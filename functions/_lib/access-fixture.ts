import type { AccessJwk } from "./access";

/** Firma JWTs de prueba. Solo lo importan los tests. */

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export type AccessFixture = {
  aud: string;
  kid: string;
  publicJwk: AccessJwk;
  sign: (payload: Record<string, unknown>, header?: Record<string, unknown>) => Promise<string>;
};

export async function createAccessFixture(): Promise<AccessFixture> {
  const pair = (await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign"],
  )) as CryptoKeyPair;
  const exported = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const kid = "test-key";
  const publicJwk: AccessJwk = { ...exported, kid, alg: "RS256", use: "sig", kty: "RSA" };
  const aud = "test-aud";

  return {
    aud,
    kid,
    publicJwk,
    async sign(payload, header = {}) {
      const headerJson = { alg: "RS256", typ: "JWT", kid, ...header };
      const headerPart = bytesToB64Url(new TextEncoder().encode(JSON.stringify(headerJson)));
      const payloadPart = bytesToB64Url(new TextEncoder().encode(JSON.stringify(payload)));
      const data = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
      const signature = new Uint8Array(await crypto.subtle.sign({ name: "RSASSA-PKCS1-v1_5" }, pair.privateKey, data));
      return `${headerPart}.${payloadPart}.${bytesToB64Url(signature)}`;
    },
  };
}

export function accessClaims(email: string, aud: string, nowSeconds = Math.floor(Date.now() / 1000)): Record<string, unknown> {
  return {
    aud,
    email,
    exp: nowSeconds + 3600,
    iat: nowSeconds,
    nbf: nowSeconds,
    iss: "https://ancient-waterfall-b3eb.cloudflareaccess.com",
    type: "app",
    sub: "test",
  };
}
