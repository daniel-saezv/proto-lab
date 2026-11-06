import { jsonResponse } from "./http";
import { presenceRoomName } from "./presence-room";

/** Cabeceras del upgrade. El resto (cookie, JWT, correo) no cruza al objeto. */
const FORWARD_HEADERS = [
  "upgrade",
  "connection",
  "sec-websocket-key",
  "sec-websocket-version",
  "sec-websocket-protocol",
  "sec-websocket-extensions",
] as const;

export type PresenceStub = {
  fetch(request: Request): Promise<Response>;
};

export type PresenceNamespace = {
  getByName(name: string): PresenceStub;
};

export type PresenceEnv = {
  PRESENCE?: PresenceNamespace;
  /** Rama de Pages. Vacía o `main` es la sala de producción. */
  CF_PAGES_BRANCH?: string;
};

export async function handlePresence(request: Request, env: PresenceEnv): Promise<Response> {
  if (!env.PRESENCE) return jsonResponse(503, { ok: false, error: "config" });
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
    return jsonResponse(426, { ok: false, error: "upgrade" });
  }
  const headers = new Headers();
  for (const name of FORWARD_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const url = new URL(request.url);
  url.pathname = "/presence";
  url.search = "";
  const stub = env.PRESENCE.getByName(presenceRoomName(env.CF_PAGES_BRANCH));
  return stub.fetch(new Request(url, { method: "GET", headers }));
}
