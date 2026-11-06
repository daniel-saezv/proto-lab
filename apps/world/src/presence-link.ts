import { applyPresenceMessage, planPresenceRename, planPresenceSend, type PoseClock, type PresencePeer, type RenameClock } from "./presence-state";

const PATH = "/api/presence";
const MAX_ATTEMPTS = 5;

export type PresenceLink = {
  sample(x: number, z: number, yaw: number): void;
  /** Pide un rename con el alias que devuelve getName. */
  setName(): void;
  peers(): PresencePeer[];
  stop(): void;
};

/**
 * Sesión efímera de una pestaña. El id lo genera el navegador; no sale de Access.
 * En `?e2e=1` no se llama. Si el binding no está, reintenta unas veces y se queda sola.
 */
export function connectLabPresence(options: {
  pose: () => { x: number; z: number; yaw: number };
  /** Nombre ya saneado; vacío = sin alias. */
  getName: () => string;
  onChange?: (peers: PresencePeer[]) => void;
}): PresenceLink {
  if (typeof WebSocket !== "function" || typeof crypto.randomUUID !== "function") {
    return { sample() {}, setName() {}, peers: () => [], stop() {} };
  }
  const selfId = crypto.randomUUID();
  let peers = new Map<string, PresencePeer>();
  let clock: PoseClock | null = null;
  let renameClock: RenameClock | null = null;
  let lastSentName: string | undefined = undefined;
  let pendingRename = false;
  let socket: WebSocket | null = null;
  let attempt = 0;
  let stopped = false;
  let retry = 0;
  let hereTimer = 0;

  function publish(next: Map<string, PresencePeer>) {
    if (next === peers) return;
    peers = next;
    options.onChange?.([...peers.values()]);
  }

  function send(text: string) {
    if (socket?.readyState === WebSocket.OPEN) socket.send(text);
  }

  function sendRenameIfDue(force: boolean) {
    if (stopped || socket?.readyState !== WebSocket.OPEN || renameClock === null) return;
    const sanitized = options.getName();
    const now = Date.now();
    if (!force && !pendingRename) return;
    const planned = planPresenceRename(lastSentName, sanitized, renameClock, now);
    if (!planned.send) return;
    renameClock = planned.clock;
    if (force || pendingRename) pendingRename = false;
    lastSentName = sanitized === "" ? undefined : sanitized;
    if (sanitized === "") send(JSON.stringify({ type: "rename" }));
    else send(JSON.stringify({ type: "rename", name: sanitized }));
  }

  function open() {
    if (stopped) return;
    const url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}${PATH}`;
    const ws = new WebSocket(url);
    socket = ws;
    ws.addEventListener("open", () => {
      attempt = 0;
      const pose = options.pose();
      const stamp = Date.now();
      clock = { ...pose, at: stamp, hereAt: stamp };
      renameClock = { lastSent: 0 };
      const name = options.getName();
      lastSentName = name === "" ? undefined : name;
      const hello: Record<string, unknown> = {
        type: "hello",
        id: selfId,
        x: pose.x,
        z: pose.z,
        yaw: pose.yaw,
      };
      if (name !== "") hello.name = name;
      send(JSON.stringify(hello));
    });
    ws.addEventListener("message", (event) => {
      if (typeof event.data !== "string") return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      publish(applyPresenceMessage(peers, selfId, parsed));
    });
    ws.addEventListener("close", () => {
      if (socket !== ws) return;
      socket = null;
      renameClock = null;
      lastSentName = undefined;
      publish(new Map());
      if (stopped) return;
      attempt += 1;
      if (attempt > MAX_ATTEMPTS) return;
      const wait = Math.min(8_000, 500 * 2 ** (attempt - 1));
      window.clearTimeout(retry);
      retry = window.setTimeout(open, wait);
    });
  }

  function stop() {
    stopped = true;
    window.clearTimeout(retry);
    window.clearInterval(hereTimer);
    window.removeEventListener("pagehide", stop);
    socket?.close(1000, "adios");
    socket = null;
    publish(new Map());
  }

  hereTimer = window.setInterval(() => {
    if (stopped || socket?.readyState !== WebSocket.OPEN) return;
    const pose = options.pose();
    const planned = planPresenceSend(clock, pose, Date.now());
    if (!planned.kind) {
      sendRenameIfDue(false);
      return;
    }
    clock = planned.last;
    if (planned.kind === "move") send(JSON.stringify({ type: "move", x: pose.x, z: pose.z, yaw: pose.yaw }));
    else send(JSON.stringify({ type: "here" }));
    sendRenameIfDue(false);
  }, 5_000);

  window.addEventListener("pagehide", stop);
  open();

  return {
    sample(x, z, yaw) {
      if (stopped || socket?.readyState !== WebSocket.OPEN) return;
      const planned = planPresenceSend(clock, { x, z, yaw }, Date.now());
      if (!planned.kind) {
        sendRenameIfDue(false);
        return;
      }
      clock = planned.last;
      if (planned.kind === "move") send(JSON.stringify({ type: "move", x, z, yaw }));
      else send(JSON.stringify({ type: "here" }));
      sendRenameIfDue(false);
    },
    setName() {
      pendingRename = true;
      sendRenameIfDue(true);
    },
    peers: () => [...peers.values()],
    stop,
  };
}
