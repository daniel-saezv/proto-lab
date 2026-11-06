/**
 * Sala de presencia del laboratorio. Estado por conexión (pose y reloj),
 * sin correo ni JWT. La sirve un Durable Object con WebSockets en hibernación
 * y, en `pnpm dev`, la misma máquina dentro de Vite.
 *
 * El objeto puede dormirse: no hay `setTimeout` ni `setInterval` aquí.
 * La pose vive en el adjunto del WebSocket, que sobrevive a la hibernación.
 */

export const PRESENCE_LIMITS = {
  /** Una quedada de amigos. Por encima se rechaza el upgrade. */
  maxSockets: 24,
  maxMessageChars: 480,
  /** Alias mostrado en la sala; debe caber en el adjunto y en la UI. */
  nameMaxChars: 24,
  /** 5 Hz. Con el ratio 20:1 de mensajes entrantes cabe en el cupo diario. */
  moveMinMs: 200,
  hereMinMs: 20_000,
  helloGraceMs: 15_000,
  staleMs: 75_000,
  alarmEveryMs: 30_000,
  /** El lobby cabe holgado; fuera de esto la pose se recorta. */
  coordLimit: 40,
} as const;

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type Attachment = {
  id: string;
  x: number;
  z: number;
  yaw: number;
  /** Vacío si no hay alias válido. */
  name: string;
  seen: number;
  moveAt: number;
  hereAt: number;
  /** Misma ventana que here; rechaza rename demasiado seguido. */
  renameAt: number;
  opened: number;
};

export type PeerPose = {
  id: string;
  x: number;
  z: number;
  yaw: number;
  /** Solo en welcome, join, rename y move no lleva nombre. */
  name?: string;
};

export type HostSocket = {
  /** Identidad estable del transporte, no del envoltorio. */
  readonly token: object;
  send(data: string): void;
  close(code: number, reason: string): void;
  read(): Attachment | null;
  write(value: Attachment): void;
};

export function isSessionId(value: string): boolean {
  return SESSION_ID.test(value);
}

/**
 * Una sala por entorno. Producción y cada preview no se mezclan.
 * La rama la pone Pages (`CF_PAGES_BRANCH`); el cliente no la elige.
 */
export function presenceRoomName(branch: string | undefined): string {
  const raw = (branch ?? "").trim();
  if (raw === "" || raw === "main") return "lab:production";
  const safe = raw
    .replace(/\.\.+/g, "")
    .replace(/[^A-Za-z0-9._-]/g, "")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 48);
  if (!safe) return "lab:preview:rama";
  return `lab:preview:${safe}`;
}

export function acceptConnection(openCount: number): { ok: true } | { ok: false; error: "lleno" } {
  if (openCount >= PRESENCE_LIMITS.maxSockets) return { ok: false, error: "lleno" };
  return { ok: true };
}

/** Siguiente alarma, o ninguna si la sala está vacía. */
export function nextAlarmAt(openCount: number, now: number): number | null {
  if (openCount <= 0) return null;
  return now + PRESENCE_LIMITS.alarmEveryMs;
}

export function readAttachment(value: unknown): Attachment | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (typeof row.seen !== "number" || !Number.isFinite(row.seen)) return null;
  if (typeof row.opened !== "number" || !Number.isFinite(row.opened)) return null;
  const id = typeof row.id === "string" ? row.id : "";
  if (id !== "" && !isSessionId(id)) return null;
  const rawName = row.name;
  const parsedName = parseNameField(rawName);
  const nameStored = parsedName.ok ? parsedName.value : "";
  return {
    id,
    x: finite(row.x, 0),
    z: finite(row.z, 0),
    yaw: finite(row.yaw, 0),
    name: nameStored,
    seen: row.seen,
    moveAt: finite(row.moveAt, 0),
    hereAt: finite(row.hereAt, 0),
    renameAt: finite(row.renameAt, 0),
    opened: row.opened,
  };
}

export function onConnected(socket: HostSocket, now: number): void {
  socket.write({
    id: "",
    x: 0,
    z: 1.7,
    yaw: 0,
    name: "",
    seen: now,
    moveAt: 0,
    hereAt: 0,
    renameAt: 0,
    opened: now,
  });
}

export function onMessage(all: readonly HostSocket[], current: HostSocket, raw: string, now: number): void {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > PRESENCE_LIMITS.maxMessageChars) {
    current.close(1009, "mensaje");
    return;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    current.close(1003, "json");
    return;
  }
  const att = current.read() ?? blank(now);
  if (!att.id) {
    const hello = parseHello(parsed);
    if (!hello) {
      current.close(1008, "hola");
      return;
    }
    if (all.some((socket) => socket.token !== current.token && socket.read()?.id === hello.id)) {
      current.close(1008, "id");
      return;
    }
    const nameField = parseNameField((parsed as Record<string, unknown>).name);
    const next: Attachment = { ...att, ...hello, name: nameField.ok ? nameField.value : "", seen: now };
    current.write(next);
    current.send(JSON.stringify({ type: "welcome", self: hello.id, peers: poses(all, current) }));
    sendOthers(all, current, { type: "join", peer: poseOf(next) });
    return;
  }
  if (!parsed || typeof parsed !== "object") return;
  const type = (parsed as { type?: unknown }).type;
  if (type === "rename") {
    const nameField = parseNameField((parsed as Record<string, unknown>).name);
    if (!nameField.ok) {
      current.write({ ...att, name: "", seen: now, renameAt: now });
      sendOthers(all, current, { type: "rename", id: att.id, name: "" });
      return;
    }
    if (att.renameAt !== 0 && now - att.renameAt < PRESENCE_LIMITS.hereMinMs) return;
    current.write({ ...att, name: nameField.value, seen: now, renameAt: now });
    sendOthers(all, current, { type: "rename", id: att.id, name: nameField.value });
    return;
  }
  if (type === "here") {
    if (att.hereAt !== 0 && now - att.hereAt < PRESENCE_LIMITS.hereMinMs) return;
    current.write({ ...att, seen: now, hereAt: now });
    return;
  }
  if (type !== "move") return;
  const move = parseMove(parsed);
  if (!move) return;
  if (att.moveAt !== 0 && now - att.moveAt < PRESENCE_LIMITS.moveMinMs) return;
  const next: Attachment = { ...att, ...move, seen: now, moveAt: now };
  current.write(next);
  sendOthers(all, current, { type: "move", peer: peerMoveOnly(next) });
}

export function onLeft(others: readonly HostSocket[], attachment: Attachment | null): void {
  if (!attachment?.id) return;
  const text = JSON.stringify({ type: "leave", id: attachment.id });
  for (const socket of others) {
    if (!socket.read()?.id) continue;
    socket.send(text);
  }
}

/** Conexiones sin hola o sin señal dentro del plazo. Quien llama las cierra. */
export function socketsToDrop(all: readonly HostSocket[], now: number): HostSocket[] {
  const doomed: HostSocket[] = [];
  for (const socket of all) {
    const att = socket.read();
    if (!att) {
      doomed.push(socket);
      continue;
    }
    if (!att.id && now - att.opened > PRESENCE_LIMITS.helloGraceMs) doomed.push(socket);
    else if (att.id && now - att.seen > PRESENCE_LIMITS.staleMs) doomed.push(socket);
  }
  return doomed;
}

export type MemoryLink = {
  send(data: string): void;
  close(code: number, reason: string): void;
};

export type MemorySession = {
  message(raw: string): void;
  close(): void;
};

/**
 * Sala en un solo proceso. La usan los tests y el servidor de `pnpm dev`.
 * El Durable Object no la usa: tras hibernar no hay memoria, solo adjuntos.
 */
export function createMemoryPresence(now: () => number = Date.now) {
  const sockets: MemorySocket[] = [];

  function live(): MemorySocket[] {
    return sockets.filter((socket) => !socket.gone);
  }

  function announce(socket: MemorySocket): void {
    if (socket.announced) return;
    socket.announced = true;
    socket.gone = true;
    onLeft(
      live(),
      socket.read(),
    );
  }

  return {
    connect(link: MemoryLink): MemorySession {
      const gate = acceptConnection(live().length);
      if (!gate.ok) {
        link.close(1013, gate.error);
        return { message() {}, close() {} };
      }
      const socket = createMemorySocket(link, announce);
      sockets.push(socket);
      onConnected(socket, now());
      return {
        message(raw: string) {
          if (socket.gone) return;
          onMessage(live(), socket, raw, now());
        },
        close() {
          announce(socket);
        },
      };
    },
    sweep(): void {
      for (const socket of socketsToDrop(live(), now())) socket.close(1000, "inactivo");
    },
    count(): number {
      return live().length;
    },
  };
}

type MemorySocket = HostSocket & { gone: boolean; announced: boolean };

function createMemorySocket(link: MemoryLink, announce: (socket: MemorySocket) => void): MemorySocket {
  let att: Attachment | null = null;
  const socket: MemorySocket = {
    token: {},
    gone: false,
    announced: false,
    send(data: string) {
      if (!socket.gone) link.send(data);
    },
    close(code: number, reason: string) {
      if (socket.announced) return;
      announce(socket);
      link.close(code, reason);
    },
    read: () => att,
    write(value: Attachment) {
      att = value;
    },
  };
  return socket;
}

function blank(now: number): Attachment {
  return { id: "", x: 0, z: 1.7, yaw: 0, name: "", seen: now, moveAt: 0, hereAt: 0, renameAt: 0, opened: now };
}

function poses(all: readonly HostSocket[], except: HostSocket): PeerPose[] {
  const peers: PeerPose[] = [];
  for (const socket of all) {
    if (socket.token === except.token) continue;
    const att = socket.read();
    if (!att?.id) continue;
    peers.push(poseOf(att));
  }
  return peers;
}

function sendOthers(
  all: readonly HostSocket[],
  except: HostSocket,
  message: { type: "join"; peer: PeerPose } | { type: "move"; peer: Pick<PeerPose, "id" | "x" | "z" | "yaw"> } | { type: "rename"; id: string; name: string },
): void {
  const text = JSON.stringify(message);
  for (const socket of all) {
    if (socket.token === except.token) continue;
    if (!socket.read()?.id) continue;
    socket.send(text);
  }
}

function poseOf(att: Attachment): PeerPose {
  const p: PeerPose = { id: att.id, x: att.x, z: att.z, yaw: att.yaw };
  if (att.name !== "") p.name = att.name;
  return p;
}

function peerMoveOnly(att: Attachment): Pick<PeerPose, "id" | "x" | "z" | "yaw"> {
  return { id: att.id, x: att.x, z: att.z, yaw: att.yaw };
}

function parseHello(value: unknown): Pick<Attachment, "id" | "x" | "z" | "yaw"> | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  if (row.type !== "hello" || typeof row.id !== "string" || !isSessionId(row.id)) return null;
  const pose = parsePose(row);
  if (!pose) return null;
  return { id: row.id.toLowerCase(), ...pose };
}

function parseMove(value: unknown): Pick<Attachment, "x" | "z" | "yaw"> | null {
  const row = value as Record<string, unknown>;
  return parsePose(row);
}

function parsePose(row: Record<string, unknown>): Pick<Attachment, "x" | "z" | "yaw"> | null {
  const x = clampCoord(row.x);
  const z = clampCoord(row.z);
  const yaw = clampYaw(row.yaw);
  if (x === null || z === null || yaw === null) return null;
  return { x, z, yaw };
}

function clampCoord(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const limit = PRESENCE_LIMITS.coordLimit;
  return Math.min(limit, Math.max(-limit, value));
}

function clampYaw(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  let yaw = value % (Math.PI * 2);
  if (yaw > Math.PI) yaw -= Math.PI * 2;
  if (yaw < -Math.PI) yaw += Math.PI * 2;
  return yaw;
}

function finite(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * Acepta undefined (sin nombre), cadena vacía o espacios (sin nombre),
 * u otra cadena recortada y sin caracteres de control ni @ (no correos).
 */
export function parseNameField(value: unknown): { ok: true; value: string } | { ok: false } {
  if (value === undefined || value === null) return { ok: true, value: "" };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();
  if (trimmed === "") return { ok: true, value: "" };
  if (trimmed.includes("@")) return { ok: false };
  let out = "";
  for (const ch of trimmed) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code === 127) continue;
    out += ch;
    if (out.length >= PRESENCE_LIMITS.nameMaxChars) break;
  }
  const finalName = out.trim();
  return { ok: true, value: finalName };
}
