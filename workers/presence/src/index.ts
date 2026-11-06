import {
  acceptConnection,
  nextAlarmAt,
  onConnected,
  onLeft,
  onMessage,
  readAttachment,
  socketsToDrop,
  type Attachment,
  type HostSocket,
} from "../../../functions/_lib/presence-room";

interface Env {
  PRESENCE: DurableObjectNamespace;
}

/**
 * Una sala del laboratorio. WebSocket con hibernación: sin temporizadores
 * en memoria, la pose va en el adjunto y la alarma solo barre inactivos.
 * SQLite porque el plan Free no admite el backend de clave-valor.
 */
export class LabPresence implements DurableObject {
  constructor(private readonly ctx: DurableObjectState) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response(null, { status: 426 });
    }
    if (!acceptConnection(this.ctx.getWebSockets().length).ok) {
      return new Response(null, { status: 503 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    onConnected(adapt(server), Date.now());
    const pending = await this.ctx.storage.getAlarm();
    const at = nextAlarmAt(this.ctx.getWebSockets().length, Date.now());
    if (pending === null && at !== null) await this.ctx.storage.setAlarm(at);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const peers = this.peers();
    const current = peers.find((socket) => socket.token === ws);
    if (!current) return;
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message);
    onMessage(peers, current, raw, Date.now());
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = readAttachment(ws.deserializeAttachment());
    onLeft(
      this.ctx
        .getWebSockets()
        .filter((socket) => socket !== ws)
        .map(adapt),
      attachment,
    );
  }

  async webSocketError(ws: WebSocket): Promise<void> {
    try {
      ws.close(1011, "error");
    } catch {
      // El runtime ya cerró el socket.
    }
  }

  async alarm(): Promise<void> {
    const now = Date.now();
    for (const socket of socketsToDrop(this.peers(), now)) socket.close(1000, "inactivo");
    const at = nextAlarmAt(this.ctx.getWebSockets().length, Date.now());
    if (at !== null) await this.ctx.storage.setAlarm(at);
  }

  private peers(): HostSocket[] {
    return this.ctx.getWebSockets().map(adapt);
  }
}

function adapt(ws: WebSocket): HostSocket {
  return {
    token: ws,
    send(data: string) {
      ws.send(data);
    },
    close(code: number, reason: string) {
      try {
        ws.close(code, reason);
      } catch {
        // Ya estaba cerrado.
      }
    },
    read(): Attachment | null {
      return readAttachment(ws.deserializeAttachment());
    },
    write(value: Attachment) {
      ws.serializeAttachment(value);
    },
  };
}

const ROOM_NAME = /^lab:(?:production|preview:[A-Za-z0-9._-]{1,48})$/;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const room = new URL(request.url).searchParams.get("room") ?? "lab:production";
    if (!ROOM_NAME.test(room)) return new Response(null, { status: 400 });
    return env.PRESENCE.getByName(room).fetch(request);
  },
};
